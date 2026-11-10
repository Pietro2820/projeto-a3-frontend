/**
 * Testes da CONCLUSÃO de vídeo (js/conclusao.js) — onde nasce o dia de
 * estudo do streak.
 *
 * Sob teste:
 *   * o evento `ended` do <video> dispara POST /watch com
 *     { video_id, concluido: true } — e NADA mais (a view de início continua
 *     sendo do player.js, intocada);
 *   * o video_id vem da URL (index.html?video={id});
 *   * SEM usuário na sessão o módulo não dispara nada (sem identidade não
 *     há streak — o backend também ignoraria);
 *   * falha de rede é engolida: terminar de assistir nunca "quebra".
 */
import { jest } from "@jest/globals";

const ALUNO = { usuario_id: "e1", nome: "Aluno", email: "a@escola.com", role: "estudante" };

async function importarModulo({ usuario = ALUNO, search = "/index.html?video=vid-1" } = {}) {
  jest.resetModules();
  window.history.replaceState(null, "", search);

  jest.unstable_mockModule("../js/api.js", () => ({
    registerWatch: jest.fn(() => Promise.resolve({ registrado: true })),
  }));

  jest.unstable_mockModule("../js/sessao.js", () => ({
    usuarioAtual: jest.fn(() => usuario),
  }));

  const api = await import("../js/api.js");
  const modulo = await import("../js/conclusao.js");
  return { modulo, api };
}

function comVideoNaPagina() {
  document.body.innerHTML = '<video id="video" playsinline></video>';
  return document.querySelector("#video");
}

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/home.html");
});

describe("conclusao — videoIdDaUrl", () => {
  test("lê o id do ?video", async () => {
    const { modulo } = await importarModulo({ search: "/index.html?video=abc-123" });
    expect(modulo.videoIdDaUrl("?video=abc-123")).toBe("abc-123");
    expect(modulo.videoIdDaUrl("")).toBe("");
  });
});

describe("conclusao — avisarConclusao", () => {
  test("manda POST /watch com concluido=true quando há usuário", async () => {
    const { modulo, api } = await importarModulo();

    await modulo.avisarConclusao("vid-1");

    expect(api.registerWatch).toHaveBeenCalledWith({
      video_id: "vid-1",
      concluido: true,
    });
  });

  test("sem usuário na sessão NÃO manda nada", async () => {
    const { modulo, api } = await importarModulo({ usuario: null });

    await modulo.avisarConclusao("vid-1");
    expect(api.registerWatch).not.toHaveBeenCalled();
  });

  test("sem videoId não manda nada", async () => {
    const { modulo, api } = await importarModulo();

    await modulo.avisarConclusao("");
    expect(api.registerWatch).not.toHaveBeenCalled();
  });

  test("falha de rede é engolida (terminar de assistir nunca quebra)", async () => {
    const { modulo, api } = await importarModulo();
    api.registerWatch.mockReturnValue(Promise.reject(new Error("rede caiu")));

    await expect(modulo.avisarConclusao("vid-1")).resolves.toBeNull();
  });
});

describe("conclusao — ligarConclusao (o evento ended)", () => {
  test("evento ended dispara a conclusão com o id da URL", async () => {
    const { modulo, api } = await importarModulo({ search: "/index.html?video=aula-9" });
    const video = comVideoNaPagina();

    modulo.ligarConclusao({ video, search: "?video=aula-9" });
    video.dispatchEvent(new window.Event("ended"));

    // setTimeout(0) drena as microtasks do fire-and-forget (registerWatch).
    await new Promise((resolver) => setTimeout(resolver, 0));

    expect(api.registerWatch).toHaveBeenCalledWith({
      video_id: "aula-9",
      concluido: true,
    });
  });

  test("sem usuário, o ended NÃO dispara a conclusão", async () => {
    const { modulo, api } = await importarModulo({ usuario: null });
    const video = comVideoNaPagina();

    modulo.ligarConclusao({ video, search: "?video=aula-9" });
    video.dispatchEvent(new window.Event("ended"));
    await new Promise((resolver) => setTimeout(resolver, 0));

    expect(api.registerWatch).not.toHaveBeenCalled();
  });

  test("sem <video> na página, ligar é inofensivo", async () => {
    const { modulo } = await importarModulo();
    expect(modulo.ligarConclusao({ video: null })).toBeNull();
  });
});
