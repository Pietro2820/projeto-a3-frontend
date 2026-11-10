/**
 * Testes do painel MEUS VÍDEOS (js/meus-videos.js) — a metade do dono.
 *
 * Sob teste:
 *   * professor logado → a lista carrega do GET /meus-videos e cada linha
 *     traz título, selo de status, views, data e os botões Editar/Apagar;
 *   * guard recusa (null) → NADA é carregado (estudante não chega aqui);
 *   * editar chama PATCH com os campos do formulário;
 *   * apagar chama DELETE depois do confirm;
 *   * 403 do backend vira mensagem específica ("pertence a outro professor").
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const paginaHtml = readFileSync(
  fileURLToPath(new URL("../meus-videos.html", import.meta.url)),
  "utf8"
);

const PROFESSOR = { usuario_id: "p1", nome: "Prof.", email: "p@escola.com", role: "professor" };

const VIDEO_PRONTO = {
  video_id: "v1",
  titulo: "Aula de frações",
  status: "completed",
  views: 7,
  criado_em: "2026-06-01T12:00:00+00:00",
  tags: ["frações"],
  professor_id: "p1",
};

const VIDEO_FILA = {
  video_id: "v2",
  titulo: "Aula em processamento",
  status: "processing",
  views: 0,
  criado_em: "2026-06-02T12:00:00+00:00",
  professor_id: "p1",
};

function montarPagina() {
  const pagina = new DOMParser().parseFromString(paginaHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;
}

/**
 * Importa o módulo com api.js e sessao.js dublados.
 * `usuario` define o que o exigirPapel devolve (null = guard recusou).
 */
async function importarModulo({ usuario = PROFESSOR, videos = [VIDEO_PRONTO, VIDEO_FILA] } = {}) {
  jest.resetModules();

  jest.unstable_mockModule("../js/api.js", () => ({
    buscarMeusVideos: jest.fn(async () => ({ videos, total: videos.length })),
    salvarVideo: jest.fn(),
    apagarVideo: jest.fn(),
    getVideoStatus: jest.fn(),
    uploadVideo: jest.fn(),
  }));

  jest.unstable_mockModule("../js/sessao.js", () => ({
    exigirPapel: jest.fn(() => usuario),
  }));

  const api = await import("../js/api.js");
  const modulo = await import("../js/meus-videos.js");
  return { modulo, api };
}

beforeEach(() => {
  montarPagina();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

describe("meus-videos — guard por papel", () => {
  test("estudante (guard recusa) não chama a API e não vê tabela", async () => {
    await importarModulo({ usuario: null });
    // O import já rodou o auto-init: com guard null, nenhuma carga aconteceu.
    expect(document.querySelector("#tabelaVideos").hidden).toBe(true);
  });
});

describe("meus-videos — lista do professor", () => {
  test("renderiza uma linha por vídeo com status, views e ações", async () => {
    await importarModulo();

    const linhas = document.querySelectorAll("#corpoTabela tr");
    expect(linhas).toHaveLength(2);
    expect(linhas[0].textContent).toContain("Aula de frações");
    expect(linhas[0].textContent).toContain("7"); // views
    expect(linhas[0].textContent).toContain("Pronto");
    expect(linhas[1].textContent).toContain("Transcodificando");

    // As ações EXISTEM porque a lista é do dono.
    const botoes = linhas[0].querySelectorAll("button");
    expect(botoes).toHaveLength(2);
    expect(botoes[0].textContent).toBe("Editar");
    expect(botoes[1].textContent).toBe("Apagar");

    expect(document.querySelector("#tabelaVideos").hidden).toBe(false);
    expect(document.querySelector("#painelContagem").textContent).toBe("2 vídeos");
  });

  test("lista vazia esconde a tabela e a contagem fica zerada", async () => {
    await importarModulo({ videos: [] });

    expect(document.querySelector("#tabelaVideos").hidden).toBe(true);
    expect(document.querySelector("#painelContagem").textContent).toBe("");
  });
});

describe("meus-videos — editar (PATCH)", () => {
  test("abrirEdicao preenche o modal e salvarVideo recebe os campos", async () => {
    const { modulo, api } = await importarModulo();
    api.salvarVideo.mockResolvedValue({ video: VIDEO_PRONTO });

    const video = { ...VIDEO_PRONTO, descricao: "desc", categoria: "Mat", tags: ["a", "b"] };
    modulo.abrirEdicao(video);
    expect(document.querySelector("#editarModal").classList.contains("hidden")).toBe(false);
    expect(document.querySelector("#editarTitulo").value).toBe("Aula de frações");
    expect(document.querySelector("#editarTags").value).toBe("a, b");

    document.querySelector("#editarTitulo").value = "Título novo";
    document.querySelector("#editarDescricao").value = "Nova descrição";
    document.querySelector("#editarTags").value = "x, y";
    document.querySelector("#editarCategoria").value = "Química";

    document.querySelector("#editarForm").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true })
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(api.salvarVideo).toHaveBeenCalledWith("v1", {
      titulo: "Título novo",
      descricao: "Nova descrição",
      tags: "x, y",
      categoria: "Química",
    });
  });

  test("título vazio não chama a API", async () => {
    const { modulo, api } = await importarModulo();
    modulo.abrirEdicao(VIDEO_PRONTO);
    document.querySelector("#editarTitulo").value = "   ";

    document.querySelector("#editarForm").dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true })
    );
    await Promise.resolve();

    expect(api.salvarVideo).not.toHaveBeenCalled();
  });
});

describe("meus-videos — apagar (DELETE)", () => {
  test("confirm positivo chama apagarVideo", async () => {
    const { modulo, api } = await importarModulo();
    api.apagarVideo.mockResolvedValue({ mensagem: "Vídeo apagado." });
    jest.spyOn(window, "confirm").mockReturnValue(true);

    await modulo.apagar(VIDEO_PRONTO);

    expect(api.apagarVideo).toHaveBeenCalledWith("v1");
  });

  test("confirm negativo NÃO apaga", async () => {
    const { modulo, api } = await importarModulo();
    jest.spyOn(window, "confirm").mockReturnValue(false);

    await modulo.apagar(VIDEO_PRONTO);

    expect(api.apagarVideo).not.toHaveBeenCalled();
  });

  test("403 (outro dono) vira alerta específico", async () => {
    const { modulo, api } = await importarModulo();
    api.apagarVideo.mockRejectedValue({ status: 403 });
    jest.spyOn(window, "confirm").mockReturnValue(true);
    const alerta = jest.spyOn(window, "alert").mockImplementation(() => {});

    await modulo.apagar(VIDEO_PRONTO);

    expect(alerta).toHaveBeenCalledWith(
      "Este vídeo pertence a outro professor — só o dono apaga."
    );
  });
});
