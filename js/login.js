/**
 * Tela de ENTRAR (js/login.js) — página login.html.
 *
 * Integração REAL com a API (branch feature/login-banco):
 *   - POST /login (app/auth/router.py) — valida e-mail+senha contra a tabela
 *     `usuarios` do Supabase e devolve os dados públicos do usuário (agora
 *     com `role` e `primeiro_acesso`);
 *   - após autenticar, a sessão fica em sessionStorage (chave
 *     "edustream.usuario", via js/sessao.js) e irParaDestino() roteia:
 *       1. conta de 1º acesso (primeiro_acesso=true) → trocar-senha.html
 *          — o backend bloqueia as demais rotas até a senha mudar;
 *       2. ?proximo → o destino pedido (ex.: index.html?video=v1);
 *       3. sem ?proximo → o destino do PAPEL: estudante → home.html,
 *          professor → meus-videos.html, admin → painel-admin.html.
 *
 * Criar conta agora é uma PÁGINA PRÓPRIA (cadastro.html + js/cadastro.js):
 * o rodapé do card aponta para lá, e o ?proximo via junto no link
 * (preservarProximo) — a pessoa não perde o vídeo que ia assistir.
 *
 * O guard de entrada é o js/sessao.js (home e watch exigem login); este
 * arquivo é o outro lado do fluxo: autenticar e devolver o usuário ao lugar
 * de onde ele veio. As regras de validação/toggle/erros vivem no
 * js/formulario.js (compartilhado com o cadastro).
 */
import { loginUsuario } from "./api.js";
import { entrar, irParaDestino, retomarSessao } from "./sessao.js";
import {
  definirCarregando,
  ligarToggleSenha,
  limparAviso,
  limparCredenciaisDaUrl,
  limparSenhas,
  mostrarAviso,
  preservarProximo,
  revalidarAoDigitar,
  tratarErroApi,
  validarEmail,
  validarSenha,
} from "./formulario.js";

const form = document.querySelector("#loginForm");
const campoEmail = document.querySelector("#email");
const campoSenha = document.querySelector("#senha");
const botaoEnviar = document.querySelector("#btnEntrar");

const botaoToggle = document.querySelector("#toggleSenha");
const aviso = document.querySelector("#loginAviso");

const erroEmail = document.querySelector("#emailErro");
const erroSenha = document.querySelector("#senhaErro");
const capsAviso = document.querySelector("#capsAviso");

const linkCadastro = document.querySelector("#linkCadastro");

/* Mostrar/esconder senha + aviso de Caps Lock. */
ligarToggleSenha(botaoToggle, campoSenha, capsAviso);

/* O link "Criar conta" leva o ?proximo junto para o cadastro. */
preservarProximo(linkCadastro);

/* Revalida enquanto digita: o erro some assim que o campo fica válido. */
revalidarAoDigitar(campoEmail, () => validarEmail(campoEmail, erroEmail));
revalidarAoDigitar(campoSenha, () => validarSenha(campoSenha, erroSenha));

/* ---------------------------------------------------------------------------
 * Higiene de segurança ao carregar a tela
 * ------------------------------------------------------------------------- */

/* Se esta página foi aberta com credenciais na URL (ex.: submit nativo que
 * escapou num ambiente sem JS, ou link colado à mão), a query é limpa AGORA
 * e os valores NÃO são usados para nada — só o ?proximo interessa. */
limparCredenciaisDaUrl();

/* Sessão viva? ("Lembrar de mim" deixa um cookie HttpOnly válido mesmo com o
 * sessionStorage vazio — retomarSessao pergunta ao servidor via GET /sessao;
 * 401/falha de rede simplesmente deixa a tela de login normal.) */
void retomarSessao();

/* ---------------------------------------------------------------------------
 * Envio do LOGIN (POST /login real)
 * ------------------------------------------------------------------------- */

async function enviar(evento) {
  // PRIMEIRA instrução do handler: nunca deixar o submit nativo escapar —
  // com method="post" + action="#" o fallback até seria seguro (POST sem
  // query), mas aqui a resposta sai via fetch com corpo JSON.
  evento.preventDefault();
  limparAviso(aviso);

  const emailOk = validarEmail(campoEmail, erroEmail);
  const senhaOk = validarSenha(campoSenha, erroSenha);

  // Foco vai direto pro primeiro campo inválido (teclado e leitores de tela).
  if (!emailOk) {
    campoEmail.focus();
    return;
  }
  if (!senhaOk) {
    campoSenha.focus();
    return;
  }

  definirCarregando(botaoEnviar, true);

  // "Lembrar de mim" NUNCA guarda a senha — com sessão por cookie HttpOnly
  // o que ele muda é a validade do cookie no servidor (Max-Age de LEMBRAR_DIAS
  // em vez de cookie de sessão). A senha existe só neste request.
  const lembrar = document.querySelector("#lembrar")?.checked ?? false;

  try {
    const resposta = await loginUsuario({
      email: campoEmail.value.trim(),
      senha: campoSenha.value,
      lembrar,
    });

    // O backend devolve { usuario: { usuario_id, nome, email } } e deixou o
    // cookie de sessão HttpOnly no navegador (invisível para este JS).
    entrar(resposta.usuario);
    limparSenhas(campoSenha); // a senha morre com o request — nada pendurado
    // Vai para o ?proximo validado (allowlist em js/sessao.js) — ou para a
    // home quando o login foi direto pela tela.
    irParaDestino();
  } catch (erro) {
    tratarErroApi(erro, { campoEmail, erroEmail, campoSenha, erroSenha, aviso });
    limparSenhas(campoSenha); // erro também limpa — relogin começa do zero
    definirCarregando(botaoEnviar, false);
  }
}

form.addEventListener("submit", enviar);

/* ---------------------------------------------------------------------------
 * Recuperação de senha (ainda sem endpoint — aviso não-bloqueante)
 * ------------------------------------------------------------------------- */

document.querySelector("#esqueciSenha").addEventListener("click", () => {
  mostrarAviso(aviso, "A recuperação de senha será implementada em uma próxima etapa. Por enquanto, use o usuário de teste do SQL ou crie uma nova conta.");
});
