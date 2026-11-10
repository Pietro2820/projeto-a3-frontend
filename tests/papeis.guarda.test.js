/**
 * Testes dos GUARDAS POR PAPEL (js/sessao.js, migração 002).
 *
 * Regras sob teste:
 *   * papel com fallback "estudante" (sessões antigas sem role continuam
 *     funcionando exatamente como antes);
 *   * destino por papel: estudante → home, professor → meus-videos,
 *     admin → painel-admin;
 *   * conta de 1º acesso (primeiro_acesso=true) vai SEMPRE para
 *     trocar-senha.html — nem ?proximo vence;
 *   * exigirPapel: papel errado é devolvido ao PRÓPRIO destino
 *     (redirecionamento mútuo), papel certo devolve o usuário.
 */
import { jest } from "@jest/globals";

const PROFESSOR = {
  usuario_id: "a0000000-0000-0000-0000-000000000001",
  nome: "Prof. Paulo",
  email: "paulo@escola.com",
  role: "professor",
  primeiro_acesso: false,
};

const ADMIN = {
  usuario_id: "a0000000-0000-0000-0000-000000000002",
  nome: "Admin",
  email: "admin@edustream.com",
  role: "admin",
  primeiro_acesso: false,
};

const ALUNO_NOVO = {
  usuario_id: "a0000000-0000-0000-0000-000000000003",
  nome: "Prof. Novo",
  email: "novo@escola.com",
  role: "professor",
  primeiro_acesso: true,
};

async function importarSessao() {
  jest.resetModules();
  return import("../js/sessao.js");
}

function comSessao(usuario) {
  if (usuario) sessionStorage.setItem("edustream.usuario", JSON.stringify(usuario));
}

function comPagina(caminho) {
  window.history.replaceState(null, "", caminho);
}

const navegar = jest.fn();

beforeEach(() => {
  sessionStorage.clear();
  navegar.mockClear();
  jest.spyOn(console, "error").mockImplementation(() => {});
  comPagina("/home.html");
});

afterEach(() => {
  jest.restoreAllMocks();
  sessionStorage.clear();
});

describe("sessao — papel com fallback estudante", () => {
  test.each([
    [null, "estudante"],
    [{ email: "sem-role@escola.com" }, "estudante"],
    [PROFESSOR, "professor"],
    [ADMIN, "admin"],
  ])("papelDoUsuario(%j) → %j", async (usuario, esperado) => {
    const { papelDoUsuario } = await importarSessao();
    expect(papelDoUsuario(usuario)).toBe(esperado);
  });

  test.each([
    [null, "./home.html"],
    [PROFESSOR, "./meus-videos.html"],
    [ADMIN, "./painel-admin.html"],
    [{ role: "estudante" }, "./home.html"],
  ])("destinoPorPapel(%j) → %j", async (usuario, esperado) => {
    const { destinoPorPapel } = await importarSessao();
    expect(destinoPorPapel(usuario)).toBe(esperado);
  });
});

describe("sessao — 1º acesso manda para a troca de senha", () => {
  test("irParaDestino leva o primeiro acesso a trocar-senha.html", async () => {
    comPagina("/login.html");
    comSessao(ALUNO_NOVO);
    const { irParaDestino } = await importarSessao();

    irParaDestino({ navegar });
    expect(navegar).toHaveBeenCalledWith("./trocar-senha.html");
  });

  test("nem o ?proximo vence o 1º acesso (a troca é obrigatória)", async () => {
    comPagina("/login.html?proximo=index.html%3Fvideo%3Dv1");
    comSessao(ALUNO_NOVO);
    const { irParaDestino } = await importarSessao();

    irParaDestino({ navegar });
    expect(navegar).toHaveBeenCalledWith("./trocar-senha.html");
  });

  test("inicializar redireciona o 1º acesso que abriu a home direto", async () => {
    comSessao(ALUNO_NOVO);
    const { inicializar } = await importarSessao();

    expect(inicializar({ navegar })).toBeNull();
    expect(navegar).toHaveBeenCalledWith("./trocar-senha.html");
  });

  test("na TELA de troca de senha o guard deixa ficar (sem loop)", async () => {
    comPagina("/trocar-senha.html");
    comSessao(ALUNO_NOVO);
    const { inicializar } = await importarSessao();

    expect(inicializar({ navegar })).toEqual(ALUNO_NOVO);
    expect(navegar).not.toHaveBeenCalled();
  });
});

describe("sessao — roteamento por papel (sem ?proximo)", () => {
  test("professor sem ?proximo cai no Meus vídeos", async () => {
    comPagina("/login.html");
    comSessao(PROFESSOR);
    const { irParaDestino } = await importarSessao();

    irParaDestino({ navegar });
    expect(navegar).toHaveBeenCalledWith("./meus-videos.html");
  });

  test("sessão antiga SEM role continua caindo na home (compatibilidade)", async () => {
    comPagina("/login.html");
    comSessao({ usuario_id: "x", nome: "Antiga", email: "a@b.com" });
    const { irParaDestino } = await importarSessao();

    irParaDestino({ navegar });
    expect(navegar).toHaveBeenCalledWith("./home.html");
  });

  test("?proximo válido continua vencendo (comportamento antigo intacto)", async () => {
    comPagina("/login.html?proximo=index.html%3Fvideo%3Dv1");
    comSessao(PROFESSOR);
    const { irParaDestino } = await importarSessao();

    irParaDestino({ navegar });
    expect(navegar).toHaveBeenCalledWith("index.html?video=v1");
  });
});

describe("sessao — exigirPapel (guard das páginas de painel)", () => {
  test("professor passa em página de professor/admin", async () => {
    comSessao(PROFESSOR);
    const { exigirPapel } = await importarSessao();

    expect(exigirPapel(["professor", "admin"], { navegar })).toEqual(PROFESSOR);
    expect(navegar).not.toHaveBeenCalled();
  });

  test("estudante esbarrando no painel do admin é devolvido à home", async () => {
    comSessao({ usuario_id: "x", nome: "Aluno", email: "a@b.com", role: "estudante" });
    const { exigirPapel } = await importarSessao();

    expect(exigirPapel(["admin"], { navegar })).toBeNull();
    expect(navegar).toHaveBeenCalledWith("./home.html");
  });

  test("professor esbarrando no painel do admin vai ao MEUS VÍDEOS (não à home)", async () => {
    comSessao(PROFESSOR);
    const { exigirPapel } = await importarSessao();

    expect(exigirPapel(["admin"], { navegar })).toBeNull();
    expect(navegar).toHaveBeenCalledWith("./meus-videos.html");
  });

  test("1º acesso manda para a troca de senha antes do papel", async () => {
    comSessao(ALUNO_NOVO);
    const { exigirPapel } = await importarSessao();

    expect(exigirPapel(["professor", "admin"], { navegar })).toBeNull();
    expect(navegar).toHaveBeenCalledWith("./trocar-senha.html");
  });

  test("sem sessão vai para o login levando a página (?proximo)", async () => {
    const { exigirPapel } = await importarSessao();

    expect(exigirPapel(["admin"], { navegar })).toBeNull();
    expect(navegar).toHaveBeenCalledWith("./login.html?proximo=home.html");
  });
});
