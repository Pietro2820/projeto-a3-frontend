/**
 * Sessão por cookie HttpOnly — js/sessao.js com o módulo REAL.
 *
 * Arquivo separado de tests/seguranca.test.js por causa do registro de dublê
 * do Jest: jest.unstable_mockModule("../js/sessao.js") usado nos testes do
 * login/cadastro sobrevive a jest.resetModules() DENTRO do mesmo arquivo —
 * aqui não há registro nenhum, então o módulo real (com sair/retomarSessao)
 * é sempre importado.
 *
 * O que está em jogo (revisão de segurança):
 *  * "Lembrar de mim"/reinício do navegador deixam um cookie HttpOnly válido
 *    com o sessionStorage vazio — retomarSessao pergunta ao servidor
 *    (GET /sessao, credentials include) e repõe a sessão local;
 *  * o botão Sair agora faz logout REAL: POST /logout revoga o token no
 *    servidor antes de voltar à tela de login — e funciona mesmo sem fetch
 *    (a cópia local morre de qualquer jeito).
 */
import { jest } from "@jest/globals";

const USUARIO = {
  usuario_id: "9a1b2c3d-0000-0000-0000-000000000003",
  nome: "Aluna Segurança",
  email: "aluna.seg@edustream.com",
};

function flush(times = 4) {
  let promise = Promise.resolve();
  for (let i = 0; i < times; i += 1) {
    promise = promise.then(() => new Promise((resolver) => setTimeout(resolver, 0)));
  }
  return promise;
}

async function importarSessaoReal(caminho = "/login.html") {
  jest.resetModules();
  window.history.replaceState(null, "", caminho);
  return import("../js/sessao.js");
}

let fetchDuble;
let navegar;

beforeEach(() => {
  navegar = jest.fn();
});

afterEach(() => {
  sessionStorage.clear();
  document.body.innerHTML = "";
  jest.restoreAllMocks();
});

describe("retomarSessao — sessão retomada pelo cookie invisível", () => {
  test("GET /sessao 200 repõe a sessão e vai para o ?proximo", async () => {
    fetchDuble = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ usuario: USUARIO, mensagem: "Sessão ativa." }),
    }));
    global.fetch = fetchDuble;

    const { retomarSessao } = await importarSessaoReal("/login.html?proximo=home.html");
    const retomou = await retomarSessao({ navegar });

    expect(retomou).toBe(true);
    const [url, options] = fetchDuble.mock.calls[0];
    expect(String(url)).toContain("/sessao");
    expect(options.credentials).toBe("include"); // cookie HttpOnly vai junto
    expect(sessionStorage.getItem("edustream.usuario")).toBe(JSON.stringify(USUARIO));
    expect(navegar).toHaveBeenCalledWith("home.html"); // allowlist do ?proximo
  });

  test("401/falha de rede deixa a tela de login normal (sem navegar)", async () => {
    fetchDuble = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ detail: "Sessão inexistente ou expirada." }),
    }));
    global.fetch = fetchDuble;

    const { retomarSessao } = await importarSessaoReal("/login.html");
    const retomou = await retomarSessao({ navegar });

    expect(retomou).toBe(false);
    expect(navegar).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("edustream.usuario")).toBeNull();
  });

  test("já com sessão local nem consulta a API", async () => {
    fetchDuble = jest.fn();
    global.fetch = fetchDuble;
    sessionStorage.setItem("edustream.usuario", JSON.stringify(USUARIO));

    const { retomarSessao } = await importarSessaoReal("/login.html");
    const retomou = await retomarSessao({ navegar });

    expect(retomou).toBe(true);
    expect(fetchDuble).not.toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith("./home.html"); // sem ?proximo → padrão
  });

  test("com sessão local e ?proximo da watch page, volta para o vídeo", async () => {
    fetchDuble = jest.fn();
    global.fetch = fetchDuble;
    sessionStorage.setItem("edustream.usuario", JSON.stringify(USUARIO));

    const { retomarSessao } = await importarSessaoReal("/login.html?proximo=index.html%3Fvideo%3Dv1");
    await retomarSessao({ navegar });

    expect(navegar).toHaveBeenCalledWith("index.html?video=v1");
  });
});

describe("sair — logout REAL (revoga o token no servidor)", () => {
  test("POST /logout com credentials + limpa a cópia local", async () => {
    fetchDuble = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ mensagem: "Logout realizado." }),
    }));
    global.fetch = fetchDuble;
    sessionStorage.setItem("edustream.usuario", JSON.stringify(USUARIO));

    const { sair, usuarioAtual } = await importarSessaoReal("/home.html");
    sair({ navegar });
    await flush();

    expect(usuarioAtual()).toBeNull();
    expect(navegar).toHaveBeenCalledWith("./login.html");

    expect(fetchDuble).toHaveBeenCalledTimes(1);
    const [url, options] = fetchDuble.mock.calls[0];
    expect(String(url)).toContain("/logout");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");
  });

  test("funciona mesmo sem fetch disponível (logout local de segurança)", async () => {
    const fetchOriginal = global.fetch;
    delete global.fetch; // ambiente sem fetch — o logout local NÃO pode quebrar

    try {
      sessionStorage.setItem("edustream.usuario", JSON.stringify(USUARIO));
      const { sair, usuarioAtual } = await importarSessaoReal("/home.html");

      expect(() => sair({ navegar })).not.toThrow();
      expect(usuarioAtual()).toBeNull();
      expect(navegar).toHaveBeenCalledWith("./login.html");
    } finally {
      global.fetch = fetchOriginal;
    }
  });

  test("API fora do ar não trava o logout (falha silenciosa)", async () => {
    fetchDuble = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    global.fetch = fetchDuble;
    sessionStorage.setItem("edustream.usuario", JSON.stringify(USUARIO));

    const { sair, usuarioAtual } = await importarSessaoReal("/home.html");

    expect(() => sair({ navegar })).not.toThrow();
    expect(usuarioAtual()).toBeNull();
    expect(navegar).toHaveBeenCalledWith("./login.html");
  });
});
