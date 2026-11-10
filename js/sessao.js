/**
 * Sessão do EduStream (js/sessao.js).
 *
 * Com a autenticação real (branch feature/login-banco), o player deixou de ser
 * aberto: HOME e WATCH PAGE só funcionam com sessão ativa. Este módulo é o
 * guard de entrada e a fonte única de verdade da sessão no navegador.
 *
 * Como funciona
 * -------------
 *  * O login (js/login.js) guarda os dados do usuário em sessionStorage na
 *    chave "edustream.usuario" — via entrar(), NUNCA escrevendo direto;
 *  * home.html e index.html carregam este módulo ANTES do js da página. Ao ser
 *    importado ele executa exigirLogin(): sem sessão, redireciona para
 *    login.html?proximo=<página+query atual>;
 *  * Depois de autenticar, login.js chama irParaDestino(): devolve o usuário
 *    EXATAMENTE para onde ele ia (ex.: index.html?video=v1) — o ?proximo é
 *    validado por allowlist para não virar redirect aberto;
 *  * PAPEIS (migração 002): sem ?proximo o destino é por papel — estudante
 *    → home.html, professor → meus-videos.html, admin → painel-admin.html.
 *    Conta de 1º acesso (primeiro_acesso=true) vai SEMPRE para
 *    trocar-senha.html antes de qualquer outra página (o backend bloqueia
 *    as rotas de qualquer forma — aqui é conveniência);
 *  * exigirPapel(...) é o guard de página por papel: quem não tem o papel
 *    volta para o próprio destino (redirecionamento mútuo);
 *  * O botão "Sair" da topbar limpa a sessão e volta ao login;
 *  * De quebra, o USER_ID do player (POST /watch → recomendações) passa a ser
 *    o usuário autenticado — antes era o "demo-user" do config.js.
 *
 * Por que o guard é um módulo separado: home.js e player.js continuam sem
 * saber de sessão (nenhum teste existente precisou mudar), e o comportamento
 * do guard tem suíte própria (tests/sessao.test.js).
 */

import { buscarSessao, encerrarSessao } from "./api.js";

const CHAVE_SESSAO = "edustream.usuario";

/** Páginas para onde o ?proximo pode mandar o usuário depois do login. */
const DESTINOS_PERMITIDOS = new Set([
  "home.html",
  "index.html",
  "meus-videos.html",
  "painel-admin.html",
  "trocar-senha.html",
]);

/** Destino padrão por papel (migração 002) — o ?proximo tem prioridade. */
const DESTINOS_POR_PAPEL = {
  estudante: "home.html",
  professor: "meus-videos.html",
  admin: "painel-admin.html",
};

const DESTINO_PADRAO = "./home.html";
const PAGINA_LOGIN = "./login.html";
const PAGINA_TROCAR_SENHA = "./trocar-senha.html";

/**
 * Navegação padrão — a ÚNICA saída do módulo para window.location.
 *
 * Existe como parâmetro injetável (`{ navegar }`) porque o jsdom sela o
 * objeto location (não-configurável): espiar `location.assign` não é
 * possível, e os testes injetam um dublê no lugar. No navegador, quem chama
 * sem `navegar` usa esta função — comportamento normal de redirect.
 */
const navegarPadrao = (url) => window.location.assign(url);

/** Usuário da sessão atual (null se não logado ou se o dado está corrompido). */
export function usuarioAtual() {
  try {
    const bruto = sessionStorage.getItem(CHAVE_SESSAO);
    if (!bruto) return null;

    const dados = JSON.parse(bruto);
    // Um objeto sem e-mail não é uma sessão válida (defesa contra lixo manual
    // no DevTools): trata como não logado.
    if (!dados || typeof dados !== "object" || !dados.email) return null;
    return dados;
  } catch {
    return null;
  }
}

/**
 * Papel do usuário — SEMPRE com fallback "estudante".
 *
 * Sessões antigas (gravadas antes da migração 002) não têm role: tratá-las
 * como estudante mantém o comportamento de antes — e o papel de VERDADE é
 * revalidado pelo backend a cada request (o front é só conveniência).
 */
export function papelDoUsuario(usuario) {
  return (usuario && usuario.role) || "estudante";
}

/** A conta foi criada pelo admin e ainda NÃO trocou a senha temporária? */
export function primeiroAcessoPendente(usuario) {
  return Boolean(usuario && usuario.primeiro_acesso);
}

/** Destino padrão do papel (estudante → home, professor → meus vídeos...). */
export function destinoPorPapel(usuario) {
  const destino = DESTINOS_POR_PAPEL[papelDoUsuario(usuario)] || "home.html";
  return `./${destino}`;
}

/** Registra a sessão após o login (única porta de escrita da chave). */
export function entrar(usuario) {
  sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(usuario));
}

/** Encerra a sessão e volta para a tela de login. */
export function sair({ navegar = navegarPadrao } = {}) {
  sessionStorage.removeItem(CHAVE_SESSAO);

  // Logout REAL: revoga o token no servidor (cookie HttpOnly). Fire-and-
  // forget com falha silenciosa — se a API estiver fora, a cópia local
  // morreu do mesmo jeito e o usuário já está na tela de login.
  try {
    if (typeof fetch === "function") {
      void encerrarSessao().catch(() => {});
    }
  } catch {
    /* fetch indisponível (ex.: jsdom antigo) — o logout local segue */
  }

  navegar(PAGINA_LOGIN);
}

/**
 * Retoma a sessão na TELA DE LOGIN (chamado por js/login.js ao carregar).
 *
 * Duas situações — "Lembrar de mim" (cookie com Max-Age) e reinício do
 * navegador deixam um cookie HttpOnly válido no cliente, mas INVISÍVEL para
 * o JS; o sessionStorage pode estar vazio mesmo com sessão viva:
 *
 *  1. já há dados locais (sessão da aba): vai direto para o destino;
 *  2. sem dados locais: pergunta ao servidor (GET /sessao) — cookie válido
 *     repõe a sessão e segue para o ?proximo; 401/falha de rede fica na
 *     tela de login normal.
 *
 * O guard das páginas protegidas (exigirLogin) NÃO mudou: continua síncrono
 * contra o sessionStorage (sem flicker de rede a cada página). A revalidação
 * de verdade acontece aqui, na porta de entrada do login.
 */
export async function retomarSessao({ navegar = navegarPadrao } = {}) {
  if (usuarioAtual()) {
    irParaDestino({ navegar });
    return true;
  }

  try {
    const resposta = await buscarSessao();
    entrar(resposta.usuario);
    irParaDestino({ navegar });
    return true;
  } catch {
    return false; // 401 = sem sessão; falha de rede = tela normal
  }
}

/**
 * Valida um valor de ?proximo contra a allowlist. Aceita caminhos relativos
 * ou absolutos MESMA ORIGEM terminando em home.html/index.html; qualquer
 * outra coisa (outro site, javascript:, lixo) cai no destino padrão.
 * Devolve sempre "arquivo.html?query" — pronto para location.assign.
 */
export function destinoSeguro(valor, padrao = DESTINO_PADRAO) {
  if (!valor) return padrao;

  try {
    const url = new URL(valor, window.location.href);
    const nome = url.pathname.split("/").pop();

    if (url.origin !== window.location.origin) return padrao;
    if (!DESTINOS_PERMITIDOS.has(nome)) return padrao;
    return `${nome}${url.search}`;
  } catch {
    return padrao;
  }
}

/** Nome do arquivo da página atual ("", "home.html", "index.html"...). */
function nomeDaPagina() {
  return window.location.pathname.split("/").pop() || "";
}

/**
 * O guard de entrada: devolve o usuário da sessão ou, sem sessão, manda para
 * o login levando a página atual como ?proximo (e devolve null).
 *
 * A query string via junto — assistir index.html?video=v1 sem login cai no
 * login e, depois de autenticar, volta para o MESMO vídeo.
 */
export function exigirLogin({ navegar = navegarPadrao } = {}) {
  const usuario = usuarioAtual();
  if (usuario) return usuario;

  const pagina = nomeDaPagina() || "home.html";
  const proximo = encodeURIComponent(`${pagina}${window.location.search}`);
  navegar(`${PAGINA_LOGIN}?proximo=${proximo}`);
  return null;
}

/** Depois do login: 1º acesso → trocar senha; ?proximo → destino validado;
 *  sem ?proximo → o destino do papel (estudante home, professor meus vídeos,
 *  admin painel). */
export function irParaDestino({ navegar = navegarPadrao } = {}) {
  const usuario = usuarioAtual();

  // 1º acesso manda SEMPRE: nem ?proximo vence — a troca de senha é a
  // única rota que o backend libera para essa conta.
  if (primeiroAcessoPendente(usuario)) {
    navegar(PAGINA_TROCAR_SENHA);
    return;
  }

  const pedido = new URLSearchParams(window.location.search).get("proximo");
  if (pedido) {
    navegar(destinoSeguro(pedido));
    return;
  }
  navegar(destinoPorPapel(usuario));
}

/** A página atual é protegida pelo guard? (login.html nunca é.) */
export function paginaProtegida() {
  return DESTINOS_PERMITIDOS.has(nomeDaPagina());
}

/**
 * Guard de página POR PAPEL (migração 002) — usado por meus-videos.js
 * (professor/admin) e painel-admin.js (só admin).
 *
 * Sem sessão → login (?proximo). Com sessão mas papel errado → devolve ao
 * DESTINO DO PRÓPRIO PAPEL (redirecionamento mútuo: estudante esbarrando no
 * painel do admin não fica em tela de erro — vai para onde pode usar).
 * Conta de 1º acesso → trocar-senha.html (antes de qualquer papel).
 */
export function exigirPapel(papeis, { navegar = navegarPadrao } = {}) {
  const usuario = exigirLogin({ navegar });
  if (!usuario) return null;

  if (primeiroAcessoPendente(usuario)) {
    navegar(PAGINA_TROCAR_SENHA);
    return null;
  }
  if (!papeis.includes(papelDoUsuario(usuario))) {
    navegar(destinoPorPapel(usuario));
    return null;
  }
  return usuario;
}

/**
 * Liga o guard e a decoração da página (o que o import executa nas páginas
 * reais). Separado em função para o teste ser determinístico: com o destino
 * injetável, dá para afirmar "na tela de login NÃO navega" sem dublar a
 * location selada do jsdom.
 *
 *  * página protegida + sessão → decora perfil/Sair/USER_ID e devolve o
 *    usuário;
 *  * página protegida sem sessão → navega para o login (?proximo) e devolve
 *    null;
 *  * conta de 1º acesso fora da tela de troca de senha → navega para
 *    trocar-senha.html e devolve null;
 *  * login.html → NÃO faz nada (guard aqui seria loop infinito de redirect).
 */
export function inicializar({ navegar = navegarPadrao } = {}) {
  if (!paginaProtegida()) return null;

  const usuario = exigirLogin({ navegar });
  if (!usuario) return null;

  if (
    primeiroAcessoPendente(usuario) &&
    nomeDaPagina() !== "trocar-senha.html"
  ) {
    // A conta recém-criada pelo admin não usa a plataforma antes de trocar
    // a senha temporária — o backend já bloqueia as rotas; aqui é o desvio.
    navegar(PAGINA_TROCAR_SENHA);
    return null;
  }

  // Perfil: mostra de quem é a sessão (tooltip + leitores de tela).
  const botaoPerfil = document.querySelector("#profileButton");
  if (botaoPerfil) {
    const nome = usuario.nome || usuario.email;
    botaoPerfil.title = nome;
    botaoPerfil.setAttribute("aria-label", `Perfil — ${nome}`);
  }

  // Sair: encerra a sessão (o clique leva ao login). O wrapper evita que o
  // objeto do evento vaze como argumento para a função de sessão.
  const botaoSair = document.querySelector("#sairButton");
  if (botaoSair) {
    botaoSair.addEventListener("click", () => sair());
  }

  // Recomendações: o usuário autenticado substitui o "demo-user" do config.js
  // (POST /watch e /recomendacoes passam a ser por usuário real).
  if (window.PLAYER_CONFIG && usuario.usuario_id) {
    window.PLAYER_CONFIG.USER_ID = String(usuario.usuario_id);
  }

  return usuario;
}

/* ---------------------------------------------------------------------------
 * Auto-inicialização — roda quando a página carrega o módulo diretamente
 * (home.html / index.html / meus-videos.html / painel-admin.html /
 * trocar-senha.html).
 *
 * A tela de login (login.html) NÃO é protegida — ela importa este módulo via
 * login.js (entrar/irParaDestino) e o guard dela seria um loop infinito de
 * redirect (sem sessão → login → sem sessão → ...). Por isso o guard só age
 * nas páginas da allowlist, que são exatamente as protegidas.
 * ------------------------------------------------------------------------- */
inicializar();
