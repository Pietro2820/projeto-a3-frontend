/**
 * Tela cheia de upload (upload.html + js/upload-pagina.js).
 *
 * Regressões dos três defeitos do script inline antigo:
 *  - o arquivo tem de ir no campo `file` (o backend respondia 422 com `arquivo`);
 *  - o XHR tem de levar o cookie de sessão (withCredentials);
 *  - nada de <script> inline (o CSP do backend bloqueia em /player).
 * E o guard: só professor/admin usam a página.
 */
import { jest } from "@jest/globals";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const uploadHtml = readFileSync(
  fileURLToPath(new URL("../upload.html", import.meta.url)),
  "utf8"
);

/** XMLHttpRequest dublado: guarda o que foi enviado e responde sob comando. */
class XhrFalso {
  constructor() {
    this.ouvintes = {};
    this.upload = { addEventListener: jest.fn() };
    XhrFalso.ultimo = this;
  }
  open(metodo, url) { this.metodo = metodo; this.url = url; }
  addEventListener(evento, fn) { this.ouvintes[evento] = fn; }
  send(corpo) { this.corpo = corpo; }
  responder(status, corpo) {
    this.status = status;
    this.responseText = JSON.stringify(corpo);
    this.ouvintes.load();
  }
}

async function subirPagina({ papelPermitido = true } = {}) {
  jest.resetModules();
  const doc = new DOMParser().parseFromString(uploadHtml, "text/html");
  document.body.innerHTML = doc.body.innerHTML;

  const exigirPapel = jest.fn(() => (papelPermitido ? { role: "professor" } : null));
  jest.unstable_mockModule("../js/sessao.js", () => ({ exigirPapel }));
  jest.unstable_mockModule("../js/api.js", () => ({ API_BASE_URL: "http://127.0.0.1:8000" }));

  const modulo = await import("../js/upload-pagina.js");
  return { modulo, exigirPapel };
}

function preencher() {
  const arquivo = new File([new Uint8Array([0, 0, 0, 24])], "aula.mp4", { type: "video/mp4" });
  Object.defineProperty(document.getElementById("uploadFile"), "files", { value: [arquivo] });
  document.getElementById("uploadTitulo").value = "Aula nova";
  document.getElementById("uploadAutor").value = "Rafael";
}

afterEach(() => {
  jest.restoreAllMocks();
  document.body.innerHTML = "";
});

test("upload.html não tem script inline (CSP script-src 'self')", () => {
  const doc = new DOMParser().parseFromString(uploadHtml, "text/html");
  const inline = [...doc.querySelectorAll("script")].filter((s) => !s.getAttribute("src"));
  expect(inline).toHaveLength(0);
  expect(doc.querySelector('script[src="./js/upload-pagina.js"]')).not.toBeNull();
});

test("só professor/admin: o guard é chamado com esses papéis", async () => {
  const { exigirPapel } = await subirPagina();
  expect(exigirPapel).toHaveBeenCalledWith(["professor", "admin"]);
});

test("envia o arquivo no campo `file`, com cookie, para a API configurada", async () => {
  const { modulo } = await subirPagina({ papelPermitido: false });
  modulo.iniciarPaginaUpload({ criarXhr: () => new XhrFalso() });
  preencher();

  document.getElementById("uploadForm").dispatchEvent(new Event("submit", { cancelable: true }));

  const xhr = XhrFalso.ultimo;
  expect(xhr.metodo).toBe("POST");
  expect(xhr.url).toBe("http://127.0.0.1:8000/upload");
  expect(xhr.withCredentials).toBe(true);
  expect(xhr.corpo.get("file")).toBeInstanceOf(File);
  expect(xhr.corpo.get("arquivo")).toBeNull();
  expect(xhr.corpo.get("titulo")).toBe("Aula nova");
});

test("erro da API mostra o detail legível e reabilita o botão", async () => {
  const { modulo } = await subirPagina({ papelPermitido: false });
  modulo.iniciarPaginaUpload({ criarXhr: () => new XhrFalso() });
  preencher();
  document.getElementById("uploadForm").dispatchEvent(new Event("submit", { cancelable: true }));

  XhrFalso.ultimo.responder(400, { detail: "O conteúdo do arquivo não é um vídeo mp4 válido." });

  expect(document.getElementById("statusMessage").textContent)
    .toBe("O conteúdo do arquivo não é um vídeo mp4 válido.");
  expect(document.getElementById("uploadSubmit").disabled).toBe(false);
});

test("sucesso acompanha o status e abre o vídeo pronto", async () => {
  const { modulo } = await subirPagina({ papelPermitido: false });
  global.fetch = jest.fn(async () => ({
    ok: true, status: 200, json: async () => ({ status: "completed" }),
  }));
  const navegar = jest.fn();
  jest.useFakeTimers();
  modulo.iniciarPaginaUpload({ criarXhr: () => new XhrFalso(), intervaloMs: 10, navegar });
  preencher();
  document.getElementById("uploadForm").dispatchEvent(new Event("submit", { cancelable: true }));

  XhrFalso.ultimo.responder(200, { video_id: "v-novo" });
  await jest.advanceTimersByTimeAsync(20);
  await jest.advanceTimersByTimeAsync(1600);
  jest.useRealTimers();

  expect(global.fetch).toHaveBeenCalledWith(
    "http://127.0.0.1:8000/status/v-novo",
    expect.objectContaining({ credentials: "include" })
  );
  expect(navegar).toHaveBeenCalledWith("./index.html?video=v-novo");
});

test("submit sem arquivo avisa e não envia", async () => {
  const { modulo } = await subirPagina({ papelPermitido: false });
  const criarXhr = jest.fn(() => new XhrFalso());
  modulo.iniciarPaginaUpload({ criarXhr });

  document.getElementById("uploadForm").dispatchEvent(new Event("submit", { cancelable: true }));

  expect(criarXhr).not.toHaveBeenCalled();
  expect(document.getElementById("statusMessage").textContent).toContain("Escolha um arquivo");
});
