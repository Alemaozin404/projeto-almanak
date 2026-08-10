/**
 * Teste de INTEGRAÇÃO do ciclo completo do Pix:
 *   cobrança → pagamento → webhook → fichas entregues
 *
 * O que é REAL neste teste:
 * - O servidor Express de verdade (server/index.js), subido em porta efêmera;
 * - O GameEngine real com o OnlinePixGateway apontando para esse servidor;
 * - Requisições HTTP reais entre app ↔ servidor (fetch nativo).
 *
 * O que é SIMULADO:
 * - O Mercado Pago (fetch stub para https://api.mercadopago.com/*) — criamos a
 *   cobrança em memória, "aprovamos" o pagamento e vemos o servidor consultar
 *   o status e validar o webhook HMAC de verdade.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import crypto from 'node:crypto';
import { createApp } from '../server/index.js';
import { GameEngine } from '../src/game/engine';
import { GameConfig } from '../src/config/GameConfig';
import { validateState } from '../src/save/validation';
import { D } from '../src/core/bignum';

const MP_API = 'https://api.mercadopago.com';
const WEBHOOK_SECRET = 'test-webhook-secret';
const ACCESS_TOKEN = 'TEST-1234567890';
const realFetch = globalThis.fetch;

// ── simulador do Mercado Pago (em memória) ─────────────────
interface FakePayment {
  status: 'pending' | 'approved';
  amount: number;
}

function createFakeMp() {
  const payments = new Map<number, FakePayment>();
  let nextId = 1000;
  let failNext = false;
  return {
    /** Simula o jogador pagando no app do banco → MP aprova. */
    approve(id: number) {
      const p = payments.get(id);
      if (p) p.status = 'approved';
    },
    /** Faz a PRÓXIMA chamada ao MP falhar (erro de gateway). */
    failNextCall() {
      failNext = true;
    },
    payment(id: number): FakePayment | undefined {
      return payments.get(id);
    },
    handler: async (url: string, init?: RequestInit): Promise<Response> => {
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

      if (failNext) {
        failNext = false;
        return json({ message: 'erro interno' }, 500);
      }

      // POST /v1/payments — cria a cobrança Pix
      if (url === `${MP_API}/v1/payments` && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { transaction_amount: number };
        const id = nextId++;
        payments.set(id, { status: 'pending', amount: body.transaction_amount });
        return json(
          {
            id,
            status: 'pending',
            point_of_interaction: {
              transaction_data: { qr_code: `000201265...pix-${id}...`, qr_code_base64: 'iVBORw0KGgo=' },
            },
          },
          201,
        );
      }

      // GET /v1/payments/:id — consulta o status
      const m = url.match(/\/v1\/payments\/(\d+)/);
      if (m && !init?.method) {
        const p = payments.get(Number(m[1]));
        if (!p) return json({ message: 'não encontrado' }, 404);
        return json({
          id: Number(m[1]),
          status: p.status,
          status_detail: p.status === 'approved' ? 'accredited' : 'pending_review',
          transaction_amount: p.amount,
          payment_method_id: 'pix',
        });
      }

      return json({ message: 'não encontrado' }, 404);
    },
  };
}

/** Monta o x-signature do webhook (mesmo template do servidor: id/request-id/ts). */
function webhookSignature(dataId: string, requestId: string, ts: number): string {
  const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = crypto.createHmac('sha256', WEBHOOK_SECRET).update(template).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('Integração Pix — cobrança → pagamento → webhook → fichas', () => {
  const fakeMp = createFakeMp();
  let server: Server;
  let baseUrl = '';
  const store: Record<string, string> = {};

  beforeAll(async () => {
    // os testes NUNCA tocam o Upstash real (server/.env é carregado pelo dotenv)
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    // localStorage: aponta o app para o backend local (mesma chave do Settings)
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });

    // fetch: rotas do Mercado Pago → simulador; o resto → rede real (servidor local)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith(MP_API)) return fakeMp.handler(url, init);
        return realFetch(input, init);
      }),
    );

    // sobe o servidor REAL em porta efêmera (bind 127.0.0.1 para o teste)
    const app = createApp({
      MERCADO_PAGO_ACCESS_TOKEN: ACCESS_TOKEN,
      MERCADO_PAGO_WEBHOOK_SECRET: WEBHOOK_SECRET,
      APP_SHARED_SECRET: GameConfig.wallet.appSharedSecret,
      // seed da chave privada de TESTE — casa com GameConfig.pass.receiptPublicKey
      RECEIPT_PRIVATE_KEY: 'e0d471744613806eb1f58fcc3492ea4aaf1148894ab568834a0c9bb9217c200a',
      PORT: '0',
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('sem porta atribuída');
    baseUrl = `http://127.0.0.1:${addr.port}`;
    store[GameConfig.wallet.backendUrlKey] = baseUrl;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('ciclo completo: cobrança → pagamento → webhook → fichas entregues', async () => {
    const e = new GameEngine();

    // 1. COBRANÇA — o app cria o pedido no servidor real, que cria no "MP"
    const buy = await e.buyFichaPack('fichas_100');
    expect(buy.ok).toBe(true);
    expect(buy.pending).toBe(true); // aguardando pagamento
    expect(buy.orderId).toBeTruthy();
    expect(buy.pixCode).toContain('000201');
    expect(buy.qrCodeBase64).toBeTruthy();
    expect(e.state.fichas).toBe('0'); // nada concedido antes de pagar
    expect(e.pendingPixOrders()).toHaveLength(1);

    const orderId = buy.orderId!;
    const mpId = Number(orderId);

    // o preço é definido pelo SERVIDOR (ficha_100 = R$ 6,25), não pelo cliente
    expect(fakeMp.payment(mpId)?.amount).toBe(GameConfig.wallet.pricePer100Fichas);

    // polling antes do pagamento → continua pendente, nada concedido
    let st = await e.checkPixOrder(orderId);
    expect(st.status).toBe('pending');
    expect(e.state.fichas).toBe('0');

    // 2. PAGAMENTO — jogador paga no app do banco; MP aprova
    fakeMp.approve(mpId);

    // 3. WEBHOOK — o MP notifica o servidor (assinatura HMAC real)
    const requestId = 'req-integration-1';
    const ts = Date.now();
    const wh = await fetch(`${baseUrl}/api/pix/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-signature': webhookSignature(orderId, requestId, ts),
        'x-request-id': requestId,
      },
      body: JSON.stringify({ action: 'payment.updated', data: { id: orderId } }),
    });
    expect(wh.status).toBe(200);

    // 4. FICHAS ENTREGUES — o app faz polling e o servidor confirma no MP
    st = await e.checkPixOrder(orderId);
    expect(st.status).toBe('approved');
    expect(st.fichas).toBe(100);
    expect(e.state.fichas).toBe('100');
    expect(e.state.pixOrders[orderId].status).toBe('done');
    expect(e.pendingPixOrders()).toHaveLength(0);

    // idempotente: um novo check não dobra as fichas
    st = await e.checkPixOrder(orderId);
    expect(st.done).toBe(true);
    expect(e.state.fichas).toBe('100');
  });

  it('pacote de moedas da Loja: cobrança real → aprovação → moedas e diamantes entregues', async () => {
    const e = new GameEngine();

    // 1. COBRANÇA — a Loja compra um pacote de moedas via Pix (mesmo fluxo da Carteira)
    const buy = await e.buyCoinPack('pack_starter');
    expect(buy.ok).toBe(true);
    expect(buy.pending).toBe(true);
    expect(buy.orderId).toBeTruthy();
    expect(e.state.gold).toBe('0'); // nada concedido antes de pagar
    expect(e.state.crystals).toBe('0');
    expect(e.pendingPixOrders()).toHaveLength(1);

    const orderId = buy.orderId!;
    const mpId = Number(orderId);

    // o preço é definido pelo SERVIDOR (pack_starter = R$ 9,99), não pelo cliente
    expect(fakeMp.payment(mpId)?.amount).toBe(9.99);

    // 2. PAGAMENTO — jogador paga; MP aprova
    fakeMp.approve(mpId);

    // 3. POLLING — o app consulta e o servidor confirma no MP
    const st = await e.checkPixOrder(orderId);
    expect(st.status).toBe('approved');
    expect(st.gold).toBe('25000');
    expect(st.diamonds).toBe(1000);
    expect(D(e.state.gold).toFixed(0)).toBe('25000');
    expect(D(e.state.crystals).toFixed(0)).toBe('1000');
    expect(e.state.pixOrders[orderId].status).toBe('done');

    // idempotente: um novo check não dobra o conteúdo
    const again = await e.checkPixOrder(orderId);
    expect(again.done).toBe(true);
    expect(D(e.state.gold).toFixed(0)).toBe('25000');
    expect(D(e.state.crystals).toFixed(0)).toBe('1000');
  });

  it('Passe Premium: cobrança real → aprovação → recibo assinado no servidor', async () => {
    const e = new GameEngine();

    // 1. COBRANÇA — o app compra o passe via Pix (mesmo fluxo da Carteira)
    const buy = await e.buyPremiumPass();
    expect(buy.ok).toBe(true);
    expect(buy.pending).toBe(true);
    expect(buy.orderId).toBeTruthy();
    expect(e.state.premiumPass.owned).toBe(false); // nada antes de pagar
    expect(e.pendingPixOrders()).toHaveLength(1);

    const orderId = buy.orderId!;
    const mpId = Number(orderId);

    // o preço do passe é definido pelo SERVIDOR (R$ 9,90), não pelo cliente
    expect(fakeMp.payment(mpId)?.amount).toBe(GameConfig.pass.priceBRL);

    // 2. POLLING antes do pagamento → continua pendente, sem posse
    let st = await e.checkPixOrder(orderId);
    expect(st.status).toBe('pending');
    expect(e.state.premiumPass.owned).toBe(false);

    // 3. PAGAMENTO — jogador paga; MP aprova
    fakeMp.approve(mpId);

    // 4. POLLING aprovado → recibo srv2 (Ed25519) do servidor + passe concedido
    st = await e.checkPixOrder(orderId);
    expect(st.status).toBe('approved');
    expect(st.done).toBe(true);
    expect(e.state.premiumPass.owned).toBe(true);
    expect(e.state.premiumPass.orderId).toBe(orderId);
    expect(e.state.premiumPass.purchaseTimestamp).toBeGreaterThan(0);
    expect(e.state.premiumPass.signature.startsWith('srv2:')).toBe(true);
    expect(e.state.premiumPass.signature).toMatch(/^srv2:[0-9a-f]{128}$/);
    expect(e.state.avatarItems).toContain('fr_premium');
    expect(e.state.titles).toContain('pass_premium');
    expect(e.pendingPixOrders()).toHaveLength(0);

    // 5. a validação do save VERIFICA a assinatura com a chave pública embutida
    const { state: validated } = validateState(e.state);
    expect(validated.premiumPass.owned).toBe(true);

    // 6. idempotente: novo check não revoga nem duplica
    const again = await e.checkPixOrder(orderId);
    expect(again.done).toBe(true);
    expect(e.state.premiumPass.owned).toBe(true);
    expect(e.state.premiumPass.signature.startsWith('srv2:')).toBe(true);
  });

  it('recibo srv2 NÃO é emitido para pedidos que não são o Passe Premium — mas o conteúdo AUTORITATIVO é entregue', async () => {
    // cobrança de fichas aprovada → o status respondido ao app não carrega
    // recibo do passe, e sim o conteúdo que o SERVIDOR resolveu na cobrança
    const e = new GameEngine();
    const buy = await e.buyFichaPack('fichas_100');
    expect(buy.pending).toBe(true);
    fakeMp.approve(Number(buy.orderId));
    const res = await fetch(`${baseUrl}/api/pix/status/${buy.orderId}`, {
      headers: { 'x-app-secret': GameConfig.wallet.appSharedSecret },
    });
    const body = (await res.json()) as { status?: string; receipt?: string; content?: { fichas?: number } };
    expect(body.status).toBe('approved');
    expect(body.receipt).toBeUndefined();
    expect(body.content).toEqual({ fichas: 100 });
  });

  it('conteúdo é AUTORITATIVO: /api/pix/charge devolve fichas/moedas/diamantes resolvidos no servidor', async () => {
    // o app nunca diz o que vai receber — a resposta da cobrança carrega o
    // conteúdo definido pelo catálogo do SERVIDOR (fichas_100 → 100 fichas)
    const r1 = await fetch(`${baseUrl}/api/pix/charge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-secret': GameConfig.wallet.appSharedSecret },
      body: JSON.stringify({ packId: 'fichas_100', playerId: 4242 }),
    });
    const b1 = (await r1.json()) as { content?: { fichas?: number; gold?: string; diamonds?: number } };
    expect(b1.content).toEqual({ fichas: 100 });

    // pacote de moedas → moedas + diamantes do catálogo do servidor
    const r2 = await fetch(`${baseUrl}/api/pix/charge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-secret': GameConfig.wallet.appSharedSecret },
      body: JSON.stringify({ packId: 'pack_starter', playerId: 4242 }),
    });
    const b2 = (await r2.json()) as { content?: { fichas?: number; gold?: string; diamonds?: number } };
    expect(b2.content).toEqual({ gold: '25000', diamonds: 1000 });

    // passe premium NÃO carrega conteúdo (a entrega é via recibo assinado)
    const r3 = await fetch(`${baseUrl}/api/pix/charge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-secret': GameConfig.wallet.appSharedSecret },
      body: JSON.stringify({ packId: 'premium_pass', playerId: 4242 }),
    });
    const b3 = (await r3.json()) as { content?: unknown };
    expect(b3.content).toBeUndefined();
  });

  it('entrega autoritativa: save adulterado não muda o conteúdo entregue', async () => {
    const e = new GameEngine();
    const buy = await e.buyCoinPack('pack_starter');
    expect(buy.pending).toBe(true);
    const orderId = buy.orderId!;

    // um jogador (ou cheat) edita o pedido no save para pedir mais
    e.state.pixOrders[orderId].gold = '999999999';
    e.state.pixOrders[orderId].diamonds = 999999;

    fakeMp.approve(Number(orderId));
    const st = await e.checkPixOrder(orderId);
    expect(st.status).toBe('approved');
    // o servidor entrega o conteúdo DELE (R$ 9,99 → 25.000 moedas + 1.000 💎),
    // não o valor adulterado no save
    expect(st.gold).toBe('25000');
    expect(st.diamonds).toBe(1000);
    expect(D(e.state.gold).toFixed(0)).toBe('25000');
    expect(D(e.state.crystals).toFixed(0)).toBe('1000');
  });

  it('pedido rejeitado pelo MP (erro do gateway) não concede fichas e volta como falha', async () => {
    fakeMp.failNextCall(); // derruba o MP apenas para a próxima chamada
    const e = new GameEngine();
    const buy = await e.buyFichaPack('fichas_800');
    expect(buy.ok).toBe(false); // servidor responde 502 → gateway recusa
    expect(e.state.fichas).toBe('0');
    expect(e.pendingPixOrders()).toHaveLength(0);
  });

  it('webhook com assinatura inválida é rejeitado (401) e nada é processado', async () => {
    const res = await fetch(`${baseUrl}/api/pix/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-signature': 'ts=999,v1=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        'x-request-id': 'req-invalida',
      },
      body: JSON.stringify({ action: 'payment.updated', data: { id: '424242' } }),
    });
    expect(res.status).toBe(401);
  });

  it('sem x-app-secret correto, a API de cobrança é negada (401)', async () => {
    const res = await fetch(`${baseUrl}/api/pix/charge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ packId: 'fichas_100', playerId: 1 }),
    });
    expect(res.status).toBe(401);
  });
});
