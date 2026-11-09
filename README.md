# Projeto A3 — Frontend (EduStream: player adaptativo + login)

Frontend do **EduStream**, plataforma de streaming de vídeo educacional com player HLS adaptativo, catálogo com busca, upload e tela de login/cadastro. Desenvolvido para a disciplina de Garantia e Gestão da Qualidade de Software (ODS 4 — Educação de Qualidade).

> 🛠️ **A API (FastAPI + Supabase) mora em outro repositório**: [`projeto-a3-backend`](https://github.com/Pietro2820/projeto-a3-backend). A visão geral do trabalho (com os links dos dois repos) está em [`projeto-a3-Garantia-da-Qualidade-de-Software-2026.2`](https://github.com/Pietro2820/projeto-a3-Garantia-da-Qualidade-de-Software-2026.2).

## Stack

| Camada | Tecnologia |
| --- | --- |
| Player de vídeo | HLS.js + HTML5 Video (qualidade adaptativa) |
| Telas | HTML/CSS/JS puro (sem framework) |
| Login/Cadastro | `POST /login` e `POST /cadastro` da API (sessionStorage) |
| Testes | Jest + jsdom (240+ testes) |
| CI/CD | GitHub Actions |

## Páginas

| Arquivo | O que é |
| --- | --- |
| `home.html` | Catálogo: grade de vídeos, busca e upload |
| `index.html` | Watch page: player com controles, qualidade e recomendações |
| `login.html` | Entrar / Criar conta (formulários alternáveis no mesmo card) |

## Como rodar

### 1. Clonar e subir a API (o front precisa dela)

```bash
git clone https://github.com/Pietro2820/projeto-a3-backend
cd projeto-a3-backend
cp .env.example .env   # preencha SUPABASE_URL/SUPABASE_KEY
uvicorn app.main:app --reload
```

### 2. Servir o frontend (qualquer uma das opções)

**Opção a — VS Code Live Server** (a mais usada em dev): abra o projeto no VS Code, botão direito em `login.html` → *Open with Live Server* (fica em `http://127.0.0.1:5500`).

**Opção b — http.server do Python:**
```bash
python -m http.server 5500
# abra http://localhost:5500/login.html
```

**Opção c — servido pelo próprio backend (sem CORS):** no `.env` do backend, aponte `PLAYER_DIR` para este projeto (`PLAYER_DIR=../projeto-a3-frontend`), reinicie a API e abra http://localhost:8000/player/.

### 3. Origem da API

O `config.js` descobre a API sozinho: servido pelo backend (`/player/`), usa a mesma origem; servido por outro servidor (Live Server, :5500), cai no padrão `http://localhost:8000`. Para apontar para outro lugar, defina antes:

```js
window.PLAYER_CONFIG = { API_BASE_URL: "http://localhost:9000" };
```

(como `config.local.js` — não versionado — antes do `config.js` no HTML.)

## Login e cadastro

A tela de login chama a API de verdade:

- **Entrar** → `POST /login`; ao autenticar, o nome do usuário fica em `sessionStorage` (chave `edustream.usuario`) e você vai para o catálogo;
- **Criar conta** → `POST /cadastro` + login automático;
- **Erros**: `401` aparece no campo de senha ("E-mail ou senha incorretos"), `409` no campo de e-mail ("já tem uma conta"), `503`/falha de rede viram um aviso no rodapé do card;
- Usuário de teste do SQL do backend: `teste@edustream.com` / `senha12345`.

> Se a API estiver desligada, o login mostra "Não foi possível conectar à API…" em vez de quebrar em silêncio.

## Rodar os testes (Jest)

```bash
npm ci     # instala o Jest (usa o package-lock.json)
npm test   # roda a suíte inteira
npm test -- --coverage   # com cobertura
```

São 240+ testes jsdom cobrindo controles do player, seleção de qualidade, catálogo, recomendações, upload e os fluxos do login. Há um teste E2E (`tests/e2e.player-api.test.js`) que só roda com a API no ar: para executá-lo de verdade, suba o backend na :8000, rode `python scripts/seed_e2e.py` (no repo do backend) e depois `E2E_API_URL=http://localhost:8000 npm test -- tests/e2e.player-api.test.js`.

O CI roda `npm ci` + `npm test -- --coverage` em cada push.

## Estrutura de pastas

```
projeto-a3-frontend/
├── home.html             # Catálogo (grade + busca + upload)
├── index.html            # Player (watch page, ?video={uuid})
├── login.html            # Entrar / Criar conta
├── config.js             # Origem da API (mesma origem ou localhost:8000)
├── css/
│   ├── player.css        # Design system do EduStream
│   └── login.css         # Card, campos com ícone, estados de validação
├── js/
│   ├── api.js            # fetch + ApiError (todos os endpoints)
│   ├── login.js          # validação + POST /login + /cadastro + sessionStorage
│   ├── catalog.js        # grade do catálogo
│   ├── player.js         # HLS.js, qualidade adaptativa, resiliência
│   └── ...
├── vendor/hls.min.js     # HLS.js versionado (sem CDN)
├── assets/               # thumbnails de demonstração
├── tests/                # Jest (jsdom) + E2E opcional
├── jest.config.js
├── package.json
└── .github/workflows/ci.yml
```
