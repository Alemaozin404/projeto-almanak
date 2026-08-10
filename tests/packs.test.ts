import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { COIN_PACKS, packById, packPriceLabel } from '../src/shop/packs';
import { GameConfig } from '../src/config/GameConfig';
import { D } from '../src/core/bignum';

/** Força o modo simulado local (backend desativado explicitamente no override). */
function withLocalMode() {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k === GameConfig.wallet.backendUrlKey ? '' : null),
    setItem: () => {},
    removeItem: () => {},
  });
}

/** Aponta o app para um backend online com fetch stubado (mesmo padrão da carteira). */
function withOnlineBackend(handler: (req: Request) => Promise<Response>) {
  const store: Record<string, string> = { [GameConfig.wallet.backendUrlKey]: 'https://pix.example.com' };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Pacotes de moedas (loja de compra)', () => {
  it('catálogo tem 6 faixas de preço com valores crescentes e custo-benefício crescente', () => {
    expect(COIN_PACKS.length).toBe(6);
    expect(COIN_PACKS[0].priceBRL).toBe(3.99); // entrada
    expect(COIN_PACKS[5].priceBRL).toBe(199.99); // topo
    let lastPrice = 0;
    let lastDiaPerReal = 0;
    for (const p of COIN_PACKS) {
      expect(p.priceBRL).toBeGreaterThan(lastPrice);
      expect(p.diamonds).toBeGreaterThan(0);
      expect(D(p.gold).gt(0)).toBe(true);
      // pacotes maiores oferecem mais diamantes por real (escala)
      const diaPerReal = p.diamonds / p.priceBRL;
      expect(diaPerReal).toBeGreaterThanOrEqual(lastDiaPerReal);
      lastPrice = p.priceBRL;
      lastDiaPerReal = diaPerReal;
    }
    expect(packPriceLabel(COIN_PACKS[0])).toContain('R$');
    expect(packById('pack_popular')?.diamonds).toBeGreaterThan(0);
    expect(packById('inexistente')).toBeUndefined();
  });

  it('buyCoinPack concede moedas e diamantes (gateway local simulado)', async () => {
    withLocalMode();
    const e = new GameEngine();
    const r = await e.buyCoinPack('pack_starter');
    expect(r.ok).toBe(true);
    expect(r.pending).toBeFalsy(); // gateway local concede na hora (sem pendência)
    expect(r.diamonds).toBe(1000);
    expect(D(e.state.gold).toFixed(0)).toBe('25000');
    expect(D(e.state.crystals).toFixed(0)).toBe('1000');
    expect(e.state.log.some((l) => l.code === 'wallet')).toBe(true);
  });

  it('buyCoinPack com gateway online cria cobrança pendente e só concede após aprovação', async () => {
    let approved = false;
    withOnlineBackend(async (req) => {
      if (req.url.includes('/api/pix/charge')) {
        return new Response(JSON.stringify({ ok: true, orderId: '777', status: 'pending', pixCode: '000201...', qrCodeBase64: 'iVBORw0KGgo=', amountBRL: 9.99 }), { status: 200 });
      }
      if (req.url.includes('/api/pix/status/')) {
        return new Response(JSON.stringify({ ok: true, status: approved ? 'approved' : 'pending' }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    const e = new GameEngine();
    const r = await e.buyCoinPack('pack_starter');
    expect(r.ok).toBe(true);
    expect(r.pending).toBe(true); // cobrança criada — aguardando pagamento
    expect(r.orderId).toBe('777');
    expect(e.state.gold).toBe('0'); // nada concedido antes de pagar
    expect(e.state.crystals).toBe('0');
    expect(e.pendingPixOrders()).toHaveLength(1);

    // pagamento aprovado no Mercado Pago → conteúdo concedido
    approved = true;
    const st = await e.checkPixOrder('777');
    expect(st.status).toBe('approved');
    expect(st.gold).toBe('25000');
    expect(st.diamonds).toBe(1000);
    expect(D(e.state.gold).toFixed(0)).toBe('25000');
    expect(D(e.state.crystals).toFixed(0)).toBe('1000');
    expect(e.pendingPixOrders()).toHaveLength(0);
  });

  it('pacote inexistente é rejeitado sem conceder nada', async () => {
    const e = new GameEngine();
    const r = await e.buyCoinPack('pack_nao_existe');
    expect(r.ok).toBe(false);
    expect(e.state.gold).toBe('0');
    expect(e.state.crystals).toBe('0');
  });
});
