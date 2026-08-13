import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { COIN_PACKS, BUNDLE_PACKS, packById, packPriceLabel, bundlePackById } from '../src/shop/packs';
import { GameConfig } from '../src/config/GameConfig';
import { D } from '../src/core/bignum';
import { SKIN_MAP } from '../src/content/skins';
import { BOX_MAP } from '../src/shop/boxes';
import { TITLE_MAP } from '../src/progression/titles';
import { AVATAR_CATALOG } from '../src/profile/avatars';

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

describe('Combos (pacotes mistos da Loja)', () => {
  it('catálogo tem 11 combos com preços crescentes, todos com créditos e conteúdo válido', () => {
    expect(BUNDLE_PACKS.length).toBe(11);
    let lastPrice = 0;
    let lastCreditsPerReal = 0;
    for (const p of BUNDLE_PACKS) {
      expect(p.priceBRL).toBeGreaterThan(lastPrice);
      expect(p.credits).toBeGreaterThan(0);
      // pacotes maiores oferecem mais créditos por real (escala)
      const creditsPerReal = p.credits / p.priceBRL;
      expect(creditsPerReal).toBeGreaterThanOrEqual(lastCreditsPerReal);
      lastPrice = p.priceBRL;
      lastCreditsPerReal = creditsPerReal;
      // conteúdo opcional válido quando presente
      if (p.diamonds !== undefined) expect(p.diamonds).toBeGreaterThan(0);
      if (p.gold !== undefined) {
        expect(p.gold).toMatch(/^\d{1,16}(\.\d+)?$/); // sem notação científica (Decimal string)
        expect(D(p.gold).gt(0)).toBe(true);
      }
      if (p.xp !== undefined) expect(p.xp).toBeGreaterThan(0);
      for (const sk of p.skins ?? []) expect(SKIN_MAP[sk]).toBeDefined(); // skin existe no catálogo
      for (const b of p.boxes ?? []) {
        expect(BOX_MAP[b.boxId]).toBeDefined(); // caixa existe no catálogo
        expect(b.qty).toBeGreaterThan(0);
      }
      for (const t of p.titles ?? []) expect(TITLE_MAP[t]).toBeDefined(); // título existe no catálogo
      for (const b of p.badges ?? []) expect(AVATAR_CATALOG.badges.some((x) => x.id === b)).toBe(true); // badge existe no catálogo
    }
    // desconto PROGRESSIVO: o maior combo entrega bem mais créditos por real que o menor (≥ 40% acima)
    const first = BUNDLE_PACKS[0];
    const last = BUNDLE_PACKS[BUNDLE_PACKS.length - 1];
    expect(last.credits / last.priceBRL).toBeGreaterThanOrEqual((first.credits / first.priceBRL) * 1.4);
    expect(bundlePackById('bundle_popular')?.credits).toBeGreaterThan(0);
    expect(bundlePackById('inexistente')).toBeUndefined();
  });

  it('buyBundlePack concede créditos, diamantes, moedas, XP, skins e caixas (gateway local)', async () => {
    withLocalMode();
    const e = new GameEngine();
    const r = await e.buyBundlePack('bundle_popular');
    expect(r.ok).toBe(true);
    expect(r.pending).toBeFalsy();
    expect(r.credits).toBe(480); // +20% de desconto nos créditos
    expect(D(e.state.credits).toFixed(0)).toBe('480');
    expect(D(e.state.crystals).toFixed(0)).toBe('700');
    expect(D(e.state.gold).toFixed(0)).toBe('25000');
    expect(e.state.boxes.rare).toBe(1);
    expect(e.state.skins.owned).toContain('plasma');
    expect(e.premiumPassLevel()).toBeGreaterThan(0); // XP do passe concedido
  });

  it('buyBundlePack concede TÍTULO e BADGE exclusivos (gateway local)', async () => {
    withLocalMode();
    const e = new GameEngine();
    const r = await e.buyBundlePack('bundle_omega');
    expect(r.ok).toBe(true);
    expect(r.titles).toContain('combo_omega');
    expect(r.badges).toContain('bd_combo_omega');
    expect(e.state.titles).toContain('combo_omega');
    expect(e.state.avatarItems).toContain('bd_combo_omega');
    // o título é equipável (existe no catálogo com bônus)
    expect(TITLE_MAP.combo_omega.bonus).toBeDefined();
  });

  it('buyBundlePack com gateway online cria cobrança pendente e só concede após aprovação', async () => {
    let approved = false;
    withOnlineBackend(async (req) => {
      if (req.url.includes('/api/pix/charge')) {
        return new Response(JSON.stringify({ ok: true, orderId: '888', status: 'pending', pixCode: '000201...', qrCodeBase64: 'iVBORw0KGgo=', amountBRL: 19.99 }), { status: 200 });
      }
      if (req.url.includes('/api/pix/status/')) {
        return new Response(JSON.stringify({ ok: true, status: approved ? 'approved' : 'pending' }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    const e = new GameEngine();
    const r = await e.buyBundlePack('bundle_popular');
    expect(r.ok).toBe(true);
    expect(r.pending).toBe(true);
    expect(r.orderId).toBe('888');
    // nada concedido antes de pagar (fallback local do pedido guarda o conteúdo)
    expect(e.state.credits).toBe('0');
    expect(e.state.skins.owned).not.toContain('plasma');
    expect(e.pendingPixOrders()).toHaveLength(1);

    approved = true;
    const st = await e.checkPixOrder('888');
    expect(st.status).toBe('approved');
    expect(st.credits).toBe(480);
    expect(st.skins).toContain('plasma');
    expect(D(e.state.credits).toFixed(0)).toBe('480');
    expect(D(e.state.crystals).toFixed(0)).toBe('700');
    expect(e.state.boxes.rare).toBe(1);
    expect(e.state.skins.owned).toContain('plasma');
    expect(e.pendingPixOrders()).toHaveLength(0);
  });

  it('combo inexistente é rejeitado sem conceder nada', async () => {
    const e = new GameEngine();
    const r = await e.buyBundlePack('bundle_nao_existe');
    expect(r.ok).toBe(false);
    expect(e.state.credits).toBe('0');
  });
});
