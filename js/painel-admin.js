/**
 * Painel do ADMIN (js/painel-admin.js) — página painel-admin.html.
 *
 * Quatro funções, todas exclusivas do papel admin (o backend revalida com o
 * guard de admin em TODA chamada — o front é só conveniência):
 *
 *  1. visão geral — GET /admin/resumo: cartões com os totais da plataforma
 *     (usuários por papel, vídeos por status, dias de estudo). O cartão de
 *     estudos só existe quando o backend devolve o bloco (dias_estudo
 *     precisa de Supabase; sem ele vem null e o cartão não é desenhado);
 *  2. criar professor — POST /admin/professores: a conta nasce com senha
 *     temporária e primeiro_acesso=true. A senha temporária aparece UMA vez
 *     na resposta da tela (para o admin copiar e passar em pessoa) — depois
 *     disso ela só existe como hash no banco;
 *  3. listar usuários — GET /admin/usuarios: nome, e-mail, papel e data.
 *     senha_hash NUNCA sai do backend (projeção no store);
 *  4. moderação de vídeos — GET /admin/videos + DELETE /videos/{id}: o
 *     catálogo completo com o dono de cada vídeo. Apagar reaproveita a
 *     MESMA rota do dono (o guard _garantir_dono deixa admin passar por
 *     herança de papel) — não existe segunda rota de escrita, o que evita
 *     vigiar duas portas. A ação pede window.confirm e recarrega a lista.
 *
 * O botão "Gerar" sorteia uma senha temporária forte (crypto.getRandomValues)
 * — comodidade do admin, não regra de segurança: a senha pode ser trocada
 * pelo professor no 1º acesso de qualquer jeito.
 *
 * Guard da página: exigirPapel(["admin"]) — professor vai para "Meus
 * vídeos", estudante para a home (redirecionamento mútuo, js/sessao.js).
 */
import {
  apagarVideo,
  criarProfessor,
  listarUsuarios,
  listarVideosAdmin,
  obterResumoAdmin,
} from "./api.js";
import { escapeHtml } from "./recommendations.js";
import { exigirPapel } from "./sessao.js";

const formProfessor = document.querySelector("#formProfessor");
const campoNome = document.querySelector("#profNome");
const campoEmail = document.querySelector("#profEmail");
const campoSenha = document.querySelector("#profSenha");
const botaoSubmit = document.querySelector("#profSubmit");
const botaoGerar = document.querySelector("#gerarSenha");
const statusEl = document.querySelector("#profStatus");

const gradeResumo = document.querySelector("#gradeResumo");
const avisoResumo = document.querySelector("#resumoAviso");

const tabelaUsuarios = document.querySelector("#tabelaUsuarios");
const corpoUsuarios = document.querySelector("#corpoUsuarios");
const avisoUsuarios = document.querySelector("#usuariosAviso");

const tabelaVideos = document.querySelector("#tabelaVideos");
const corpoVideos = document.querySelector("#corpoVideos");
const avisoVideos = document.querySelector("#videosAviso");

const ROTULO_PAPEL = {
  admin: "Admin",
  professor: "Professor",
  estudante: "Estudante",
};

const ROTULO_STATUS = {
  pending: "Na fila",
  processing: "Transcodificando",
  completed: "Pronto",
  failed: "Falhou",
};

function definirStatus(texto, classe = "") {
  statusEl.textContent = texto;
  statusEl.className = `upload-status ${classe}`.trim();
}

/** Senha temporária forte: 16 caracteres de um alfabeto diversificado. */
export function gerarSenhaTemporaria(tamanho = 16) {
  const alfabeto =
    "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
  const valores = new Uint32Array(tamanho);
  crypto.getRandomValues(valores);
  return Array.from(
    valores,
    (valor) => alfabeto[valor % alfabeto.length]
  ).join("");
}

botaoGerar.addEventListener("click", () => {
  campoSenha.value = gerarSenhaTemporaria();
});

formProfessor.addEventListener("submit", async (event) => {
  event.preventDefault();

  const nome = campoNome.value.trim();
  const email = campoEmail.value.trim();
  const senha = campoSenha.value;

  if (nome.length < 2) {
    definirStatus("Informe o nome do professor.", "erro");
    return;
  }
  if (!email || !email.includes("@") || !email.includes(".")) {
    definirStatus("Informe um e-mail válido.", "erro");
    return;
  }
  if (senha.length < 8) {
    definirStatus("A senha temporária precisa de pelo menos 8 caracteres.", "erro");
    return;
  }

  botaoSubmit.disabled = true;
  definirStatus("Criando conta...");
  try {
    const resposta = await criarProfessor({ nome, email, senha_temporaria: senha });
    definirStatus(
      `${resposta.mensagem} E-mail: ${email} · Senha temporária: ${senha}`,
      "ok"
    );
    formProfessor.reset();
    carregarUsuarios();
    carregarResumo();
  } catch (erro) {
    if (erro?.status === 403) {
      definirStatus("Apenas administradores podem criar professores.", "erro");
    } else if (erro?.status === 409) {
      definirStatus("Este e-mail já tem uma conta.", "erro");
    } else if (erro?.status === 422) {
      definirStatus(
        "Dados inválidos — confira nome, e-mail e a força da senha.",
        "erro"
      );
    } else {
      definirStatus("Não foi possível criar a conta. Tente novamente.", "erro");
    }
  } finally {
    botaoSubmit.disabled = false;
  }
});

/* ---------------------------------------------------------------------------
 * Visão geral — cartões de totais (GET /admin/resumo)
 * ------------------------------------------------------------------------- */

function cartaoResumo(valor, rotulo, detalhe) {
  const card = document.createElement("div");
  card.className = "stat-card";

  const numero = document.createElement("div");
  numero.className = "stat-valor";
  numero.textContent = String(valor);

  const nome = document.createElement("div");
  nome.className = "stat-rotulo";
  nome.textContent = rotulo;

  card.append(numero, nome);
  if (detalhe) {
    const sub = document.createElement("div");
    sub.className = "stat-detalhe";
    sub.textContent = detalhe;
    card.append(sub);
  }
  return card;
}

export function renderizarResumo(resumo) {
  const usuarios = resumo.usuarios || {};
  const videos = resumo.videos || {};

  const cartoes = [
    cartaoResumo(
      usuarios.total ?? 0,
      "Usuários",
      `${usuarios.admins ?? 0} admin · ${usuarios.professores ?? 0} professores · ${usuarios.estudantes ?? 0} estudantes`
    ),
    cartaoResumo(
      videos.total ?? 0,
      "Vídeos",
      `${videos.prontos ?? 0} prontos · ${videos.processando ?? 0} processando · ${videos.pendentes ?? 0} na fila${videos.falhos ? ` · ${videos.falhos} falhos` : ""}`
    ),
  ];

  // Bloco best-effort: sem a tabela dias_estudo o backend manda null e o
  // cartão simplesmente não nasce (o resto da visão geral segue de pé).
  if (resumo.estudos) {
    cartoes.push(
      cartaoResumo(
        resumo.estudos.dias_registrados ?? 0,
        "Dias de estudo",
        `${resumo.estudos.alunos_ativos ?? 0} aluno(s) com sequência`
      )
    );
  }

  gradeResumo.replaceChildren(...cartoes);
}

export async function carregarResumo() {
  avisoResumo.hidden = true;
  try {
    renderizarResumo(await obterResumoAdmin());
  } catch (erro) {
    gradeResumo.replaceChildren();
    avisoResumo.textContent =
      erro?.status === 403
        ? "Apenas administradores veem a visão geral."
        : "Não foi possível carregar a visão geral (API indisponível?).";
    avisoResumo.hidden = false;
  }
}

/* ---------------------------------------------------------------------------
 * Lista de usuários (GET /admin/usuarios)
 * ------------------------------------------------------------------------- */

export function linhaDoUsuario(usuario) {
  const tr = document.createElement("tr");

  const tdNome = document.createElement("td");
  tdNome.textContent = usuario.nome || "—";

  const tdEmail = document.createElement("td");
  tdEmail.textContent = usuario.email || "—";

  const tdPapel = document.createElement("td");
  const papel = usuario.role || "estudante";
  tdPapel.innerHTML =
    `<span class="badge-status badge-papel-${escapeHtml(papel)}">` +
    `${escapeHtml(ROTULO_PAPEL[papel] || papel)}</span>`;

  const tdData = document.createElement("td");
  const data = usuario.criado_em ? new Date(usuario.criado_em) : null;
  tdData.textContent =
    data && !Number.isNaN(data.getTime()) ? data.toLocaleDateString("pt-BR") : "—";

  tr.append(tdNome, tdEmail, tdPapel, tdData);
  return tr;
}

export function renderizarUsuarios(usuarios) {
  corpoUsuarios.replaceChildren(...usuarios.map(linhaDoUsuario));
  tabelaUsuarios.hidden = usuarios.length === 0;
}

export async function carregarUsuarios() {
  avisoUsuarios.hidden = true;
  try {
    const resposta = await listarUsuarios();
    renderizarUsuarios(resposta.usuarios || []);
  } catch (erro) {
    if (erro?.status === 403) {
      avisoUsuarios.textContent =
        "Apenas administradores veem a lista de usuários.";
    } else {
      avisoUsuarios.textContent =
        "Não foi possível carregar a lista de usuários (API indisponível?).";
    }
    avisoUsuarios.hidden = false;
    tabelaUsuarios.hidden = true;
  }
}

/* ---------------------------------------------------------------------------
 * Moderação de vídeos (GET /admin/videos + DELETE /videos/{id})
 * ------------------------------------------------------------------------- */

function dataCurta(iso) {
  if (!iso) return "—";
  const data = new Date(iso);
  return Number.isNaN(data.getTime())
    ? "—"
    : data.toLocaleDateString("pt-BR");
}

export function linhaDoVideoAdmin(video) {
  const tr = document.createElement("tr");

  const tdTitulo = document.createElement("td");
  tdTitulo.textContent = video.titulo || video.title || "Sem título";

  const tdDono = document.createElement("td");
  const dono = video.dono;
  if (dono) {
    tdDono.textContent = dono.nome ? `${dono.nome} (${dono.email})` : dono.email;
  } else {
    tdDono.textContent = "Sem dono";
    tdDono.className = "celula-muted";
  }

  const tdCategoria = document.createElement("td");
  tdCategoria.textContent = video.categoria || "—";

  const tdStatus = document.createElement("td");
  const status = video.status || "pending";
  tdStatus.innerHTML =
    `<span class="badge-status badge-${escapeHtml(status)}">` +
    `${escapeHtml(ROTULO_STATUS[status] || status)}</span>`;

  const tdViews = document.createElement("td");
  tdViews.textContent = String(video.views ?? 0);

  const tdData = document.createElement("td");
  tdData.textContent = dataCurta(video.criado_em);

  const tdAcoes = document.createElement("td");
  tdAcoes.className = "acoes";

  const linkVer = document.createElement("a");
  linkVer.className = "btn-acao";
  linkVer.href = `index.html?video=${encodeURIComponent(video.video_id)}`;
  linkVer.textContent = "Ver";

  const botaoApagar = document.createElement("button");
  botaoApagar.type = "button";
  botaoApagar.className = "btn-acao btn-acao-perigo";
  botaoApagar.textContent = "Apagar";
  botaoApagar.addEventListener("click", () => apagarComoAdmin(video));

  tdAcoes.append(linkVer, botaoApagar);
  tr.append(tdTitulo, tdDono, tdCategoria, tdStatus, tdViews, tdData, tdAcoes);
  return tr;
}

export function renderizarVideosAdmin(videos) {
  corpoVideos.replaceChildren(...videos.map(linhaDoVideoAdmin));
  tabelaVideos.hidden = videos.length === 0;
}

export async function carregarVideosAdmin() {
  avisoVideos.hidden = true;
  try {
    const resposta = await listarVideosAdmin();
    renderizarVideosAdmin(resposta.videos || []);
  } catch (erro) {
    if (erro?.status === 403) {
      avisoVideos.textContent =
        "Apenas administradores veem o catálogo completo.";
    } else {
      avisoVideos.textContent =
        "Não foi possível carregar os vídeos (API indisponível?).";
    }
    avisoVideos.hidden = false;
    tabelaVideos.hidden = true;
  }
}

/** Moderação: apaga vídeo de QUALQUER professor — rota de dono, papel admin. */
export async function apagarComoAdmin(video) {
  const titulo = video.titulo || video.title || "este vídeo";
  if (!window.confirm(`Apagar "${titulo}"? Essa ação não tem volta.`)) return;

  try {
    await apagarVideo(video.video_id);
    carregarVideosAdmin();
    carregarResumo();
  } catch (erro) {
    if (erro?.status === 403) {
      window.alert("Sessão sem permissão de admin — recarregue a página.");
    } else {
      window.alert("Não foi possível apagar o vídeo. Tente novamente.");
    }
  }
}

/* Início: guard só de admin + carga das três seções. */
const usuario = exigirPapel(["admin"]);
if (usuario) {
  carregarResumo();
  carregarUsuarios();
  carregarVideosAdmin();
}
