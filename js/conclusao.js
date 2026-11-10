/**
 * Conclusão de vídeo (js/conclusao.js) — módulo da watch page.
 *
 * É AQUI que nasce um dia de estudo (decisão do usuário: dia = vídeo
 * CONCLUÍDO). Quando a exibição chega ao fim (evento `ended` do elemento
 * <video> — tanto faz se por hls.js ou HLS nativo), mandamos
 * POST /watch { video_id, concluido: true }:
 *
 *   * o BACKEND resolve quem é (cookie HttpOnly → GET/POST com sessão);
 *   * o dia é calculado no fuso America/Sao_Paulo e gravado 1x/dia;
 *   * estudante ganha dia; professor/admin não (privacidade);
 *   * a view "normal" (início da exibição) continua sendo a do js/player.js
 *     — este módulo só acrescenta o FIM.
 *
 * Fire-and-forget de propósito: falha de rede/fila não pode atrapalhar a
 * experiência de quem terminou de assistir (o streak é best-effort no
 * servidor também).
 *
 * Sem sessão (sessionStorage vazio) o módulo nem dispara: sem identidade
 * não há streak — e o backend ignoraria de qualquer forma.
 */
import { registerWatch } from "./api.js";
import { usuarioAtual } from "./sessao.js";

/** id do vídeo na URL da watch page (index.html?video={id}). */
export function videoIdDaUrl(search = window.location.search) {
  return new URLSearchParams(search).get("video") || "";
}

/** Um dia de estudo a caminho do servidor (o back decide se conta). */
export function avisarConclusao(videoId) {
  if (!videoId || !usuarioAtual()) return Promise.resolve(null);
  return registerWatch({ video_id: videoId, concluido: true }).catch(() => null);
}

/** Liga o evento `ended` do player à conclusão. */
export function ligarConclusao({
  video = document.querySelector("video#video"),
  search = window.location.search,
} = {}) {
  if (!video) return null;

  const videoId = videoIdDaUrl(search);
  video.addEventListener("ended", () => {
    void avisarConclusao(videoId);
  });

  return videoId;
}

ligarConclusao();
