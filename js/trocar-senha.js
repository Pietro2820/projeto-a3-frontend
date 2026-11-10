/**
 * Troca de senha (js/trocar-senha.js) — página trocar-senha.html.
 *
 * O fluxo do 1º acesso (migração 002): o admin cria a conta do professor
 * com uma senha temporária; no login o backend marca primeiro_acesso=true e
 * o js/sessao.js traz o professor PARA CÁ. O backend só libera as demais
 * rotas depois do POST /trocar-senha — esta tela é o passo que falta.
 *
 * A página também serve como "trocar senha" comum (conta já liberada): o
 * formulário é o mesmo; ao sair daqui o usuário volta ao destino do papel.
 *
 * Validações do cliente espelham as do backend (js/formulario.js):
 *   - senha nova com no mínimo 8 caracteres;
 *   - confirmação igual;
 *   - "senha atual" é verificada pelo SERVIDOR (401 quando errada) — o
 *     cliente não tem como conferir, e não deveria.
 *
 * Depois do sucesso: atualiza a cópia local da sessão (entrar() com o
 * usuario atualizado — primeiro_acesso=false) e navega ao destino do papel
 * via irParaDestino() — professor cai no "Meus vídeos", admin no painel.
 */
import { trocarSenha } from "./api.js";
import { entrar, irParaDestino } from "./sessao.js";
import {
  definirCarregando,
  limparAviso,
  limparErro,
  limparSenhas,
  mostrarAviso,
  mostrarErro,
  revalidarAoDigitar,
  validarConfirmacaoSenha,
  validarSenha,
} from "./formulario.js";

const form = document.querySelector("#trocarForm");
const campoAtual = document.querySelector("#senhaAtual");
const campoNova = document.querySelector("#novaSenha");
const campoConfirmar = document.querySelector("#confirmarSenha");
const botaoEnviar = document.querySelector("#btnTrocar");
const aviso = document.querySelector("#trocarAviso");

const erroAtual = document.querySelector("#senhaAtualErro");
const erroNova = document.querySelector("#novaSenhaErro");
const erroConfirmar = document.querySelector("#confirmarSenhaErro");

/* Revalida enquanto digita: o erro some assim que o campo fica válido. */
revalidarAoDigitar(campoNova, () => validarSenha(campoNova, erroNova));
revalidarAoDigitar(campoConfirmar, () =>
  validarConfirmacaoSenha(campoNova, campoConfirmar, erroConfirmar)
);

async function enviar(evento) {
  // Primeira instrução do handler: nunca deixar o submit nativo escapar.
  evento.preventDefault();
  limparAviso(aviso);

  const novaOk = validarSenha(campoNova, erroNova);
  const confirmarOk = validarConfirmacaoSenha(
    campoNova,
    campoConfirmar,
    erroConfirmar
  );
  if (!campoAtual.value) {
    mostrarErro(campoAtual, erroAtual, "Informe a senha atual.");
    campoAtual.focus();
    return;
  }
  if (!novaOk) {
    campoNova.focus();
    return;
  }
  if (!confirmarOk) {
    campoConfirmar.focus();
    return;
  }

  definirCarregando(botaoEnviar, true);

  try {
    const resposta = await trocarSenha({
      senha_atual: campoAtual.value,
      nova_senha: campoNova.value,
    });

    // A cópia local da sessão é atualizada com o usuario que o backend
    // devolveu (primeiro_acesso=false) — o roteamento por papel funciona
    // na hora, sem relógio de espera nem relogin.
    entrar(resposta.usuario);
    limparSenhas(campoAtual, campoNova, campoConfirmar);
    irParaDestino();
  } catch (erro) {
    // ApiError (js/api.js) carrega o status HTTP — a mensagem certa para
    // cada caso: 401 senha atual errada, 422 regras, 503 infraestrutura.
    if (erro?.status === 401) {
      mostrarAviso(aviso, "A senha atual não confere. Tente de novo.");
      campoAtual.focus();
    } else if (erro?.status === 422) {
      mostrarAviso(
        aviso,
        "A senha nova não passou nas regras — use pelo menos 8 caracteres e evite senhas muito comuns."
      );
    } else if (erro?.status === 503) {
      mostrarAviso(aviso, "Banco de dados indisponível. Tente novamente em instantes.");
    } else {
      mostrarAviso(aviso, "Não foi possível trocar a senha. Tente novamente.");
    }
    limparSenhas(campoAtual, campoNova, campoConfirmar);
    definirCarregando(botaoEnviar, false);
  }
}

form.addEventListener("submit", enviar);

/* Limpeza de erro da "senha atual" enquanto digita (sem regra de formato). */
campoAtual.addEventListener("input", () => limparErro(campoAtual, erroAtual));
