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
 *   * guard recusa (não-admin) → a lista nem é pedida.
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

function montarPagina() {
  const pagina = new DOMParser().parseFromString(paginaHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;
}

async function importarModulo({ usuario = ADMIN, usuarios = USUARIOS } = {}) {
  jest.resetModules();

  jest.unstable_mockModule("../js/api.js", () => ({
    criarProfessor: jest.fn(),
    listarUsuarios: jest.fn(async () => ({ usuarios, total: usuarios.length })),
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

describe("painel-admin — lista de usuários", () => {
  test("renderiza nome, e-mail e selo de papel", async () => {
    await importarModulo();

    const linhas = document.querySelectorAll("#corpoUsuarios tr");
    expect(linhas).toHaveLength(3);
    expect(linhas[1].textContent).toContain("Prof. Ana");
    expect(linhas[1].textContent).toContain("Professor");
    expect(linhas[2].textContent).toContain("Estudante");
  });

  test("guard recusando (não-admin) nem pede a lista", async () => {
    const { api } = await importarModulo({ usuario: null });

    expect(api.listarUsuarios).not.toHaveBeenCalled();
    expect(document.querySelector("#tabelaUsuarios").hidden).toBe(true);
  });
});
