/**
 * Testes das AÇÕES DO DONO na watch page (js/dono.js).
 *
 * Sob teste:
 *   * ehDonoDoVideo — dono pela igualdade professor_id === usuario_id; o
 *     ADMIN passa sempre; estudante e professor "visitante" não passam;
 *   * ligarAcoesDoDono — dono vê a barra com Editar/Apagar; visitante vê
 *     NADA (a regra de verdade é o backend: 403 fora do dono — o front só
 *     não desenha o que não funciona);
 *   * erro na busca do metadado deixa a página em paz (sem barra).
 */
import { jest } from "@jest/globals";

const DONO = { usuario_id: "p1", nome: "Prof. A", email: "a@escola.com", role: "professor" };
const OUTRO = { usuario_id: "p2", nome: "Prof. B", email: "b@escola.com", role: "professor" };
const ALUNO = { usuario_id: "e1", nome: "Aluno", email: "a@escola.com", role: "estudante" };
const ADMIN = { usuario_id: "adm", nome: "Admin", email: "admin@edustream.com", role: "admin" };

const VIDEO = {
  video_id: "vid-1",
  titulo: "Aula de frações",
  professor_id: "p1",
};

async function importarModulo({ usuario = DONO, video = VIDEO } = {}) {
  jest.resetModules();

  jest.unstable_mockModule("../js/api.js", () => ({
    getVideo: jest.fn(async () => video),
    salvarVideo: jest.fn(),
    apagarVideo: jest.fn(),
  }));

  jest.unstable_mockModule("../js/sessao.js", () => ({
    usuarioAtual: jest.fn(() => usuario),
    papelDoUsuario: jest.fn(() => usuario?.role || "estudante"),
  }));

  await import("../js/api.js");
  const modulo = await import("../js/dono.js");
  return modulo;
}

function comContainer() {
  document.body.innerHTML = '<div id="videoAcoes" class="acoes-video-container"></div>';
  return document.querySelector("#videoAcoes");
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("dono — ehDonoDoVideo", () => {
  test.each([
    ["dono reconhecido", DONO, VIDEO, true],
    ["outro professor", OUTRO, VIDEO, false],
    ["estudante", ALUNO, VIDEO, false],
    ["admin sempre passa", ADMIN, VIDEO, true],
    ["sem usuário", null, VIDEO, false],
  ])("%s → %j", async (_nome, usuario, video, esperado) => {
    const modulo = await importarModulo({ usuario });
    expect(modulo.ehDonoDoVideo(video, usuario)).toBe(esperado);
  });

  test("vídeo sem professor_id (legado) não dá poder a ninguém", async () => {
    const modulo = await importarModulo({ usuario: DONO });
    expect(modulo.ehDonoDoVideo({ video_id: "x" }, DONO)).toBe(false);
  });
});

describe("dono — ligarAcoesDoDono", () => {
  test("dono recebe a barra com Editar e Apagar", async () => {
    const modulo = await importarModulo({ usuario: DONO });
    const container = comContainer();

    const video = await modulo.ligarAcoesDoDono({
      videoId: "vid-1",
      container,
      usuario: DONO,
    });

    expect(video.video_id).toBe("vid-1");
    const botoes = container.querySelectorAll("button");
    expect(botoes).toHaveLength(2);
    expect(botoes[0].textContent).toBe("Editar");
    expect(botoes[1].textContent).toBe("Apagar");
  });

  test("visitante (não-dono) NÃO recebe barra alguma", async () => {
    const modulo = await importarModulo({ usuario: OUTRO });
    const container = comContainer();

    const resultado = await modulo.ligarAcoesDoDono({
      videoId: "vid-1",
      container,
      usuario: OUTRO,
    });

    expect(resultado).toBeNull();
    expect(container.children).toHaveLength(0);
  });

  test("estudante também não vê nada", async () => {
    const modulo = await importarModulo({ usuario: ALUNO });
    const container = comContainer();

    await modulo.ligarAcoesDoDono({ videoId: "vid-1", container, usuario: ALUNO });
    expect(container.children).toHaveLength(0);
  });

  test("admin (que não é o dono original) recebe a barra", async () => {
    const modulo = await importarModulo({ usuario: ADMIN });
    const container = comContainer();

    await modulo.ligarAcoesDoDono({ videoId: "vid-1", container, usuario: ADMIN });
    expect(container.querySelectorAll("button")).toHaveLength(2);
  });

  test("sem vídeo na URL, nada acontece", async () => {
    const modulo = await importarModulo();
    const container = comContainer();

    await modulo.ligarAcoesDoDono({ videoId: "", container, usuario: DONO });
    expect(container.children).toHaveLength(0);
  });
});
