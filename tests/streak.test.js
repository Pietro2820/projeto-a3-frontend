/**
 * Testes do CARD DE STREAK (js/streak.js) — o recurso do estudante.
 *
 * Sob teste (decisões do usuário):
 *   * o card desenha o que o SERVIDOR manda: streak 0 (convite), streak
 *     ativo (número + mensagem) e marcos 3/7/30 (selo);
 *   * ESTUDANTE: vê o card e NÃO vê o botão "Enviar vídeo" (o backend
 *     devolveria 403);
 *   * PROFESSOR/ADMIN: sem card (privacidade) e com atalho do painel na
 *     topbar ("Meus vídeos" / "Painel admin");
 *   * erro na API esconde o card — a home nunca quebra.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const homeHtml = readFileSync(
  fileURLToPath(new URL("../home.html", import.meta.url)),
  "utf8"
);

const ALUNO = { usuario_id: "e1", nome: "Aluno", email: "a@escola.com", role: "estudante" };
const PROFESSOR = { usuario_id: "p1", nome: "Prof.", email: "p@escola.com", role: "professor" };

function montarPagina() {
  // A home inteira (topbar + card + grade) — o módulo mexe nos dois.
  const pagina = new DOMParser().parseFromString(homeHtml, "text/html");
  document.body.innerHTML = pagina.body.innerHTML;
}

/**
 * Importa js/streak.js com api.js e sessao.js dublados.
 * `streak` define o que GET /streak/meu responde; `erro` força a falha.
 */
async function importarModulo({
  usuario = ALUNO,
  papel = usuario?.role || "estudante",
  streak = null,
  erro = null,
} = {}) {
  jest.resetModules();

  jest.unstable_mockModule("../js/api.js", () => ({
    buscarStreak: jest.fn(() => {
      if (erro) return Promise.reject(erro);
      return Promise.resolve(streak);
    }),
  }));

  jest.unstable_mockModule("../js/sessao.js", () => ({
    usuarioAtual: jest.fn(() => usuario),
    papelDoUsuario: jest.fn(() => papel),
  }));

  await import("../js/api.js");
  const modulo = await import("../js/streak.js");
  return modulo;
}

beforeEach(() => {
  montarPagina();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("streak — renderização do card", () => {
  test("streak 0 mostra o convite para começar (sem número)", async () => {
    const modulo = await importarModulo();
    const card = document.querySelector("#streakCard");

    modulo.renderizarStreak(card, { streak: 0, marco: null, mensagem: "Assista a um vídeo para começar sua sequência!" });

    expect(card.classList.contains("hidden")).toBe(false);
    expect(card.textContent).toContain("Assista a um vídeo");
    expect(card.querySelector(".streak-numero")).toBeNull();
  });

  test("streak ativo mostra o número e a mensagem do servidor", async () => {
    const modulo = await importarModulo();
    const card = document.querySelector("#streakCard");

    modulo.renderizarStreak(card, { streak: 5, estudou_hoje: true, marco: 3, mensagem: "3 dias seguidos!" });

    expect(card.querySelector(".streak-numero strong").textContent).toBe("5");
    expect(card.textContent).toContain("dias seguidos");
    expect(card.textContent).toContain("3 dias seguidos!");
  });

  test("marco 7 rende o selo '1 semana'", async () => {
    const modulo = await importarModulo();
    const card = document.querySelector("#streakCard");

    modulo.renderizarStreak(card, { streak: 7, marco: 7, mensagem: "1 semana completa!" });

    const selo = card.querySelector(".streak-marco");
    expect(selo).not.toBeNull();
    expect(selo.textContent).toContain("1 semana");
  });

  test("marco 30 rende o selo '1 mês'", async () => {
    const modulo = await importarModulo();
    const card = document.querySelector("#streakCard");

    modulo.renderizarStreak(card, { streak: 31, marco: 30, mensagem: "1 mês de constância!" });

    expect(card.querySelector(".streak-marco").textContent).toContain("1 mês");
  });
});

describe("streak — o card é do ESTUDANTE", () => {
  test("estudante: card carregado e botão de upload escondido", async () => {
    await importarModulo({
      usuario: ALUNO,
      papel: "estudante",
      streak: { streak: 3, marco: 3, mensagem: "3 dias seguidos!" },
    });

    const card = document.querySelector("#streakCard");
    expect(card.classList.contains("hidden")).toBe(false);
    expect(card.textContent).toContain("3 dias seguidos!");
    // O estudante não vê um botão que o backend rejeitaria com 403.
    expect(
      document.querySelector("#uploadOpenButton").classList.contains("hidden")
    ).toBe(true);
  });

  test("professor: SEM card e COM atalho 'Meus vídeos' na topbar", async () => {
    await importarModulo({ usuario: PROFESSOR, papel: "professor" });

    expect(document.querySelector("#streakCard").classList.contains("hidden")).toBe(true);
    const atalho = document.querySelector("#atalhoPainel");
    expect(atalho).not.toBeNull();
    expect(atalho.getAttribute("href")).toBe("./meus-videos.html");
    expect(atalho.textContent).toBe("Meus vídeos");
    // O professor PODE enviar vídeo — o botão continua.
    expect(
      document.querySelector("#uploadOpenButton").classList.contains("hidden")
    ).toBe(false);
  });

  test("admin: atalho aponta para o painel-admin", async () => {
    await importarModulo({
      usuario: { ...PROFESSOR, role: "admin" },
      papel: "admin",
    });

    const atalho = document.querySelector("#atalhoPainel");
    expect(atalho.getAttribute("href")).toBe("./painel-admin.html");
    expect(atalho.textContent).toBe("Painel admin");
  });

  test("erro na API esconde o card sem quebrar a home", async () => {
    await importarModulo({ erro: { status: 503 } });

    expect(document.querySelector("#streakCard").classList.contains("hidden")).toBe(true);
  });

  test("403 (sessão virou professor?) também só esconde o card", async () => {
    await importarModulo({ erro: { status: 403 } });

    expect(document.querySelector("#streakCard").classList.contains("hidden")).toBe(true);
  });
});
