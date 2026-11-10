/**
 * Origem do backend FastAPI.
 *
 * Vem do config.js. O fallback mantém a página funcionando mesmo sem ele
 * (ex.: testes, ou alguém abrindo um HTML que esqueceu o <script>): quando o
 * player é servido pelo próprio backend (/player/), a API está na mesma
 * origem; senão, assume o uvicorn padrão em localhost:8000.
 */
const API_BASE_URL =
  window.PLAYER_CONFIG?.API_BASE_URL ||
  (window.location.pathname.startsWith("/player")
    ? window.location.origin
    : "http://localhost:8000");

/**
 * Erro de HTTP da API com o status anexado (`error.status`).
 *
 * O número importa para o player decidir o que dizer: 404 = vídeo não existe,
 * 503 = banco sem credenciais, 5xx = backend com problema. Sem ele, tudo
 * viraria a mesma mensagem genérica.
 */
export class ApiError extends Error {
  constructor(status, caminho) {
    super(`API respondeu com HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.caminho = caminho;
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    // credentials "include": envia e aceita o cookie de sessão
    // (edustream_sessao, HttpOnly) — mesma origem (/player) funciona igual;
    // no dev por Live Server é o que faz o cookie cruzar :5500 → :8000.
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    throw new ApiError(response.status, path);
  }

  return response.json();
}

export async function getVideoStatus(videoId) {
  return requestJson(`/status/${encodeURIComponent(videoId)}`);
}

/**
 * O que existe no disco para o vídeo (master.m3u8, thumbnail, segmentos).
 * O player usa isto para explicar POR QUE não deu play (mídia ausente x
 * ainda transcodificando) em vez de ficar repetindo a mesma tentativa.
 */
export async function getMedia(videoId) {
  return requestJson(`/media/${encodeURIComponent(videoId)}`);
}

export async function getRelatedVideos(videoId) {
  return requestJson(`/videos/${encodeURIComponent(videoId)}/relacionados`);
}

export async function getRecommendations(userId) {
  return requestJson(`/recomendacoes/${encodeURIComponent(userId)}`);
}

export async function getTrending() {
  return requestJson("/trending");
}

/**
 * Catálogo de vídeos concluídos.
 *
 * `somenteProntos` (padrão) pede ao backend só os vídeos cuja mídia HLS já
 * existe no disco (`/catalogo?prontos=1`) — é o que garante que TODO card da
 * home toca de verdade. Passe false para listar também o que ainda está sem
 * master.m3u8 (diagnóstico).
 */
export async function getCatalogo(termo = "", somenteProntos = true) {
  // Ordem dos parâmetros é estável (prontos antes de q) para a URL ser
  // reproduzível em log/teste — daí a concatenação manual em vez de
  // URLSearchParams (que escaparia o "&").
  const partes = [];
  if (somenteProntos) partes.push("prontos=1");
  if (termo) partes.push(`q=${encodeURIComponent(termo)}`);
  return requestJson(`/catalogo${partes.length ? `?${partes.join("&")}` : ""}`);
}

export async function getVideo(videoId) {
  return requestJson(`/catalogo/${encodeURIComponent(videoId)}`);
}

export async function registerWatch(payload) {
  return requestJson("/watch", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

/**
 * Autenticação (tela de login, js/login.js).
 *
 * POST /login    {email, senha} -> 200 {usuario:{usuario_id,nome,email}}
 *                              -> 401 credenciais erradas
 *                              -> 503 banco indisponível/mal configurado
 * POST /cadastro {nome, email, senha} -> 201 {usuario:{...}}
 *                              -> 409 e-mail já tem conta
 *                              -> 422 validação (mesmas regras da tela)
 */
export async function loginUsuario(payload) {
  return requestJson("/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function cadastrarUsuario(payload) {
  return requestJson("/cadastro", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

/**
 * Sessão por cookie HttpOnly (revisão de segurança): o token NÃO é lido por
 * JS — quem valida é o servidor.
 *
 *  * buscarSessao — GET /sessao: com cookie válido devolve { usuario }; 401
 *    quando inexistente/expirada (é o que o guard da tela de login consulta
 *    para retomar a sessão de um "Lembrar de mim");
 *  * encerrarSessao — POST /logout: revoga o token NO SERVIDOR e o backend
 *    limpa o cookie; falha de rede é ignorável (o front já derrubou a cópia
 *    local).
 */
export async function buscarSessao() {
  return requestJson("/sessao");
}

export async function encerrarSessao() {
  return requestJson("/logout", { method: "POST" });
}

/**
 * Papéis e contas (migração 002 — admin/professor/estudante).
 *
 * O usuário devolvido por login/cadastro/sessão agora carrega `role` e
 * `primeiro_acesso`: o roteamento por papel é feito no js/sessao.js e a
 * conta de 1º acesso é levada à tela de troca de senha.
 *
 *  * trocarSenha — POST /trocar-senha {senha_atual, nova_senha}: libera a
 *    conta de 1º acesso e atualiza a senha; devolve { usuario } atualizado.
 *  * criarProfessor — POST /admin/professores (SÓ admin): nasce com senha
 *    temporária e primeiro_acesso=true.
 *  * listarUsuarios — GET /admin/usuarios (SÓ admin): painel sem senha_hash.
 */
export async function trocarSenha(payload) {
  return requestJson("/trocar-senha", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function criarProfessor(payload) {
  return requestJson("/admin/professores", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listarUsuarios() {
  return requestJson("/admin/usuarios");
}

/**
 * Vídeos do professor (propriedade — migração 002).
 *
 *  * buscarMeusVideos — GET /meus-videos: só os vídeos DO professor logado
 *    (qualquer status), com views; estudante recebe 403;
 *  * salvarVideo — PATCH /videos/{id}: metadados, SÓ o dono (ou admin);
 *  * apagarVideo — DELETE /videos/{id}: SÓ o dono (ou admin); não-dono
 *    recebe 403 ("Este vídeo pertence a outro professor").
 */
export async function buscarMeusVideos() {
  return requestJson("/meus-videos");
}

export async function salvarVideo(videoId, payload) {
  return requestJson(`/videos/${encodeURIComponent(videoId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function apagarVideo(videoId) {
  return requestJson(`/videos/${encodeURIComponent(videoId)}`, {
    method: "DELETE"
  });
}

/**
 * Sequência de estudos (streak) — GET /streak/meu, exclusivo do estudante.
 *
 * Calculado 100% no servidor (fuso America/Sao_Paulo): o front só desenha.
 * Resposta: { streak, estudou_hoje, registrado_hoje, marco, mensagem } —
 * marco é 3/7/30 quando um milestone foi alcançado, senão null.
 */
export async function buscarStreak() {
  return requestJson("/streak/meu");
}

/**
 * Envia um vídeo novo (multipart/form-data) para o POST /upload.
 *
 * Não passa pelo requestJson de propósito: ele fixaria Content-Type
 * application/json e quebraria o boundary do multipart — aqui o próprio
 * navegador define o cabeçalho certo a partir do FormData.
 */
export async function uploadVideo(formData) {
  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    let detalhe = `API respondeu com HTTP ${response.status}`;
    try {
      const corpo = await response.json();
      if (corpo?.detail) detalhe = corpo.detail;
    } catch (error) {
      // corpo não era JSON: mantém a mensagem genérica
    }
    throw new Error(detalhe);
  }

  return response.json();
}

/**
 * Resolve uma URL de mídia vinda da API para uma URL utilizável no navegador.
 *
 * A API devolve URLs absolutas (http://host:8000/videos/...), mas se vier um
 * caminho relativo de raiz ("/videos/..."), ele precisa ser prefixado com a
 * origem do BACKEND — senão o navegador resolve contra a origem do front
 * (Live Server :5500, por exemplo) e o vídeo dá 404.
 * URLs relativas à página ("./videos/..."), absolutas e data:/blob: passam
 * intactas.
 */
export function resolveMediaUrl(url) {
  if (!url || typeof url !== "string") return url;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (url.startsWith("/")) return `${API_BASE_URL}${url}`;
  return url;
}

export { API_BASE_URL };
