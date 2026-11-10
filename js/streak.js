/**
 * Card de sequência de estudos (js/streak.js) — módulo da home.
 *
 * O STREAK É DO ESTUDANTE (decisão do usuário — privacidade): professor e
 * admin não têm card; em vez dele, a topbar deles ganha o atalho para o
 * painel (professor → "Meus vídeos", admin → "Painel admin"). E o botão
 * "Enviar vídeo" some para o estudante — o backend devolveria 403, então
 * não mostramos um botão que não funciona.
 *
 * O card é desenhado 100% com o que o SERVIDOR manda (GET /streak/meu —
 * fuso America/Sao_Paulo, idempotente, marcos 3/7/30): o front não calcula
 * nada e não manda "estudei hoje" para ninguém — o dia só entra quando o
 * vídeo TERMINA de tocar (js/conclusao.js → POST /watch concluido=true).
 *
 * Estados do card (tom sempre motivacional, nunca punitivo):
 *   streak 0                → "Assista a um vídeo para começar!"
 *   streak N (hoje ok)      → número grande + mensagem do servidor
 *   marco 3/7/30            → selo "3 dias" / "1 semana" / "1 mês"
 *   API fora / erro         → card fica escondido (nunca quebra a home)
 */
import { buscarStreak } from "./api.js";
import { papelDoUsuario, usuarioAtual } from "./sessao.js";

const ID_CARD = "streakCard";
const ID_ATALHO_PAINEL = "atalhoPainel";

const ROTULO_MARCO = {
  3: "3 dias",
  7: "1 semana",
  30: "1 mês",
};

const DESTINO_POR_PAPEL = {
  professor: { href: "./meus-videos.html", rotulo: "Meus vídeos" },
  admin: { href: "./painel-admin.html", rotulo: "Painel admin" },
};

export function renderizarStreak(elemento, dados) {
  if (!elemento) return;

  const streak = Number(dados?.streak ?? 0);
  const marco = dados?.marco;

  const selo = marco
    ? `<span class="streak-marco" title="Marco alcançado">
         ${ROTULO_MARCO[marco] || `${marco} dias`}
       </span>`
    : "";

  const textoStreak =
    streak === 0
      ? `<p class="streak-mensagem">${dados?.mensagem || "Assista a um vídeo para começar sua sequência!"}</p>`
      : `<div class="streak-numero">
           <strong>${streak}</strong>
           <span>${streak === 1 ? "dia seguido" : "dias seguidos"}</span>
         </div>
         <p class="streak-mensagem">${dados?.mensagem || ""}</p>`;

  elemento.innerHTML = `
    <div class="streak-conteudo">
      ${selo}
      ${textoStreak}
    </div>
  `;
  elemento.classList.remove("hidden");
}

/** Monta a resposta de erro como "sem card" — a home nunca quebra. */
export async function carregarStreak(elemento = document.querySelector(`#${ID_CARD}`)) {
  if (!elemento) return null;
  try {
    const dados = await buscarStreak();
    renderizarStreak(elemento, dados);
    return dados;
  } catch (erro) {
    // 403 = papel sem streak (a sessão mudou?), 401 = sessão caiu, rede fora
    // — em todos os casos o card simplesmente não aparece.
    elemento.classList.add("hidden");
    return null;
  }
}

/** Atalho do painel na topbar (professor/admin) — o card é do estudante. */
export function adicionarAtalhoPainel(papel) {
  const alvo = DESTINO_POR_PAPEL[papel];
  if (!alvo) return;

  const topbar = document.querySelector(".topbar");
  if (!topbar || document.querySelector(`#${ID_ATALHO_PAINEL}`)) return;

  const link = document.createElement("a");
  link.id = ID_ATALHO_PAINEL;
  link.className = "btn-acao topbar-atalho";
  link.href = alvo.href;
  link.textContent = alvo.rotulo;
  link.setAttribute("aria-label", `Ir para ${alvo.rotulo}`);

  // Antes do botão de perfil fica alinhado com o "Enviar vídeo".
  const perfil = topbar.querySelector("#profileButton");
  topbar.insertBefore(link, perfil || null);
}

/** Esconde um botão da topbar (usado para tirar o upload do estudante). */
export function esconderElemento(seletor) {
  document.querySelector(seletor)?.classList.add("hidden");
}

/**
 * Liga a home ao papel da sessão — chamado no import (a home.html carrega
 * este módulo depois do js/sessao.js, que já garantiu o login).
 */
export function ligarPorPapel({
  usuario = usuarioAtual(),
  card = document.querySelector(`#${ID_CARD}`),
} = {}) {
  const papel = papelDoUsuario(usuario);

  if (papel === "estudante") {
    esconderElemento("#uploadOpenButton");
    void carregarStreak(card);
    return papel;
  }

  // Professor/admin: sem streak (privacidade) e com atalho do painel.
  card?.classList.add("hidden");
  adicionarAtalhoPainel(papel);
  return papel;
}

ligarPorPapel();
