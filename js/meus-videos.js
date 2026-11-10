/**
 * Painel "Meus vídeos" (js/meus-videos.js) — página meus-videos.html.
 *
 * A metade do DONO (migração 002): lista os vídeos que o professor logado
 * publicou (GET /meus-videos — filtro no BANCO), com status de
 * transcodificação, views e as ações de Editar/Apagar — que só existem
 * porque esta lista é dele. Em vídeo de outro professor o backend responde
 * 403 ("Este vídeo pertence a outro professor"), e o front traduz.
 *
 * Guard da página: exigirPapel(["professor", "admin"]) — estudante é
 * devolvido à home (redirecionamento mútuo em js/sessao.js). O admin herda
 * os poderes de professor: vê AQUI os vídeos atribuídos a ele (incluindo os
 * vídeos antigos sem dono que a migração atribuiu ao admin).
 *
 * Status de transcodificação (pending/processing/completed/failed) é do
 * pipeline Celery: o painel mostre, não deixa mexer (o PATCH do backend
 * nem aceita status — ver app/videos/schemas.py).
 */
import { apagarVideo, buscarMeusVideos, salvarVideo } from "./api.js";
import { escapeHtml } from "./recommendations.js";
import { exigirPapel } from "./sessao.js";
import { iniciarUiUpload } from "./upload.js";

const ROTULO_STATUS = {
  pending: "Na fila",
  processing: "Transcodificando",
  completed: "Pronto",
  failed: "Falhou",
};

const tabela = document.querySelector("#tabelaVideos");
const corpoTabela = document.querySelector("#corpoTabela");
const contagem = document.querySelector("#painelContagem");
const painelAviso = document.querySelector("#painelAviso");

const modalEditar = document.querySelector("#editarModal");
const formEditar = document.querySelector("#editarForm");
const campoTitulo = document.querySelector("#editarTitulo");
const campoDescricao = document.querySelector("#editarDescricao");
const campoTags = document.querySelector("#editarTags");
const campoCategoria = document.querySelector("#editarCategoria");
const statusEditar = document.querySelector("#editarStatus");

let videoEmEdicao = null;

function definirStatus(texto, classe = "") {
  statusEditar.textContent = texto;
  statusEditar.className = `upload-status ${classe}`.trim();
}

/** Celula da data no formato do Brasil (o banco manda ISO). */
function dataCurta(iso) {
  if (!iso) return "—";
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? "—"
    : data.toLocaleDateString("pt-BR");
}

export function linhaDoVideo(video) {
  const tr = document.createElement("tr");

  const tdTitulo = document.createElement("td");
  tdTitulo.textContent = video.title || video.titulo || "Sem título";

  const tdStatus = document.createElement("td");
  const status = video.status || "pending";
  tdStatus.innerHTML =
    `<span class="badge-status badge-${escapeHtml(status)}">` +
    `${escapeHtml(ROTULO_STATUS[status] || status)}</span>`;

  const tdViews = document.createElement("td");
  tdViews.textContent = String(video.views ?? 0);

  const tdData = document.createElement("td");
  tdData.textContent = dataCurta(video.criado_em || video.createdAt);

  const tdAcoes = document.createElement("td");
  tdAcoes.className = "acoes";

  const botaoEditar = document.createElement("button");
  botaoEditar.type = "button";
  botaoEditar.className = "btn-acao";
  botaoEditar.textContent = "Editar";
  botaoEditar.addEventListener("click", () => abrirEdicao(video));

  const botaoApagar = document.createElement("button");
  botaoApagar.type = "button";
  botaoApagar.className = "btn-acao btn-acao-perigo";
  botaoApagar.textContent = "Apagar";
  botaoApagar.addEventListener("click", () => apagar(video));

  tdAcoes.append(botaoEditar, botaoApagar);
  tr.append(tdTitulo, tdStatus, tdViews, tdData, tdAcoes);
  return tr;
}

export function renderizarTabela(videos) {
  corpoTabela.replaceChildren(...videos.map(linhaDoVideo));
  tabela.hidden = videos.length === 0;
  contagem.textContent = videos.length
    ? `${videos.length} vídeo${videos.length === 1 ? "" : "s"}`
    : "";
}

function mostrarAvisoPainel(texto) {
  painelAviso.textContent = texto;
  painelAviso.classList.remove("hidden");
  tabela.hidden = true;
}

export async function carregar() {
  painelAviso.classList.add("hidden");
  try {
    const resposta = await buscarMeusVideos();
    renderizarTabela(resposta.videos || []);
  } catch (erro) {
    if (erro?.status === 403) {
      mostrarAvisoPainel(
        "Somente professores têm painel de vídeos. Você foi redirecionado."
      );
      return;
    }
    mostrarAvisoPainel(
      "Não foi possível carregar seus vídeos — a API respondeu com erro. " +
        "Suba o backend (uvicorn app.main:app) e recarregue a página."
    );
  }
}

/* ---------------------------------------------------------------------------
 * Editar (PATCH) e Apagar (DELETE) — os poderes de dono
 * ------------------------------------------------------------------------- */

export function abrirEdicao(video) {
  videoEmEdicao = video;
  campoTitulo.value = video.titulo || video.title || "";
  campoDescricao.value = video.descricao || "";
  campoTags.value = Array.isArray(video.tags)
    ? video.tags.join(", ")
    : video.tags || "";
  campoCategoria.value = video.categoria || "";
  definirStatus("");
  modalEditar.classList.remove("hidden");
}

function fecharEdicao() {
  modalEditar.classList.add("hidden");
  videoEmEdicao = null;
}

document.querySelector("#editarClose").addEventListener("click", fecharEdicao);
modalEditar.addEventListener("click", (event) => {
  if (event.target === modalEditar) fecharEdicao();
});

formEditar.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!videoEmEdicao) return;

  const titulo = campoTitulo.value.trim();
  if (!titulo) {
    definirStatus("O título é obrigatório.", "erro");
    return;
  }

  document.querySelector("#editarSubmit").disabled = true;
  definirStatus("Salvando...");
  try {
    await salvarVideo(videoEmEdicao.video_id, {
      titulo,
      descricao: campoDescricao.value.trim(),
      tags: campoTags.value.trim(),
      categoria: campoCategoria.value.trim(),
    });
    definirStatus("Vídeo atualizado!", "ok");
    setTimeout(fecharEdicao, 800);
    carregar();
  } catch (erro) {
    if (erro?.status === 403) {
      definirStatus("Este vídeo pertence a outro professor.", "erro");
    } else {
      definirStatus("Não foi possível salvar. Tente novamente.", "erro");
    }
  } finally {
    document.querySelector("#editarSubmit").disabled = false;
  }
});

export async function apagar(video) {
  const titulo = video.titulo || video.title || "este vídeo";
  if (!window.confirm(`Apagar "${titulo}"? Essa ação não tem volta.`)) return;

  try {
    await apagarVideo(video.video_id);
    carregar();
  } catch (erro) {
    if (erro?.status === 403) {
      window.alert("Este vídeo pertence a outro professor — só o dono apaga.");
    } else {
      window.alert("Não foi possível apagar o vídeo. Tente novamente.");
    }
  }
}

/* ---------------------------------------------------------------------------
 * Início: guard por papel + carga da lista + upload reutilizado
 * ------------------------------------------------------------------------- */

const usuario = exigirPapel(["professor", "admin"]);
if (usuario) {
  // O admin vê aqui os vídeos dele (o seed atribuiu os antigos ao admin).
  carregar();

  iniciarUiUpload({
    onSucesso: () => carregar(),
  });
}
