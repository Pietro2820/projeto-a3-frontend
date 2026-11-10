/**
 * Testes do PAINEL DO ADMIN (js/painel-admin.js).
 *
 * Sob teste:
 *   * gerarSenhaTemporaria — senha forte de 16 caracteres (comodidade do
 *     admin; a troca no 1º acesso é que é a regra);
 *   * criar professor — chama POST /admin/professores com o payload certo e
 *     mostra e-mail + senha temporária UMA vez (o admin copia e passa em
 *     pessoa); 409 (e-mail duplicado) e 403 (não-admin) têm mensagem;
 *   * lista de usuários — badges de papel e dados públicos (sem senha_hash:
 *     quem garante é o backend, o front só desenha);
 *   * visão geral — cartões de totais; o cartão de estudos NÃO nasce quando
 *     o backend manda o bloco null (dias_estudo indisponível);
 *   * moderação — catálogo completo com dono, badge de status e apagar com
 *     confirm (rota de dono reaproveitada — admin passa por herança);
 *   * guard recusa (não-admin) → nenhuma seção é pedida.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const paginaHtml = readFileSync(
  fileURLToPath(new URL("../painel-admin.html", import.meta.url)),
  "utf8"
);

const ADMIN = { usuario_id: "adm", nome: "Admin", email: "admin@edustream.com", role: "admin" };

const USUARIOS = [
  { usuario_id: "1", nome: "Admin", email: "admin@edustream.com", role: "admin", criado_em: "2026-06-01T00:00:00+00:00" },
  { usuario_id: "2", nome: "Prof. Ana", email: "ana@escola.com", role: "professor", criado_em: "2026-06-02T00:00:00+00:00" },
  { usuario_id: "3", nome: "Aluno", email: "aluno@escola.com", role: "estudante", criado_em: "2026-06-03T00:00:00+00:00" },
];

const RESUMO = {
  usuarios: { total: 3, admins: 1, professores: 1, estudantes: 1 },
  videos: { total: 3, prontos: 2, processando: 0, pendentes: 1, falhos: 0 },
  estudos: { dias_registrados: 12, alunos_ativos: 2 },
};

const VIDEOS_ADMIN = [
  {
    video_id: "v-1",
    titulo: "Aula da Ana",
    categoria: "Matemática",
    status: "completed",
    professor_id: "2",
    dono: { nome: "Prof. Ana", email: "ana@escola.com" },
    views: 7,
    criado_em: "2026-06-05T00:00:00+00:00",
  },
  {
    video_id: "v-2",
    titulo: "Vídeo órfão",
    categoria: null,
    status: "pending",
    professor_id: "id-inexistente",
    dono: null,
    views: 0,
    criado_em: null,
  },
];

function montarPagina() {
  const pagina = new DOMParser().parseFromString(paginaHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;
}

async function importarModulo({
  usuario = ADMIN,
  usuarios = USUARIOS,
  resumo = RESUMO,
  videos = VIDEOS_ADMIN,
  erroResumo = null,
} = {}) {
  jest.resetModules();

  jest.unstable_mockModule("../js/api.js", () => ({
    criarProfessor: jest.fn(),
    listarUsuarios: jest.fn(async () => ({ usuarios, total: usuarios.length })),
    obterResumoAdmin: jest.fn(async () => {
      if (erroResumo) throw erroResumo;
      return resumo;
    }),
    listarVideosAdmin: jest.fn(async () => ({ videos, total: videos.length })),
    apagarVideo: jest.fn(async () => ({ mensagem: "Vídeo apagado." })),
  }));

  jest.unstable_mockModule("../js/sessao.js", () => ({
    exigirPapel: jest.fn(() => usuario),
  }));

  const api = await import("../js/api.js");
  const modulo = await import("../js/painel-admin.js");
  return { modulo, api };
}

function preencher({ nome = "Prof. Ana", email = "ana@escola.com", senha = "Temporaria#2026" } = {}) {
  document.querySelector("#profNome").value = nome;
  document.querySelector("#profEmail").value = email;
  document.querySelector("#profSenha").value = senha;
}

async function submeter() {
  document.querySelector("#formProfessor").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true })
  );
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  montarPagina();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("painel-admin — senha temporária", () => {
  test("gerarSenhaTemporaria devolve 16 caracteres diversificados", async () => {
    const { modulo } = await importarModulo();
    const senha = modulo.gerarSenhaTemporaria();

    expect(senha).toHaveLength(16);
    expect(/[a-z]/.test(senha)).toBe(true);
    expect(/[A-Z0-9!@#$%&*]/.test(senha)).toBe(true);
    expect(modulo.gerarSenhaTemporaria()).not.toBe(senha); // sorteio de verdade
  });

  test("o botão Gerar preenche o campo", async () => {
    await importarModulo();
    document.querySelector("#gerarSenha").click();
    expect(document.querySelector("#profSenha").value).toHaveLength(16);
  });
});

describe("painel-admin — criar professor", () => {
  test("chama a API com o payload certo e mostra as credenciais uma vez", async () => {
    const { api } = await importarModulo();
    api.criarProfessor.mockResolvedValue({
      usuario: { role: "professor", primeiro_acesso: true },
      mensagem: "Conta de professor criada.",
    });

    preencher();
    await submeter();

    expect(api.criarProfessor).toHaveBeenCalledWith({
      nome: "Prof. Ana",
      email: "ana@escola.com",
      senha_temporaria: "Temporaria#2026",
    });
    const status = document.querySelector("#profStatus").textContent;
    expect(status).toContain("ana@escola.com");
    expect(status).toContain("Temporaria#2026");
  });

  test("criar professor recarrega resumo e lista de usuários", async () => {
    const { api } = await importarModulo();
    api.criarProfessor.mockResolvedValue({
      usuario: { role: "professor" },
      mensagem: "Conta de professor criada.",
    });

    preencher();
    await submeter();

    // O painel inteiro respira com os números novos: 3 cargas + a recarga.
    expect(api.listarUsuarios).toHaveBeenCalledTimes(2);
    expect(api.obterResumoAdmin).toHaveBeenCalledTimes(2);
  });

  test("validações do cliente (nome, e-mail, senha) não deixam chamar a API", async () => {
    const { api } = await importarModulo();

    preencher({ nome: "A" }); // nome curto
    await submeter();
    expect(api.criarProfessor).not.toHaveBeenCalled();

    preencher({ email: "sem-arroba" }); // e-mail inválido
    await submeter();
    expect(api.criarProfessor).not.toHaveBeenCalled();

    preencher({ senha: "curta" }); // senha curta
    await submeter();
    expect(api.criarProfessor).not.toHaveBeenCalled();
  });

  test("409 (e-mail duplicado) tem mensagem própria", async () => {
    const { api } = await importarModulo();
    api.criarProfessor.mockRejectedValue({ status: 409 });

    preencher();
    await submeter();

    expect(document.querySelector("#profStatus").textContent).toContain("já tem uma conta");
  });

  test("403 (não-admin) avisa que só admin cria", async () => {
    const { api } = await importarModulo();
    api.criarProfessor.mockRejectedValue({ status: 403 });

    preencher();
    await submeter();

    expect(document.querySelector("#profStatus").textContent).toContain("administradores");
  });
});

describe("painel-admin — visão geral", () => {
  test("renderiza cartões de usuários, vídeos e estudos", async () => {
    await importarModulo();

    const cartoes = document.querySelectorAll("#gradeResumo .stat-card");
    expect(cartoes).toHaveLength(3);

    const textos = [...cartoes].map((c) => c.textContent);
    expect(textos[0]).toContain("3"); // usuários
    expect(textos[0]).toContain("1 professores");
    expect(textos[1]).toContain("3"); // vídeos
    expect(textos[1]).toContain("2 prontos");
    expect(textos[2]).toContain("12"); // dias de estudo
    expect(textos[2]).toContain("Dias de estudo");
  });

  test("bloco estudos nulo omite o cartão sem quebrar o resto", async () => {
    await importarModulo({ resumo: { ...RESUMO, estudos: null } });

    const cartoes = document.querySelectorAll("#gradeResumo .stat-card");
    expect(cartoes).toHaveLength(2);
    expect(cartoes[0].textContent).toContain("Usuários");
    expect(cartoes[1].textContent).toContain("Vídeos");
  });

  test("erro da API mostra aviso e esvazia a grade", async () => {
    await importarModulo({ erroResumo: { status: 503 } });

    expect(document.querySelector("#gradeResumo").children).toHaveLength(0);
    const aviso = document.querySelector("#resumoAviso");
    expect(aviso.hidden).toBe(false);
    expect(aviso.textContent).toContain("Não foi possível");
  });
});

describe("painel-admin — lista de usuários", () => {
  test("renderiza nome, e-mail e selo de papel", async () => {
    await importarModulo();

    const linhas = document.querySelectorAll("#corpoUsuarios tr");
    expect(linhas).toHaveLength(3);
    expect(linhas[1].textContent).toContain("Prof. Ana");
    expect(linhas[1].textContent).toContain("Professor");
    expect(linhas[2].textContent).toContain("Estudante");
  });

  test("guard recusando (não-admin) nem pede as seções", async () => {
    const { api } = await importarModulo({ usuario: null });

    expect(api.listarUsuarios).not.toHaveBeenCalled();
    expect(api.obterResumoAdmin).not.toHaveBeenCalled();
    expect(api.listarVideosAdmin).not.toHaveBeenCalled();
    expect(document.querySelector("#tabelaUsuarios").hidden).toBe(true);
    expect(document.querySelector("#tabelaVideos").hidden).toBe(true);
  });
});

describe("painel-admin — moderação de vídeos", () => {
  test("renderiza catálogo completo com dono, status e views", async () => {
    await importarModulo();

    const linhas = document.querySelectorAll("#corpoVideos tr");
    expect(linhas).toHaveLength(2);

    expect(linhas[0].textContent).toContain("Aula da Ana");
    expect(linhas[0].textContent).toContain("Prof. Ana (ana@escola.com)");
    expect(linhas[0].textContent).toContain("Pronto");
    expect(linhas[0].textContent).toContain("7");

    // Vídeo órfão: dono null vira "Sem dono" — a linha segue listada.
    expect(linhas[1].textContent).toContain("Vídeo órfão");
    expect(linhas[1].textContent).toContain("Sem dono");
    expect(linhas[1].textContent).toContain("Na fila");

    const link = linhas[0].querySelector("a.btn-acao");
    expect(link.getAttribute("href")).toBe("index.html?video=v-1");
  });

  test("apagar pede confirmação, chama a rota de dono e recarrega", async () => {
    const { api } = await importarModulo();
    jest.spyOn(window, "confirm").mockReturnValue(true);

    const botao = document.querySelector("#corpoVideos button.btn-acao-perigo");
    botao.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(window.confirm).toHaveBeenCalledWith(
      'Apagar "Aula da Ana"? Essa ação não tem volta.'
    );
    expect(api.apagarVideo).toHaveBeenCalledWith("v-1");
    // Recarga da tabela + do resumo (números da visão geral atualizados).
    expect(api.listarVideosAdmin).toHaveBeenCalledTimes(2);
    expect(api.obterResumoAdmin).toHaveBeenCalledTimes(2);
  });

  test("recusar o confirm não chama a API", async () => {
    const { api } = await importarModulo();
    jest.spyOn(window, "confirm").mockReturnValue(false);

    document.querySelector("#corpoVideos button.btn-acao-perigo").click();
    await Promise.resolve();
    await Promise.resolve();

    expect(api.apagarVideo).not.toHaveBeenCalled();
    expect(api.listarVideosAdmin).toHaveBeenCalledTimes(1);
  });

  test("erro ao apagar mostra alerta e mantém a lista", async () => {
    const { api } = await importarModulo();
    jest.spyOn(window, "confirm").mockReturnValue(true);
    jest.spyOn(window, "alert").mockImplementation(() => {});
    api.apagarVideo.mockRejectedValue({ status: 500 });

    document.querySelector("#corpoVideos button.btn-acao-perigo").click();
    await Promise.resolve();
    await Promise.resolve();

    expect(window.alert).toHaveBeenCalled();
    expect(api.listarVideosAdmin).toHaveBeenCalledTimes(1);
  });
});
