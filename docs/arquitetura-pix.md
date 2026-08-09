# 🗺️ Mapa do Sistema Pix — Núcleo Clicker

## 1. Visão geral (3 partes)

```
┌─────────────────────────────┐     ┌──────────────────────────────┐     ┌────────────────────────┐
│  APP (jogo do jogador)      │     │  BACKEND (server/)           │     │  MERCADO PAGO          │
│  Electron + React + TS      │ ──► │  Node + Express              │ ──► │  API oficial           │
│  ─────────────────────────  │ HTTP │  ──────────────────────────  │ HTTP │  ─────────────────────  │
│  • Carteira (UI)            │     │  • Access Token 🔑 (AQUI!)   │     │  • Cria cobrança Pix   │
│  • OnlinePixGateway         │ ◄── │  • Preços (FICHA_PACKS)      │ ◄── │  • Confirma pagamento  │
│  • Polling 5s               │     │  • Valida HMAC do webhook    │     │  • Notifica (webhook)  │
│  • Concede fichas 🎰        │     │  • Nunca envia token ao app  │     │  • QR code + copia-cola│
└─────────────────────────────┘     └──────────────────────────────┘     └────────────────────────┘
        jogador é o "cliente"               você é o "dono"                    terceiro que processa
```

**Regra de ouro:** o `MERCADO_PAGO_ACCESS_TOKEN` existe **só no backend**.
O app do jogador nunca o vê — se um hacker abrir o jogo, não encontra segredo nenhum.

---

## 2. Fluxo de compra (passo a passo)

```
 JOGADOR                APP (jogo)                    BACKEND (server/)                MERCADO PAGO
───────                ──────────                    ─────────────────                ────────────
   1. Clica em
      "Comprar 100
      fichas · R$ 6,25"

                            │ 2. POST /api/pix/charge
                            │    { packId, playerId }
                            │ ───────────────────────►
                            │                             3. POST /v1/payments
                            │                                { transaction_amount: 6.25,
                            │                                  payment_method_id: 'pix',
                            │                                  notification_url: ...webhook }
                            │                              ────────────────────────────►
                            │                              ◄── 4. { id, qr_code, qr_code_base64 }
                            │ ◄── 5. { orderId, pixCode, qrCodeBase64 }
                            │
   6. Vê o QR REAL na tela ─┤
      paga no app do banco ─┼───────────────────────────────────────────────────────► (dinheiro vai
      (copia-e-cola)        │                                                          para a SUA conta MP)
                            │
                            │ 7. Polling: GET /api/pix/status/:id  (a cada 5s)
                            │ ────────────────────────────────────►
                            │     8. GET /v1/payments/:id  ◄───────
                            │     ◄── 9. { status: 'approved' }
                            │ ◄── 10. { status: 'approved' }
                            │
  11. Fichas 🎰 concedidas ──┤ (só agora! +100 fichas)
```

### Resumo do passo 10→11 (regra de segurança)
O app **nunca entrega fichas na hora da compra** — só entrega quando o backend
confirma que o Mercado Pago **realmente aprovou** o pagamento.

---

## 3. Confirmação em segundo plano (webhook)

O webhook é uma **proteção extra** (não é o que entrega as fichas):

```
 MERCADO PAGO ── POST /api/pix/webhook ──► BACKEND
      (pagamento aprovado)                   │ 1. Valida assinatura HMAC (x-signature)
                                            │    → se falsa: 401 (ignora)
                                            │ 2. Consulta GET /v1/payments/:id
                                            │ 3. Loga o status
                                            └─► (o app descobre a aprovação pelo polling)
```

Mesmo que o webhook falhe (servidor fora do ar, URL errada), **nada se perde**:
o app continua consultando o status pelo polling e entrega as fichas assim que aprovar.

---

## 4. Fluxo completo da moeda (dentro do jogo)

```
 REAL (R$)                    FICHAS 🎰                   CRÉDITOS 💳                 DIAMANTES 💎
─────────                    ──────────                  ───────────                ────────────
Jogador paga            App concede após              Conversão 1:1             Conversão 1:1
R$ 6,25 via Pix  ───►   aprovação do Pix      ───►    (1 ficha = 1              (1 crédito = 1
(Você recebe 6,25       (+100 fichas)                   crédito)                  diamante)
 na sua conta MP)                                          │                          │
                                                            └──► gastos na LOJA ◄─────┘
                                                                  caixas, consumíveis,
                                                                  upgrades premium
```

| Etapa | Onde | Quanto |
|---|---|---|
| Compra fichas | Carteira → Comprar | R$ 6,25 = 100 🎰 (margem de 20% para você) |
| Fichas → Créditos | Carteira → Converter | 1 ficha = 1 crédito |
| Créditos → Diamantes | Carteira → Diamantes | 1 crédito = 1 💎 |
| Gasta diamantes | Loja (sistema que já existe) | caixas, itens premium |

**O dinheiro só entra. Nunca sai** (não há saque — como você definiu).

---

## 5. Modo simulado vs. modo real

| | Modo simulado (padrão) | Modo real (online) |
|---|---|---|
| Quando | `backendUrl` vazio no GameConfig | `backendUrl` configurado |
| Cobrança | Nenhuma (nada é pago) | Mercado Pago cobra de verdade |
| QR Code | Falso (gerado local, EMV+CRC16) | QR real do Mercado Pago |
| Fichas | Concedidas na hora | Só após aprovação (polling) |
| Para testar | Nada a configurar | Precisa do backend no ar |

**Como ligar o modo real:** `GameConfig.wallet.backendUrl = 'https://api.seudominio.com'`
(ou guardar a URL no localStorage com a chave `nc_pix_backend_url`).

---

## 6. Arquivos no projeto

```
server/                     ← BACKEND (publicar no Railway/Render/VPS)
  index.js                  ← servidor Express + API Mercado Pago
  package.json              ← dependências do servidor (separado do app)
  .env.example              ← modelo de configuração (token, secrets)
  README.md                 ← passo a passo de deploy

src/wallet/                 ← camada de pagamento no app
  pix.ts                    ← interface PixGateway + gateway LOCAL (simulado)
  mp.ts                     ← OnlinePixGateway + resolvePixGateway (escolhe o modo)

src/game/
  engine.ts                 ← buyFichaPack (cria pedido) + checkPixOrder (concede)
  types.ts                  ← save v8: pixOrders (pedidos pendentes)

src/ui/screens/
  Wallet.tsx                ← tela Carteira (Comprar / Converter / Diamantes)

src/config/
  GameConfig.ts             ← wallet.backendUrl, pixPollingMs, expiração
```

---

## 7. Configurações-chave (GameConfig.wallet)

| Config | Valor | O que faz |
|---|---|---|
| `backendUrl` | `''` | URL do backend (vazio = simulação) |
| `appSharedSecret` | `nucleoclicker-pix-v1` | proteção leve app→backend (deve bater com `APP_SHARED_SECRET` do servidor) |
| `pixPollingMs` | `5000` | intervalo de verificação do pagamento |
| `pixOrderExpiryMs` | `30 min` | pedido não pago expira e some do jogo |
| `pricePer100Fichas` | `6.25` | preço base dos pacotes |

---

## 8. Checklist de segurança (já implementado)

- [x] Access token do Mercado Pago só no backend
- [x] Preços definidos no servidor (cliente não escolhe valor)
- [x] Webhook validado por assinatura HMAC
- [x] Idempotency key (sem cobrança duplicada se der retry)
- [x] Fichas só após confirmação real de aprovação
- [x] Pedidos expiram em 30 min (sem órfãos eternos)
- [x] Concessão idempotente (nunca dobra fichas em chamadas concorrentes)
