/**
 * Painel do ADMIN (js/painel-admin.js) — página painel-admin.html.
 *
 * Duas funções, ambas exclusivas do papel admin (o backend revalida com o
 * guard de admin em TODA chamada — o front é só conveniência):
 *
 *  1. criar professor — POST /admin/professores: a conta nasce com senha
 *     temporária e primeiro_acesso=true. A senha temporária aparece UMA vez
 *     na resposta da tela (para o admin copiar e passar em pessoa) — depois
 *     disso ela só existe como hash no banco;
 *  2. listar usuários — GET /admin/usuarios: nome, e-mail, papel e data.
 *     senha_hash NUNCA sai do backend (projeção no store).
 *
 * O botão "Gerar" sorteia uma senha temporária forte (crypto.getRandomValues)
 * — comodidade do admin, não regra de segurança: a senha pode ser trocada
 * pelo professor no 1º acesso de qualquer jeito.
 *
 * Guard da página: exigirPapel(["admin"]) — professor vai para "Meus
 * vídeos", estudante para a home (redirecionamento mútuo, js/sessao.js).
 */
import { criarProfessor, listarUsuarios } from "./api.js";
import { escapeHtml } from "./recommendations.js";
import { exigirPapel } from "./sessao.js";

const formProfessor = document.querySelector("#formProfessor");
const campoNome = document.querySelector("#profNome");
const campoEmail = document.querySelector("#profEmail");
const campoSenha = document.querySelector("#profSenha");
const botaoSubmit = document.querySelector("#profSubmit");
const botaoGerar = document.querySelector("#gerarSenha");
const statusEl = document.querySelector("#profStatus");

const tabelaUsuarios = document.querySelector("#tabelaUsuarios");
const corpoUsuarios = document.querySelector("#corpoUsuarios");
const avisoUsuarios = document.querySelector("#usuariosAviso");

const ROTULO_PAPEL = {
  admin: "Admin",
  professor: "Professor",
  estudante: "Estudante",
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

/* Início: guard só de admin + carga da lista. */
const usuario = exigirPapel(["admin"]);
if (usuario) {
  carregarUsuarios();
}
