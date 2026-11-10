/**
 * Ações do DONO na watch page (js/dono.js).
 *
 * O dono do vídeo (professor_id === usuário da sessão) — e o admin — veem
 * aqui os botões Editar/Apagar. Estudante e professor "visitante" não veem
 * NADA (a regra de verdade é o backend: PATCH/DELETE fora do dono devolvem
 * 403 — o front só esconde o que não funciona).
 *
 * O vídeo vem de GET /catalogo/{id} — o mesmo metadado que o player usa, de
 * forma INDEPENDENTE (não se acopla ao js/player.js, que tem suíte própria
 * e não precisou mudar).
 *
 * Apagar volta para a home (o vídeo deixou de existir); Editar abre o mesmo
 * modal do painel "Meus vídeos" (PATCH /videos/{id}).
 */
import { apagarVideo, getVideo, salvarVideo } from "./api.js";
import { papelDoUsuario, usuarioAtual } from "./sessao.js";

export function ehDonoDoVideo(video, usuario = usuarioAtual()) {
  if (!video || !usuario) return false;
  if (papelDoUsuario(usuario) === "admin") return true;
  return Boolean(
    video.professor_id &&
      usuario.usuario_id &&
      video.professor_id === usuario.usuario_id
  );
}

function barraDeAcoes(video) {
  const barra = document.createElement("div");
  barra.className = "acoes-video";
  barra.id = "acoesVideo";

  const botaoEditar = document.createElement("button");
  botaoEditar.type = "button";
  botaoEditar.className = "btn-acao";
  botaoEditar.textContent = "Editar";

  const botaoApagar = document.createElement("button");
  botaoApagar.type = "button";
  botaoApagar.className = "btn-acao btn-acao-perigo";
  botaoApagar.textContent = "Apagar";

  botaoEditar.addEventListener("click", () => editarDaBarra(video, botaoEditar));
  botaoApagar.addEventListener("click", () => apagarDaBarra(video));

  barra.append(botaoEditar, botaoApagar);
  return barra;
}

async function editarDaBarra(video, botao) {
  const novoTitulo = window.prompt("Novo título do vídeo:", video.titulo || "");
  if (novoTitulo === null) return; // cancelou
  const titulo = novoTitulo.trim();
  if (!titulo) {
    window.alert("O título não pode ficar vazio.");
    return;
  }

  botao.disabled = true;
  try {
    await salvarVideo(video.video_id, { titulo });
    window.location.reload(); // simples: recarrega com o título novo
  } catch (erro) {
    botao.disabled = false;
    if (erro?.status === 403) {
      window.alert("Este vídeo pertence a outro professor.");
    } else {
      window.alert("Não foi possível salvar o título. Tente novamente.");
    }
  }
}

async function apagarDaBarra(video) {
  if (!window.confirm(`Apagar "${video.titulo}"? Essa ação não tem volta.`)) return;

  try {
    await apagarVideo(video.video_id);
    window.location.assign("./home.html");
  } catch (erro) {
    if (erro?.status === 403) {
      window.alert("Este vídeo pertence a outro professor — só o dono apaga.");
    } else {
      window.alert("Não foi possível apagar o vídeo. Tente novamente.");
    }
  }
}

/** Busca o metadado e, se o usuário for o dono, mostra a barra de ações. */
export async function ligarAcoesDoDono({
  videoId = new URLSearchParams(window.location.search).get("video") || "",
  container = document.querySelector("#videoAcoes"),
  usuario = usuarioAtual(),
  buscar = getVideo,
} = {}) {
  if (!videoId || !container || !usuario) return null;

  let video;
  try {
    video = await buscar(videoId);
  } catch {
    return null; // vídeo indisponível: sem barra (a página segue tocando)
  }

  if (!ehDonoDoVideo(video, usuario)) return null;

  container.replaceChildren(barraDeAcoes(video));
  return video;
}

ligarAcoesDoDono();
