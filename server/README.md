# 🧾 Servidor Online — Núcleo Clicker (Vercel)

Backend do jogo: **Mercado Pago (Pix)** + **conteúdo online** + **save na nuvem** + **ranking global**.
**O access token do Mercado Pago vive SOMENTE aqui** — nunca no app do jogador.

## Como funciona

```
App (jogador)          Servidor (Vercel)         Mercado Pago / Upstash
     │ POST /api/pix/charge   │ POST /v1/payments    │
     │ (packId, playerId) ───►│ (access token aqui) ─►│
     │◄─ qr_code + base64 ────│◄─ id + qr_code ──────│
     │ (jogador paga no banco)│                       │
     │                        │ POST webhook ◄───────│ (assinatura HMAC)
     │ GET /api/pix/status ──►│ GET /v1/payments/:id │
     │◄─ approved ────────────│◄─ approved ──────────│
     │ concede fichas 🎰      │                       │
     │                        │                       │
     │ GET /api/content ─────►│ content.json ────────►│ (conteúdo do jogo)
     │ PUT /api/save/:id ────►│ KV: save:<id> ───────►│ (Upstash Redis)
     │ POST /api/rank ───────►│ KV: rank:<kind> ─────►│ (Upstash Redis)
```

## Deploy no Vercel (resumo)

1. Importe o repositório em [vercel.com/new](https://vercel.com/new).
2. **Root Directory** = `server` · Framework = **Other**.
3. Variáveis de ambiente (Settings → Environment Variables):

| Variável | Descrição |
|---|---|
| `MERCADO_PAGO_ACCESS_TOKEN` | Token de produção MP (`APP_USR-...`) — obrigatório p/ pagamentos |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Painel MP → Suas integrações → Webhooks |
| `APP_SHARED_SECRET` | Deve bater com `GameConfig.wallet.appSharedSecret` do jogo |
| `RECEIPT_PRIVATE_KEY` | Seed Ed25519 (64 hex) dos recibos do Passe — gere com `npm run gen:receipt-keys`; a pública vai no app (`GameConfig.pass.receiptPublicKey`) |
| `GMAIL_USER` | Conta Gmail REMETENTE dos e-mails do sistema de contas (confirmação, agradecimento e recuperação) |
| `GMAIL_APP_PASSWORD` | Senha de app do Gmail (conta Google → Segurança → 2 etapas → Senhas de app). Sem estas duas variáveis, os e-mails vão para o console em modo dev (`devCode` na resposta) |
| `BASE_URL` | URL pública (ex.: `https://nucleo-clicker-server.vercel.app`) |
| `UPSTASH_REDIS_REST_URL` | console.upstash.com → Database → REST API (opcional: nuvem/ranking) |
| `UPSTASH_REDIS_REST_TOKEN` | idem |

> Sem Upstash, saves/ranking usam um Map em memória (somem ao reiniciar o processo — ok p/ dev).

> ⚠️ **Chaves do Passe Premium:** a seed que aparece nos testes (`202a7eff…`) e a pública
> embutida no `GameConfig` são de **DESENVOLVIMENTO e são públicas no repositório**. Antes de
> publicar, gere o SEU par com `npm run gen:receipt-keys`, coloque a seed em `RECEIPT_PRIVATE_KEY`
> no servidor e a pública em `GameConfig.pass.receiptPublicKey` num **novo build do app**. O
> servidor avisa no boot se a seed de dev estiver configurada.

4. Teste: `curl https://seu-projeto.vercel.app/api/health` → `{ "ok": true, "mp": "configured", "kv": "configured" }`.

## Rodando localmente

```bash
cd server
npm install
cp .env.example .env   # preencha (ou deixe vazio p/ modo memória)
npm start              # ou: npm run dev
```

Teste rápido:
```bash
curl http://localhost:8787/api/health
curl -X POST http://localhost:8787/api/pix/charge \
  -H 'Content-Type: application/json' \
  -H 'x-app-secret: nucleoclicker-pix-v1' \
  -d '{"packId":"fichas_100","playerId":42}'
```

## Conteúdo online (`/api/content`)

O servidor serve `server/content.json`, gerado a partir do jogo:

```bash
# na raiz do repositório (não em server/):
npm run content:export
```

Depois commite o `server/content.json` e faça push — o Vercel redeploya e o jogo exibe o conteúdo novo. O JSON contém: `updates`, `news`, `banners`, `events`, `seasons`, `codes` e `maintenance` (janelas de manutenção online).

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | Status do servidor (MP + KV + versão) |
| GET | `/api/content` | Conteúdo do jogo (público, cache 5 min) |
| GET | `/api/meta` | Versão + janelas de manutenção (público) |
| POST | `/api/pix/charge` | Cria cobrança Pix → `{ orderId, pixCode, qrCodeBase64, amountBRL }` |
| GET | `/api/pix/status/:id` | Status do pagamento (`pending` / `approved` / …) |
| POST | `/api/pix/webhook` | Notificação do Mercado Pago (assinatura HMAC) |
| GET | `/api/packs` | Lista pacotes custom do Admin (exige `x-app-secret`) |
| POST | `/api/packs` | Cria/atualiza pacote custom — preço validado AQUI (exige `x-app-secret`) |
| DELETE | `/api/packs/:id` | Remove pacote custom (exige `x-app-secret`) |
| PUT | `/api/save/:playerId` | Envia o save para a nuvem (exige `x-app-secret`) |
| GET | `/api/save/:playerId` | Baixa o save da nuvem (exige `x-app-secret`) |
| POST | `/api/rank` | Publica um ciclo no ranking (exige `x-app-secret`) |
| GET | `/api/rank?kind=prestige` | Top 100 do ranking (público) |
| POST | `/api/account/register` | Cria conta (usuário + e-mail Gmail + senha) → envia código de confirmação |
| POST | `/api/account/verify` | Valida o código de confirmação → marca verificada → envia e-mail de agradecimento |
| POST | `/api/account/resend` | Reenvia o código de confirmação |
| POST | `/api/account/login` | Login → `{ token, username, email, verified, hasSave }` (sessão de 30 dias) |
| POST | `/api/account/logout` | Encerra a sessão |
| POST | `/api/account/change-password` | Troca a senha estando logado (exige `x-account-token` + senha atual; derruba as outras sessões) |
| POST | `/api/account/recover` | Envia código de recuperação de senha (15 min) |
| POST | `/api/account/reset` | Redefine a senha com o código de recuperação |
| GET | `/api/account/me` | Dados da sessão atual (exige header `x-account-token`) |
| GET | `/api/account/save` | Baixa o save da conta (exige `x-account-token`) |
| PUT | `/api/account/save` | Guarda o save da conta — o app envia automaticamente a cada 1 h (exige `x-account-token`) |
| POST | `/api/account/link-slot` | Re-vincula o save da conta a outro slot (`slot1|slot2|slot3`) sem reenviar (exige `x-account-token`) |

> **Pacotes de diamantes/moedas** (Admin → Vendas): o jogo publica pacotes em `/api/packs`
> e cobra por `packId` em `/api/pix/charge` — o preço em R$ é sempre revalidado aqui
> (entre R$ 0,01 e R$ 1.000) e o cliente nunca envia valor. O pacote embutido
> `pix_test_1d` (R$ 0,01 → 1💎) permite o teste de ponta a ponta do Admin.

## Sistema de contas

O jogo tem conta por **nome de usuário + e-mail Gmail + senha**. O servidor:

- Armazena a senha apenas como **scrypt + sal** (Node nativo, comparação timing-safe).
- Envia **3 tipos de e-mail** pela conta Gmail configurada: **código de confirmação** (registro), **agradecimento** (pós-confirmação) e **código de recuperação** (senha esquecida).
- Mantém **sessões por token** (32 bytes hex, TTL 30 dias) — o app envia o token no header `x-account-token`.
- Guarda o **save da conta** em `account:save:<usuário>`; o jogo o envia **automaticamente a cada 1 hora** quando conectado (botões manuais na tela Conta).

> Sem `GMAIL_USER`/`GMAIL_APP_PASSWORD` o servidor roda em **modo dev**: os e-mails vão para o console e as respostas incluem `devCode` para completar o fluxo.

## Segurança

- **Access token** nunca sai do servidor.
- **Webhook** validado por assinatura HMAC-SHA256 (`x-signature` + `x-request-id`).
- **Escrita de dados** exige o header `x-app-secret` (quando `APP_SHARED_SECRET` configurado).
- **Preços** definidos no servidor (`FICHA_PACKS` + pacotes custom em `/api/packs`) — o cliente nunca escolhe o valor.
- **Idempotency key** (UUID) em cada criação de pagamento.
- **Ranking** guarda apenas o recorde; **save nuvem** só é devolvido a quem sabe o `playerId`.
  ⚠️ O `playerId` é o `createdAt` do save (timestamp) e o `x-app-secret` fica embutido no app —
  proteção leve, adequada a um jogo de nicho. Para um sistema com contas reais, troque por
  UUID/credencial e adicione autenticação de verdade.
- **Rate limiting** em memória (30 salvamentos/min · 60 publicações/min por jogador) contra rajadas.
