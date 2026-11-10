/**
 * Testes da tela TROCAR SENHA (js/trocar-senha.js) — o passo que libera a
 * conta criada pelo admin (1º acesso).
 *
 * Contrato com o backend (POST /trocar-senha):
 *   * sucesso → entrar() atualiza a cópia local da sessão (com o usuario
 *     devolvido, primeiro_acesso=false) e irParaDestino() roteia por papel;
 *   * 401 = senha atual errada → aviso claro, sem entrar();
 *   * 422 = senha nova fraca → aviso das regras;
 *   * validações do cliente (mínimo 8, confirmação igual, senha atual
 *     preenchida) BLOQUEIAM o envio — a API nem é chamada.
 *
 * js/sessao.js é dublado por módulo (padrão do projeto): aqui se testa o
 * contrato entre a tela e a sessão; os guardas têm suíte própria
 * (tests/papeis.guarda.test.js).
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const paginaHtml = readFileSync(
  fileURLToPath(new URL("../trocar-senha.html", import.meta.url)),
  "utf8"
);

const USUARIO_ATUALIZADO = {
  usuario_id: "b0000000-0000-0000-0000-000000000001",
  nome: "Prof. Novo",
  email: "novo@escola.com",
  role: "professor",
  primeiro_acesso: false,
};

function montarPagina() {
  const pagina = new DOMParser().parseFromString(paginaHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;
}

/** Importa o módulo com a sessão dublada; devolve os dublês. */
async function importarModulo() {
  jest.resetModules();
  jest.unstable_mockModule("../js/sessao.js", () => ({
    entrar: jest.fn(),
    irParaDestino: jest.fn(),
  }));
  const sessao = await import("../js/sessao.js");
  const modulo = await import("../js/trocar-senha.js");
  return { modulo, ...sessao };
}

function preencher({ atual = "Temporaria#2026", nova = "NovaSenha#2026", confirmar = nova } = {}) {
  document.querySelector("#senhaAtual").value = atual;
  document.querySelector("#novaSenha").value = nova;
  document.querySelector("#confirmarSenha").value = confirmar;
}

async function submeter() {
  document.querySelector("#trocarForm").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true })
  );
  // setTimeout(0) drena TODAS as microtasks da cadeia async (fetch → json →
  // entrar/irParaDestino) antes das asserções.
  await new Promise((resolver) => setTimeout(resolver, 0));
}

let fetchMock;

beforeEach(() => {
  montarPagina();
  fetchMock = jest.fn();
  global.fetch = fetchMock;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
  delete global.fetch;
});

describe("trocar-senha — envio válido", () => {
  test("chama POST /trocar-senha com os campos certos e atualiza a sessão", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ usuario: USUARIO_ATUALIZADO, mensagem: "Senha trocada com sucesso." }),
    });
    const { entrar, irParaDestino } = await importarModulo();

    preencher();
    await submeter();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opcoes] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/trocar-senha");
    expect(opcoes.method).toBe("POST");
    expect(JSON.parse(opcoes.body)).toEqual({
      senha_atual: "Temporaria#2026",
      nova_senha: "NovaSenha#2026",
    });

    expect(entrar).toHaveBeenCalledWith(USUARIO_ATUALIZADO);
    expect(irParaDestino).toHaveBeenCalledTimes(1);
  });
});

describe("trocar-senha — validações do cliente (a API nem é chamada)", () => {
  test("senha nova curta não envia", async () => {
    await importarModulo();
    preencher({ nova: "curta", confirmar: "curta" });
    await submeter();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("confirmação diferente não envia", async () => {
    await importarModulo();
    preencher({ nova: "NovaSenha#2026", confirmar: "OutraSenha#2026" });
    await submeter();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("senha atual vazia não envia", async () => {
    await importarModulo();
    preencher({ atual: "" });
    await submeter();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("trocar-senha — erros do servidor", () => {
  test("401 (senha atual errada) mostra o aviso e NÃO atualiza a sessão", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ detail: "A senha atual não confere." }),
    });
    const { entrar, irParaDestino } = await importarModulo();

    preencher();
    await submeter();

    const aviso = document.querySelector("#trocarAviso");
    expect(aviso.hidden).toBe(false);
    expect(aviso.textContent).toContain("não confere");
    expect(entrar).not.toHaveBeenCalled();
    expect(irParaDestino).not.toHaveBeenCalled();
  });

  test("422 (senha fraca) explica as regras", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ detail: "Esta senha é muito comum." }),
    });
    await importarModulo();

    preencher();
    await submeter();

    expect(document.querySelector("#trocarAviso").textContent).toContain("regras");
  });

  test("503 (banco fora) avisa e mantém o formulário utilizável", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: "Banco indisponível." }),
    });
    await importarModulo();

    preencher();
    await submeter();

    expect(document.querySelector("#trocarAviso").textContent).toContain("indispon");
    expect(document.querySelector("#btnTrocar").disabled).toBe(false);
  });
});
