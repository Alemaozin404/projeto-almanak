# ⚛️ Núcleo Clicker

Jogo clicker/idle para Windows (Electron + React + Vite) com **servidor online**:

- 🌐 **Conteúdo ao vivo** — notícias, eventos, banners, códigos, changelog e janelas de manutenção vêm do servidor (Vercel). Publique conteúdo sem redistribuir o jogo.
- 💳 **Pagamentos Pix reais** — integração com o **Mercado Pago** (cobrança com QR Code, webhook validado por HMAC, fichas entregues após aprovação).
- ☁️ **Save na nuvem + sync entre dispositivos** — **online por padrão**: o save é enviado ao servidor após cada auto-save e ao sair, e a versão mais recente é restaurada ao abrir o jogo (Upstash Redis). **Sync ao vivo**: a mesma conta no PC, no celular (app Android) e no site mantém o progresso em sincronia — o app consulta o servidor a cada ~20 s (e ao voltar do segundo plano) e restaura automaticamente o save mais novo de outro dispositivo, com backup local. Desative em Configurações → Dados → Sincronização automática.
- 🏆 **Ranking global** — seus melhores ciclos de Prestígio/Ascensão/Transcendência são publicados **automaticamente** (sem botão manual); a tela de Ranking também tem publicação manual e **filtro por plataforma** (Todos · 📱 Android · 🖥️ PC · 🌐 Web).
- 🎁 **Presentes entre amigos** — envie créditos 💳 ou caixas 📦 para amigos (cooldown de 6h); o presente cai na inbox deles e é resgatado na tela de Amigos (resgate único no servidor).
- 📱 **Notificações** — o app Android avisa quando seu ganho offline está pronto (notificação local agendada ao sair do jogo) e recebe push (FCM) de presentes/eventos quando o Firebase está configurado. Toggles em Configurações → Notificações.
- 🟢 **Indicador de conexão** — o TopBar mostra online/offline em tempo real (heartbeat a cada 1 min).
- 🔄 **Auto-update** — quando você publica uma tag `v*`, o app se atualiza sozinho via GitHub Releases.

---

## 🏗️ Arquitetura

```
┌──────────────┐   HTTPS   ┌─────────────────────────┐   HTTPS   ┌──────────────────┐
│  App Windows │ ────────► │  Servidor (Vercel)      │ ────────► │  Mercado Pago    │
│  Electron    │           │  api/index.js (raiz)    │  POST     │  /v1/payments    │
│              │ ◄──────── │  Express serverless     │ ◄──────── │  webhook (HMAC)  │
│              │  QR/status│                         │           └──────────────────┘
│              │           │  /api/content (JSON)    │
│              │           │  /api/save/:id          │ ────┐   ┌──────────────────┐
│              │           │  /api/rank              │ ────┼──►│  Upstash Redis   │
│              │           │  /api/pix/*             │     └──►│  (KV serverless) │
└──────────────┘           └─────────────────────────┘           └──────────────────┘
```

- **O access token do Mercado Pago vive SÓ no servidor** — nunca no app (Electron é descompilável).
- O app fala apenas com o nosso servidor; sem servidor configurado, o jogo roda 100% offline (conteúdo local + pagamentos simulados), mas com o backend configurado (padrão de produção) tudo sincroniza automaticamente.

## 📁 Estrutura relevante

| Caminho | Papel |
|---|---|
| `src/content/*` | Conteúdo data-driven (fonte da verdade no cliente) |
| `src/liveops/RemoteContent.ts` | Sincroniza conteúdo com o servidor (cache offline) |
| `src/online/api.ts` / `cloudSave.ts` | Cliente da API online (ranking + save nuvem) |
| `src/wallet/mp.ts` | Gateway Pix online (backend Mercado Pago) |
| `server/` | Backend Express (pagos + conteúdo + save + ranking) |
| `api/index.js` | Entrypoint serverless do Vercel — re-exporta o Express na raiz (deploy unificado) |
| `scripts/export-content.mjs` | Gera `server/content.json` a partir de `src/content/*` |

---

## 🚀 Deploy em 5 passos

### 1. Repositório no GitHub

```bash
git init
git add .
git commit -m "feat: núcleo clicker online (vercel + mercadopago + nuvem)"
git branch -M main
git remote add origin https://github.com/Alemaozin404/projeto-almanak.git
git push -u origin main
```



### 2. Deploy unificado no Vercel (jogo + backend no MESMO domínio)

1. Acesse [vercel.com/new](https://vercel.com/new) e **Importe o repositório** do GitHub.
2. **Root Directory**: raiz do repositório (padrão). Framework: **Vite**.
3. O `vercel.json` da raiz faz tudo:
   - `vite build` → pasta `dist` (o jogo no navegador);
   - `api/index.js` → função serverless que re-exporta o Express de `server/index.js` (todos os `/api/*`);
   - `rewrites`: `/api/*` → backend · `/*` → `index.html` (SPA);
   - `includeFiles`: embute `server/content.json` no pacote da função.
4. Vercel instala as dependências da raiz (inclui express, cors, dotenv — já em `package.json`).
5. A URL gerada (ex.: `https://projeto-almanak-alemaozin404s-projects.vercel.app`) serve **jogo e backend juntos** — nada de subpasta `server`.

### 3. Variáveis de ambiente no Vercel (Project → Settings → Environment Variables)

| Variável | Valor | Obrigatória? |
|---|---|---|
| `MERCADO_PAGO_ACCESS_TOKEN` | `APP_USR-...` (seu token de produção MP) | ✅ (pagamentos) |
| `MERCADO_PAGO_WEBHOOK_SECRET` | painel MP → Suas integrações → Webhooks | ✅ (webhook) |
| `APP_SHARED_SECRET` | `nucleoclicker-pix-v1` (bate com o jogo) | recomendado |
| `BASE_URL` | `https://seu-projeto.vercel.app` | ✅ |
| `UPSTASH_REDIS_REST_URL` | do Upstash (abaixo) | ✅ (nuvem/ranking) |
| `UPSTASH_REDIS_REST_TOKEN` | do Upstash (abaixo) | ✅ (nuvem/ranking) |

### 4. Upstash Redis (save na nuvem + ranking)

1. Crie uma conta grátis em [console.upstash.com](https://console.upstash.com) → **Create Database** (região próxima do Vercel, ex.: `sa-east-1`).
2. Abra o database → **REST API** → copie **URL** e **Token**.
3. Cole nas variáveis `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` do Vercel (Passo 3).
4. O servidor usa `POST /pipeline` (corpo JSON) — ideal para saves grandes (~100 KB).

### 5. Aponte o jogo para o servidor

O jogo já vem com o backend de produção configurado por padrão em `src/config/GameConfig.ts`:

```ts
wallet: {
  backendUrl: 'https://projeto-almanak-alemaozin404s-projects.vercel.app',
}
```

> Instalações novas usam essa URL automaticamente (pagamentos reais).
> Sem recompilar: `F12` no jogo → `localStorage.setItem('nc_pix_backend_url', 'https://seu-projeto.vercel.app')`.
> Para voltar ao modo simulado (nada é cobrado), deixe o campo vazio em **Configurações → Pagamentos** (modo desenvolvedor) e salve — o campo também permite testar a conexão com **Testar conexão**.

Pronto! A Carteira cobra de verdade, o conteúdo sincroniza e o save pode ir para a nuvem.

---

## 📦 Publicando conteúdo novo (sem reinstalar o app)

1. Edite o que quiser em `src/content/*` (notícias, eventos, banners, códigos, changelog) ou as janelas de manutenção em `src/content/maintenance.ts`.
2. `npm run content:export` → regenera `server/content.json`.
3. `git commit -am "conteúdo: novo evento" && git push` → o Vercel redeploya e o jogo baixa o conteúdo (a cada 30 min e no boot).

**Manutenção online**: adicione uma janela em `maintenance.ts`, exporte e commite — o jogo exibe a tela de manutenção para todos. Para reabrir, remova a janela e repita.

## 🔄 Publicando uma versão nova do app (auto-update + APK Android)

```bash
npm version patch   # ou minor / major — cria a tag vX.Y.Z
git push && git push --tags
```

O workflow `.github/workflows/release.yml` faz tudo em um único Release:

1. **Windows** (job `release`): builda o instalador `nsis` e publica no **GitHub Releases** (auto-update do Electron).
2. **Android** (job `android`): builda o **APK** com o mesmo código web (Capacitor) e **anexa ao mesmo Release** — celulares baixam o `.apk` direto em *Releases* → *Assets*.

> Requisitos: repositório **público** (ou GH_TOKEN no app) e `build.publish.owner/repo` corretos.

---

## 📱 App Android (APK no GitHub)

O jogo roda no celular com o **mesmo código web** — o app Android é um WebView do Capacitor servindo o build Vite (`dist/`). Nada muda no gameplay e **continua 100% online**: save na nuvem, ranking global, conteúdo ao vivo e Pix usam o mesmo backend do Vercel.

### Baixar (usuários)

1. Vá em **Releases** do repositório → aba **Assets** da versão mais recente.
2. Baixe `app-debug.apk` (ou `app-release.apk` se houver assinatura configurada).
3. No celular, toque no arquivo e permita instalar de fontes desconhecidas (é sideload — não é Play Store).

> Sem APK? O site no celular (`https://projeto-almanak-alemaozin404s-projects.vercel.app`) já é jogável, **instalável como PWA** (menu do navegador → *Adicionar à tela inicial* — manifest + service worker com cache do app shell) e sincroniza o mesmo save da conta.

**Deep link de perfil**: a tela Perfil tem *🔗 Compartilhar perfil* — o link `/?profile=<usuario>` abre o perfil público do jogador no jogo (sem exigir amizade/sessão; o snapshot é enviado junto do save).

### Build local (precisa de Android SDK/Studio)

```bash
npm install
npm run content:export
npm run android:sync     # vite build + cap sync android
cd android && ./gradlew assembleDebug    # Windows: gradlew.bat assembleDebug
# APK em android/app/build/outputs/apk/debug/app-debug.apk
```

Instale no celular conectado via USB (depuração ativada): `cd android && ./gradlew installDebug`.

### Assinatura do APK (opcional, recomendada)

Sem assinatura o workflow gera um `app-debug.apk` — instala, mas o Android reclama do fabricante. Para um `app-release.apk` assinado, crie um keystore uma vez e configure 4 secrets no GitHub (Settings → Secrets and variables → Actions):

```bash
# gera o keystore (guarde as senhas!)
keytool -genkeypair -v -keystore release.jks -alias nucleo -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.jks   # saída = valor do secret ANDROID_KEYSTORE_BASE64
```

| Secret | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | conteúdo do `release.jks` em base64 |
| `ANDROID_KEYSTORE_PASSWORD` | senha do keystore (keytool pede 2x) |
| `ANDROID_KEY_ALIAS` | alias usado no keytool (`nucleo`) |
| `ANDROID_KEY_PASSWORD` | senha da chave (pode ser igual à do keystore) |

> ⚠️ O keystore é a identidade do app: **nunca** commite o arquivo (`.gitignore` já bloqueia `*.jks`). Se perder, não dá para atualizar uma instalação antiga.

### Shell de app real (Android)

- **Splash screen** com a marca do jogo (orbe + fundo escuro, `npm run android:splash`) + splash Android 12+ animada com o orbe.
- **Status bar** escura com ícones claros; **orientação travada em portrait**; teclado não cobre o jogo (`adjustResize`).
- **Haptics**: vibração leve em toques em botões e impacto médio no clique do Núcleo.
- **Botão voltar** do Android: fecha modal aberto → volta ao Núcleo (Início) → sai do app.
- **Sem bounce/pull-to-refresh** no WebView (`overscroll-behavior: none`) e sem delay de toque (`touch-action: manipulation`).
- **WebView enxuto**: sem scrollbars, sem seleção de texto, fundo do tema — comportamento de app, não de navegador.
- **Ações nativas de verdade**: compartilhar perfil/save com o share sheet do Android, links externos abrem no browser do sistema (custom tab), exportar/importar save por arquivo.
- **UI mobile-first**: header próprio (nível + título da tela + strip de recursos), barra de navegação inferior, modais como *bottom sheets*, alvos de toque grandes e safe-areas para notch.

### Push FCM (notificações de presentes/eventos)

O código do push já está pronto (plugin `@capacitor/push-notifications` + endpoint `/api/push/token` + envio no servidor). Para ativar de verdade faltam **2 arquivos de configuração do Firebase** (não estão no repo por serem segredos):

1. **`google-services.json`** do seu projeto Firebase → coloque em `android/app/google-services.json`. O `build.gradle` já detecta o arquivo e aplica o plugin automaticamente (sem ele, push não compila e o app funciona normalmente).
2. **`FCM_SERVICE_ACCOUNT`** (env var no Vercel) → JSON da service account do Firebase (Console → Project settings → Service accounts → Generate new private key) copiado inteiro como valor. Sem ele o servidor roda em modo dev (só loga).

```bash
# depois de adicionar o google-services.json, regenere o projeto e recompile:
npx cap sync android
# npm run android:build  (ou build pelo Android Studio)
```

## 🧪 Desenvolvimento

```bash
npm install && npm run server:dev   # terminal 1: backend local
npm run dev                         # terminal 2: jogo (Vite + Electron)
npm test                            # testes (inclui integração Pix + API online)
npm run typecheck
```

O backend local usa um Map em memória para nuvem/ranking (sem Upstash). Configure `server/.env` a partir de `server/.env.example` para testar Mercado Pago de verdade.

## 🔒 Segurança

- Access token do Mercado Pago **nunca** vai ao cliente.
- Webhook validado por assinatura HMAC-SHA256 (`x-signature` + `x-request-id`).
- Rotas que escrevem dados exigem `x-app-secret` (`APP_SHARED_SECRET`).
- Preços de fichas definidos **no servidor** — o cliente nunca escolhe o valor.
- Save baixado da nuvem passa pela mesma validação/checksum de um save local.
- Ranking global publica apenas o recorde (nunca o save inteiro).
