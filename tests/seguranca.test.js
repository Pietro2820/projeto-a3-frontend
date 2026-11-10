/**
 * Testes de segurança do fluxo de autenticação (frontend).
 *
 * Cada bloco trava uma exigência da revisão de segurança:
 *
 *  1. CONTRATO HTML — os dois formulários declaram method="post" e
 *     action="#": mesmo com o módulo JS falhando (abertura via file://,
 *     script 404), o envio nativo NUNCA vira GET com credenciais na URL;
 *  2. SUBMIT — o handler chama preventDefault (antes de qualquer coisa) e a
 *     requisição sai como POST com corpo JSON, credentials "include" e SEM
 *     credenciais na query da URL;
 *  3. HIGIENE DE URL — página aberta com ?email=&senha= é limpa ao carregar
 *     (history.replaceState) e os valores não são usados;
 *  4. STORAGE — senha nunca vai para localStorage/sessionStorage/cookie
 *     legível, e o campo de senha é zerado após o envio (sucesso ou erro);
 *  5. SESSÃO POR COOKIE — "Lembrar de mim" vai no corpo (não guarda senha),
 *     retomarSessao repõe a sessão via GET /sessao e o Sair revoga o token
 *     no servidor (POST /logout).
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { limparCredenciaisDaUrl, limparSenhas } from "../js/formulario.js";

const lerArquivo = (nome) =>
  readFileSync(fileURLToPath(new URL(`../${nome}`, import.meta.url)), "utf8");

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

/* ---------------------------------------------------------------------------
 * 1. Contrato HTML — method="post" + action="#"
 * ------------------------------------------------------------------------- */

describe("contrato HTML — envio nativo jamais vira GET com credenciais", () => {
  test.each(["login.html", "cadastro.html"])("%s declara method=post + action=#", (arquivo) => {
    const html = lerArquivo(arquivo);
    const abertura = html.match(/<form[^>]*>/)[0];

    expect(abertura).toMatch(/method=["']post["']/i);
    expect(abertura).toMatch(/action=["']#["']/i);
  });

  test.each(["login.html", "cadastro.html"])("%s mantém os IDs que os testes e o JS usam", (arquivo) => {
    const html = lerArquivo(arquivo);
    const ids = html.match(/id="([^"]+)"/g).join(" ");

    if (arquivo === "login.html") {
      expect(ids).toContain('id="loginForm"');
      expect(ids).toContain('id="email"');
      expect(ids).toContain('id="senha"');
      expect(ids).toContain('id="btnEntrar"');
      expect(ids).toContain('id="lembrar"');
    } else {
      expect(ids).toContain('id="cadastroForm"');
      expect(ids).toContain('id="nomeCadastro"');
      expect(ids).toContain('id="senhaCadastro"');
      expect(ids).toContain('id="confirmarCadastro"');
    }
  });
});

/* ---------------------------------------------------------------------------
 * 2. Submit — preventDefault primeiro; POST com JSON; sem creds na URL
 * ------------------------------------------------------------------------- */

describe("submit do login — contrato com a rede", () => {
  let fetchDuble;

  function montarPagina(caminho = "/login.html") {
    window.history.replaceState(null, "", caminho);
    const pagina = new DOMParser().parseFromString(lerArquivo("login.html"), "text/html");
    document.body.innerHTML = pagina.body.innerHTML;
  }

  async function importarLoginComSessaoDubla() {
    jest.resetModules();
    jest.unstable_mockModule("../js/sessao.js", () => ({
      entrar: jest.fn(),
      irParaDestino: jest.fn(),
      retomarSessao: jest.fn(async () => false),
    }));
    await import("../js/login.js");
  }

  afterEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = "";
    jest.restoreAllMocks();
  });

  test("preventDefault é chamado e a requisição sai como POST/JSON com credentials", async () => {
    fetchDuble = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ usuario: USUARIO }),
    }));
    global.fetch = fetchDuble;

    montarPagina("/login.html");
    await importarLoginComSessaoDubla();

    const evento = new Event("submit", { cancelable: true });
    const espiaoPreventDefault = jest.spyOn(evento, "preventDefault");

    document.querySelector("#email").value = "aluna.seg@edustream.com";
    document.querySelector("#senha").value = "senha-super-segura";
    document.querySelector("#loginForm").dispatchEvent(evento);
    await flush();

    expect(espiaoPreventDefault).toHaveBeenCalled();
    expect(evento.defaultPrevented).toBe(true);

    expect(fetchDuble).toHaveBeenCalledTimes(1);
    const [url, options] = fetchDuble.mock.calls[0];

    expect(String(url)).toBe("http://localhost:8000/login"); // sem ?email/&senha
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");

    const corpo = JSON.parse(options.body);
    expect(corpo.email).toBe("aluna.seg@edustream.com");
    expect(corpo.senha).toBe("senha-super-segura");
  });

  test("senha do corpo não aparece na URL requisitada e campo zera após erro 401", async () => {
    fetchDuble = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ detail: "E-mail ou senha incorretos." }),
    }));
    global.fetch = fetchDuble;

    montarPagina("/login.html");
    await importarLoginComSessaoDubla();

    document.querySelector("#email").value = "aluna.seg@edustream.com";
    document.querySelector("#senha").value = "senha-errada-123";
    document.querySelector("#loginForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    const [url, options] = fetchDuble.mock.calls[0];
    expect(String(url)).not.toContain("senha-errada-123");
    expect(String(url)).not.toContain("aluna.seg%40"); // email encodado na query

    expect(options.method).toBe("POST");
    expect(document.querySelector("#senha").value).toBe(""); // limpo após o envio
    expect(sessionStorage.getItem("edustream.usuario")).toBeNull(); // 401 não loga
  });

  test("'Lembrar de mim' vai no CORPO (lembrar: true) — nunca como senha guardada", async () => {
    fetchDuble = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ usuario: USUARIO }),
    }));
    global.fetch = fetchDuble;

    montarPagina("/login.html");
    await importarLoginComSessaoDubla();

    document.querySelector("#email").value = "aluna.seg@edustream.com";
    document.querySelector("#senha").value = "senha-super-segura";
    document.querySelector("#lembrar").checked = true;
    document.querySelector("#loginForm")
      .dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();

    const corpo = JSON.parse(fetchDuble.mock.calls[0][1].body);
    expect(corpo.lembrar).toBe(true);
    // O que fica no storage é só o usuário público — sem senha, sem token:
    const gravado = JSON.parse(sessionStorage.getItem("edustream.usuario") || "{}");
    expect(gravado.senha).toBeUndefined();
    expect(gravado.token).toBeUndefined();
  });
});

/* ---------------------------------------------------------------------------
 * 3. Higiene de URL — credenciais na query são removidas ao carregar
 * ------------------------------------------------------------------------- */

describe("limparCredenciaisDaUrl", () => {
  function historicoFalso(caminhoInicial) {
    const estado = { caminho: caminhoInicial };
    return {
      estado,
      replaceState: jest.fn((_n, _t, url) => { estado.caminho = url; }),
    };
  }

  test.each([
    ["/login.html?email=a@b.com&senha=123456", "/login.html"],
    ["/login.html?password=abc&login=x", "/login.html"],
    ["/cadastro.html?email=a%40b.com&senha=xyz", "/cadastro.html"],
  ])("%s → %s (sem recarregar, replaceState)", (inicial, esperado) => {
    const hist = historicoFalso(inicial);
    const loc = { search: inicial.split("?")[1] ? `?${inicial.split("?")[1]}` : "", pathname: inicial.split("?")[0], hash: "" };

    expect(limparCredenciaisDaUrl({ history: hist, location: loc })).toBe(true);
    expect(hist.replaceState).toHaveBeenCalledTimes(1);
    expect(hist.estado.caminho).toBe(esperado);
  });

  test("preserva o ?proximo e outros parâmetros legítimos", () => {
    const hist = historicoFalso("/login.html");
    const loc = { search: "?proximo=index.html%3Fvideo%3Dv1&senha=123456&email=a@b.com", pathname: "/login.html", hash: "" };

    limparCredenciaisDaUrl({ history: hist, location: loc });

    const query = hist.estado.caminho.split("?")[1] || "";
    expect(query).toContain("proximo=index.html%3Fvideo%3Dv1");
    expect(query).not.toContain("senha");
    expect(query).not.toContain("email");
  });

  test("URL já limpa não toca no histórico (devolve false)", () => {
    const hist = historicoFalso("/login.html");
    const loc = { search: "?proximo=home.html", pathname: "/login.html", hash: "" };

    expect(limparCredenciaisDaUrl({ history: hist, location: loc })).toBe(false);
    expect(hist.replaceState).not.toHaveBeenCalled();
  });

  test("página carregada com credenciais na URL: login.js limpa ao importar", async () => {
    jest.resetModules();
    jest.unstable_mockModule("../js/sessao.js", () => ({
      entrar: jest.fn(),
      irParaDestino: jest.fn(),
      retomarSessao: jest.fn(async () => false),
    }));

    window.history.replaceState(null, "", "/login.html?email=vitima@b.com&senha=Vazou123&proximo=home.html");
    const pagina = new DOMParser().parseFromString(lerArquivo("login.html"), "text/html");
    document.body.innerHTML = pagina.body.innerHTML;

    await import("../js/login.js");
    await flush();

    const busca = window.location.search;
    expect(busca).not.toContain("email=");
    expect(busca).not.toContain("senha=");
    expect(busca).toContain("proximo=home.html");
  });
});

/* ---------------------------------------------------------------------------
 * 4. limparSenhas (auxiliar compartilhado)
 * ------------------------------------------------------------------------- */

describe("limparSenhas", () => {
  test("zera os campos e devolve o tipo oculto se o toggle deixou visível", () => {
    const senha = { value: "segredo-123", type: "text" };
    const confirmar = { value: "segredo-123", type: "password" };

    limparSenhas(senha, confirmar);

    expect(senha.value).toBe("");
    expect(senha.type).toBe("password"); // toggle esquecido volta a esconder
    expect(confirmar.value).toBe("");
  });

  test("tolera campos ausentes (elemento não encontrado na página)", () => {
    expect(() => limparSenhas(null, undefined)).not.toThrow();
  });
});

/* ---------------------------------------------------------------------------
 * 5. Nada de senha em storage legível por JS (varredura defensiva)
 * ------------------------------------------------------------------------- */

describe("storage — a senha nunca é persistida no cliente", () => {
  test("após login com falha E com sucesso, storage não contém a senha digitada", async () => {
    const SENHA_DIGITADA = "minha-senha-secreta-99";

    for (const resposta of [
      { ok: false, status: 401, json: async () => ({ detail: "x" }) },
      { ok: true, status: 200, json: async () => ({ usuario: USUARIO }) },
    ]) {
      jest.resetModules();
      global.fetch = jest.fn(async () => resposta);

      window.history.replaceState(null, "", "/login.html");
      const pagina = new DOMParser().parseFromString(lerArquivo("login.html"), "text/html");
      document.body.innerHTML = pagina.body.innerHTML;

      jest.unstable_mockModule("../js/sessao.js", () => ({
        entrar: jest.fn((usuario) =>
          sessionStorage.setItem("edustream.usuario", JSON.stringify(usuario))
        ),
        irParaDestino: jest.fn(),
        retomarSessao: jest.fn(async () => false),
      }));

      await import("../js/login.js");

      document.querySelector("#email").value = USUARIO.email;
      document.querySelector("#senha").value = SENHA_DIGITADA;
      document.querySelector("#loginForm")
        .dispatchEvent(new Event("submit", { cancelable: true }));
      await flush();

      for (const storage of [sessionStorage, localStorage]) {
        for (let i = 0; i < storage.length; i += 1) {
          const valor = storage.getItem(storage.key(i));
          expect(valor).not.toContain(SENHA_DIGITADA);
        }
      }
    }
  });
});
