/**
 * Página de upload em tela cheia (upload.html), com barra de progresso.
 *
 * Antes isto era um <script> inline no upload.html, com três defeitos que
 * faziam TODO envio falhar:
 *
 *  1. o arquivo ia no campo `arquivo`, mas o POST /upload espera `file`
 *     (app/upload/router.py) → a API respondia 422 sempre;
 *  2. o XMLHttpRequest não tinha `withCredentials`: com o front no Live
 *     Server (:5500) o cookie de sessão não ia junto → 401 "sessão expirada";
 *  3. servido pelo backend (/player/upload.html), o CSP `script-src 'self'`
 *     bloqueia script inline → o botão Enviar não fazia nada.
 *
 * Agora é um módulo (permitido pelo CSP), usa a mesma origem da API que o
 * resto do front (js/api.js) e só professor/admin entram na página — o
 * estudante, que receberia 403 do backend, volta para a home.
 */
import { API_BASE_URL } from "./api.js";
import { exigirPapel } from "./sessao.js";

/** Intervalo do polling de GET /status/{id} (ms). */
const INTERVALO_STATUS_MS = 3000;

function mensagemDeErro(xhr) {
  if (xhr.status === 401) return "Sessão expirada. Faça login novamente.";
  if (xhr.status === 403) return "Sem permissão para enviar vídeos.";
  try {
    const corpo = JSON.parse(xhr.responseText);
    if (typeof corpo?.detail === "string") return corpo.detail;
  } catch (erro) {
    // corpo não era JSON: cai na mensagem genérica
  }
  return `Erro no upload (HTTP ${xhr.status}).`;
}

/**
 * Liga o formulário da página. Exportado para os testes; no navegador é
 * chamado no import (fim do arquivo).
 *
 * @param {object} [opcoes]
 * @param {number} [opcoes.intervaloMs] polling do status
 * @param {Function} [opcoes.navegar] troca de página (injetável no teste)
 * @param {Function} [opcoes.criarXhr] fábrica do XMLHttpRequest (teste)
 */
export function iniciarPaginaUpload({
  intervaloMs = INTERVALO_STATUS_MS,
  navegar = (url) => window.location.assign(url),
  criarXhr = () => new XMLHttpRequest(),
} = {}) {
  const form = document.getElementById("uploadForm");
  if (!form) return null;

  const submitBtn = document.getElementById("uploadSubmit");
  const progressSection = document.getElementById("progressSection");
  const progressFill = document.getElementById("progressFill");
  const progressPercent = document.getElementById("progressPercent");
  const progressLabel = document.getElementById("progressLabel");
  const statusMessage = document.getElementById("statusMessage");

  function setProgress(pct, label, state) {
    progressFill.style.width = `${pct}%`;
    progressFill.textContent = `${pct}%`;
    progressPercent.textContent = `${pct}%`;
    progressLabel.textContent = label;
    if (state === "success") progressFill.classList.add("success");
    if (state === "error") progressFill.classList.add("failed");
  }

  function setStatus(msg, state) {
    statusMessage.textContent = msg;
    statusMessage.className = `status-message${state ? ` ${state}` : ""}`;
  }

  function resetForm() {
    submitBtn.disabled = false;
    submitBtn.textContent = "Enviar";
  }

  function acompanharStatus(videoId) {
    progressFill.classList.add("processing");
    progressLabel.textContent = "Processando...";

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/status/${encodeURIComponent(videoId)}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "completed") {
          clearInterval(timer);
          progressFill.classList.remove("processing");
          setStatus("✅ Vídeo pronto! Redirecionando...", "success");
          setProgress(100, "Concluído", "success");
          setTimeout(() => navegar(`./index.html?video=${encodeURIComponent(videoId)}`), 1500);
        } else if (data.status === "failed") {
          clearInterval(timer);
          progressFill.classList.remove("processing");
          progressFill.classList.add("failed");
          setStatus(`❌ Falha no processamento: ${data.erro || "erro desconhecido"}`, "error");
          resetForm();
        } else {
          const rotulo = data.status === "pending" ? "Na fila" : "Transcodificando";
          progressLabel.textContent = rotulo;
          setStatus(`⏳ ${rotulo}... (FFmpeg gerando as qualidades HLS)`, "");
        }
      } catch (erro) {
        console.error("Erro ao verificar status:", erro);
      }
    }, intervaloMs);
    return timer;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const file = document.getElementById("uploadFile").files[0];
    if (!file) {
      setStatus("Escolha um arquivo de vídeo.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando...";
    progressSection.classList.add("visible");
    setStatus("Enviando arquivo...", "");

    const formData = new FormData();
    // `file` é o nome do campo no backend (UploadFile = File(...)).
    formData.append("file", file);
    formData.append("titulo", document.getElementById("uploadTitulo").value.trim());
    formData.append("autor", document.getElementById("uploadAutor").value.trim());
    formData.append("descricao", document.getElementById("uploadDescricao").value.trim());
    formData.append("tags", document.getElementById("uploadTags").value.trim());
    formData.append("categoria", document.getElementById("uploadCategoria").value.trim());

    const xhr = criarXhr();
    xhr.open("POST", `${API_BASE_URL}/upload`, true);
    // Leva o cookie de sessão (HttpOnly) também quando o front está em
    // outra porta (Live Server :5500 → API :8000).
    xhr.withCredentials = true;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100), "Enviando...", "");
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        setStatus("Upload concluído! Processando vídeo...", "success");
        setProgress(100, "Upload concluído", "");
        acompanharStatus(data.video_id);
      } else {
        setStatus(mensagemDeErro(xhr), "error");
        resetForm();
      }
    });

    xhr.addEventListener("error", () => {
      setStatus("Erro de conexão com o backend.", "error");
      resetForm();
    });

    xhr.send(formData);
  });

  return form;
}

// Na página real: só professor/admin; os demais vão para o destino do papel.
if (document.getElementById("uploadForm") && exigirPapel(["professor", "admin"])) {
  iniciarPaginaUpload();
}
