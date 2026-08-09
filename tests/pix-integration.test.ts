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
