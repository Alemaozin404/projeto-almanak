/**
 * Testes do sistema de vendas do Admin (diamantes 💎 e moedas 🪙).
 * Cobre: CRUD local de pacotes, validação, sync com o servidor (publish/delete),
 * o pacote de teste Pix (R$ 0,01 → 1💎) e a compra via engine com diamantes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadPacks, savePack, deletePack, togglePack, validatePack, packIdFromName,
  fetchServerPacks, publishPackToServer, deletePackFromServer, shopPacks, testPack, pixTestEnabled,
  type AdminPack,
} from '../src/admin/sales';
import { GameConfig } from '../src/config/GameConfig';
import { GameEngine } from '../src/game/engine';
import { D } from '../src/core/bignum';

const store: Record<string, string> = {};

function stubLocalStorage() {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
}

function stubOnlineBackend(handler: (req: Request) => Promise<Response>) {
  store[GameConfig.wallet.backendUrlKey] = 'https://pix.example.com';
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))));
}

function samplePack(overrides: Partial<AdminPack> = {}): AdminPack {
  return {
    id: 'diamond_100',
    name: '100 Diamantes',
    icon: '💎',
    priceBRL: 1.0,
    gold: '0',
    diamonds: 100,
    enabled: true,
    updatedAt: 0,
    ...overrides,
  };
}

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  stubLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Vendas do Admin — CRUD local', () => {
  it('savePack persiste e loadPacks devolve os pacotes', () => {
    expect(savePack(samplePack()).ok).toBe(true);
    const packs = loadPacks();
    expect(packs.length).toBe(1);
    expect(packs[0].id).toBe('diamond_100');
    expect(packs[0].diamonds).toBe(100);
  });

  it('validatePack exige nome, preço mínimo de 1 centavo e pelo menos um item', () => {
    expect(validatePack(samplePack()).ok).toBe(true);
    expect(validatePack(samplePack({ name: '' })).ok).toBe(false);
    expect(validatePack(samplePack({ priceBRL: 0 })).ok).toBe(false);
    expect(validatePack(samplePack({ priceBRL: 2000 })).ok).toBe(false);
    expect(validatePack(samplePack({ gold: '0', diamonds: 0 })).ok).toBe(false);
    // só diamante
    expect(validatePack(samplePack({ gold: '0' })).ok).toBe(true);
    // só coin
    expect(validatePack(samplePack({ gold: '5000', diamonds: 0 })).ok).toBe(true);
  });

  it('validatePack aceita pacotes MISTOS (créditos, XP, skins, caixas, títulos e badges)', () => {
    const mixed = samplePack({
      gold: '0',
      diamonds: 0,
      credits: 500,
      xp: 2000,
      skins: ['plasma', 'num_gold'],
      boxes: [{ boxId: 'rare', qty: 2 }],
      titles: ['combo_omega'],
      badges: ['bd_combo_omega'],
    });
    expect(validatePack(mixed).ok).toBe(true);
    // só crédito
    expect(validatePack(samplePack({ gold: '0', diamonds: 0, credits: 100 })).ok).toBe(true);
    // só XP
    expect(validatePack(samplePack({ gold: '0', diamonds: 0, xp: 500 })).ok).toBe(true);
    // só skin
    expect(validatePack(samplePack({ gold: '0', diamonds: 0, skins: ['plasma'] })).ok).toBe(true);
    // só caixa
    expect(validatePack(samplePack({ gold: '0', diamonds: 0, boxes: [{ boxId: 'basic', qty: 1 }] })).ok).toBe(true);
    // só título
    expect(validatePack(samplePack({ gold: '0', diamonds: 0, titles: ['combo_mythic'] })).ok).toBe(true);
    // só badge
    expect(validatePack(samplePack({ gold: '0', diamonds: 0, badges: ['bd_combo_mythic'] })).ok).toBe(true);
    // sem NENHUM item → inválido
    expect(validatePack(samplePack({ gold: '0', diamonds: 0, credits: 0, xp: 0, skins: [], boxes: [], titles: [], badges: [] })).ok).toBe(false);
  });

  it('validatePack rejeita conteúdo inválido (skin inexistente, caixa sem qty, quantidades negativas)', () => {
    expect(validatePack(samplePack({ gold: '0', diamonds: 0, skins: ['skin_nao_existe!'] })).ok).toBe(false);
    expect(validatePack(samplePack({ gold: '0', diamonds: 0, boxes: [{ boxId: 'rare', qty: 0 }] })).ok).toBe(false);
    expect(validatePack(samplePack({ gold: '0', diamonds: 0, credits: -5 })).ok).toBe(false);
    expect(validatePack(samplePack({ gold: '0', diamonds: 0, xp: -1 })).ok).toBe(false);
  });

  it('savePack persiste conteúdo misto (créditos, XP, skins, caixas, títulos e badges)', () => {
    const p = samplePack({
      gold: '25000',
      diamonds: 700,
      credits: 200,
      xp: 1000,
      skins: ['plasma'],
      boxes: [{ boxId: 'rare', qty: 1 }],
      titles: ['combo_omega'],
      badges: ['bd_combo_omega'],
    });
    expect(savePack(p).ok).toBe(true);
    const saved = loadPacks()[0];
    expect(saved.credits).toBe(200);
    expect(saved.xp).toBe(1000);
    expect(saved.skins).toEqual(['plasma']);
    expect(saved.boxes).toEqual([{ boxId: 'rare', qty: 1 }]);
    expect(saved.titles).toEqual(['combo_omega']);
    expect(saved.badges).toEqual(['bd_combo_omega']);
  });

  it('deletePack e togglePack funcionam', () => {
    savePack(samplePack());
    expect(togglePack('diamond_100').ok).toBe(true);
    expect(loadPacks()[0].enabled).toBe(false);
    expect(deletePack('diamond_100').ok).toBe(true);
    expect(loadPacks().length).toBe(0);
    expect(deletePack('inexistente').ok).toBe(false);
  });

  it('packIdFromName gera ids slug únicos', () => {
    expect(packIdFromName('Pacote de Diamantes!')).toMatch(/^pacote_de_diamantes_[a-z0-9]{4}$/);
    expect(packIdFromName('100 💎')).toMatch(/^100_[a-z0-9]{4}$/);
  });
});

describe('Vendas do Admin — sync com o servidor', () => {
  it('fetchServerPacks busca os pacotes publicados', async () => {
    stubOnlineBackend(async (req) => {
      if (req.url.includes('/api/packs') && req.method === 'GET') {
        return new Response(JSON.stringify({ ok: true, packs: [samplePack()] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    const list = await fetchServerPacks();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('diamond_100');
  });

  it('publishPackToServer envia o pacote com o preço (POST /api/packs)', async () => {
    let sent: AdminPack | null = null;
    stubOnlineBackend(async (req) => {
      if (req.url.includes('/api/packs') && req.method === 'POST') {
        sent = JSON.parse(await req.text()) as AdminPack;
        return new Response(JSON.stringify({ ok: true, pack: sent }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    const r = await publishPackToServer(samplePack());
    expect(r.ok).toBe(true);
    expect(sent?.priceBRL).toBe(1.0);
    expect(sent?.diamonds).toBe(100);
  });

  it('publishPackToServer sem backend configurado falha com mensagem clara', async () => {
    store[GameConfig.wallet.backendUrlKey] = ''; // backend desativado explicitamente
    const r = await publishPackToServer(samplePack());
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Backend');
  });

  it('deletePackFromServer chama DELETE /api/packs/:id', async () => {
    stubOnlineBackend(async (req) => {
      if (req.url.includes('/api/packs/diamond_100') && req.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    const r = await deletePackFromServer('diamond_100');
    expect(r.ok).toBe(true);
  });

  it('shopPacks mescla locais habilitados com os do servidor (servidor vence)', async () => {
    savePack(samplePack({ id: 'local_a', name: 'Local A', diamonds: 10 }));
    savePack(samplePack({ id: 'shared', name: 'Local (será sobrescrito)', diamonds: 1, enabled: true }));
    stubOnlineBackend(async () =>
      new Response(JSON.stringify({ ok: true, packs: [samplePack({ id: 'shared', name: 'Servidor', diamonds: 99 })] }), { status: 200 }),
    );
    const list = await shopPacks();
    const shared = list.find((p) => p.id === 'shared');
    expect(shared?.name).toBe('Servidor');
    expect(list.some((p) => p.id === 'local_a')).toBe(true);
  });

  it('shopPacks offline usa apenas os pacotes locais habilitados', async () => {
    store[GameConfig.wallet.backendUrlKey] = ''; // backend desativado → só local
    savePack(samplePack({ enabled: true }));
    savePack(samplePack({ id: 'disabled', enabled: false }));
    const list = await shopPacks();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe('diamond_100');
  });
});

describe('Vendas do Admin — função de teste Pix', () => {
  it('testPack é R$ 0,01 por 1 diamante', () => {
    const t = testPack();
    expect(t.id).toBe(GameConfig.wallet.pixTestPackId);
    expect(t.priceBRL).toBe(GameConfig.wallet.pixTestPriceBRL);
    expect(t.diamonds).toBe(GameConfig.wallet.pixTestDiamonds);
    expect(t.gold).toBe('0');
  });

  it('pixTestEnabled depende do backend configurado', () => {
    // URL padrão de produção (sem override) → teste online
    expect(pixTestEnabled()).toBe(true);
    store[GameConfig.wallet.backendUrlKey] = ''; // desativado explicitamente → simulado
    expect(pixTestEnabled()).toBe(false);
    store[GameConfig.wallet.backendUrlKey] = 'https://pix.example.com';
    expect(pixTestEnabled()).toBe(true);
  });
});

describe('Engine — compra de pacote MISTO do admin via Pix', () => {
  it('gateway local: buyPixPack concede créditos, XP, skins e caixas na hora', async () => {
    store[GameConfig.wallet.backendUrlKey] = ''; // gateway local simulado
    const e = new GameEngine();
    const r = await e.buyPixPack({
      id: 'combo_admin', name: 'Combo do Admin', priceBRL: 19.99,
      gold: '25000', diamonds: 700, credits: 200, xp: 1000, skins: ['plasma'], boxes: [{ boxId: 'rare', qty: 1 }],
    });
    expect(r.ok).toBe(true);
    expect(D(e.state.credits).toFixed(0)).toBe('200');
    expect(D(e.state.crystals).toFixed(0)).toBe('700');
    expect(D(e.state.gold).toFixed(0)).toBe('25000');
    expect(e.state.skins.owned).toContain('plasma');
    expect(e.state.boxes.rare).toBe(1);
    expect(e.premiumPassLevel()).toBeGreaterThan(0);
  });

  it('gateway local: buyPixPack concede títulos e badges exclusivos na hora', async () => {
    store[GameConfig.wallet.backendUrlKey] = ''; // gateway local simulado
    const e = new GameEngine();
    const r = await e.buyPixPack({
      id: 'combo_premium_admin', name: 'Combo Premium', priceBRL: 99.99,
      credits: 500, titles: ['combo_mythic'], badges: ['bd_combo_mythic'],
    });
    expect(r.ok).toBe(true);
    expect(e.state.titles).toContain('combo_mythic');
    expect(e.state.avatarItems).toContain('bd_combo_mythic');
  });
});

describe('Engine — compra de pacote de diamantes via Pix', () => {
  it('gateway local: buyPixPack concede diamantes e moedas na hora', async () => {
    store[GameConfig.wallet.backendUrlKey] = ''; // gateway local simulado
    const e = new GameEngine();
    const r = await e.buyPixPack({ id: 'diamond_50', name: '50 Diamantes', priceBRL: 0.5, gold: '2500', diamonds: 50 });
    expect(r.ok).toBe(true);
    expect(r.pending).toBeUndefined();
    expect(D(e.state.crystals).toFixed(0)).toBe('50');
    expect(D(e.state.gold).toFixed(0)).toBe('2500');
    expect(e.state.log.some((l) => l.code === 'wallet')).toBe(true);
  });

  it('gateway local: pacote só de moedas (coin) não concede diamantes', async () => {
    store[GameConfig.wallet.backendUrlKey] = ''; // gateway local simulado
    const e = new GameEngine();
    const r = await e.buyPixPack({ id: 'coin_10k', name: '10K Moedas', priceBRL: 0.1, gold: '10000' });
    expect(r.ok).toBe(true);
    expect(D(e.state.gold).toFixed(0)).toBe('10000');
    expect(e.state.crystals).toBe('0');
  });

  it('gateway local: pacote inválido (sem preço) é rejeitado', async () => {
    const e = new GameEngine();
    const r = await e.buyPixPack({ id: 'x', name: 'X', priceBRL: 0 });
    expect(r.ok).toBe(false);
  });

  it('gateway online: aprovação entrega diamantes/moedas e o pedido guarda o conteúdo', async () => {
    const fakeStore: Record<string, string> = { [GameConfig.wallet.backendUrlKey]: 'https://pix.example.com' };
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => fakeStore[k] ?? null,
      setItem: (k: string, v: string) => { fakeStore[k] = v; },
      removeItem: (k: string) => { delete fakeStore[k]; },
    });
    let approved = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init);
      if (req.url.includes('/api/pix/charge')) {
        return new Response(JSON.stringify({ ok: true, orderId: '777', status: 'pending', pixCode: '000201...', amountBRL: 0.01 }), { status: 200 });
      }
      if (req.url.includes('/api/pix/status/')) {
        return new Response(JSON.stringify({ ok: true, status: approved ? 'approved' : 'pending' }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    }));

    const e = new GameEngine();
    const r = await e.buyPixPack({ id: 'pix_test_1d', name: 'Teste', priceBRL: 0.01, gold: '0', diamonds: 1 });
    expect(r.ok).toBe(true);
    expect(r.pending).toBe(true);
    expect(e.state.crystals).toBe('0'); // nada antes de aprovar
    expect(e.state.pixOrders['777']).toMatchObject({ diamonds: 1, gold: '0' });

    approved = true;
    const st = await e.checkPixOrder('777');
    expect(st.status).toBe('approved');
    expect(st.diamonds).toBe(1);
    expect(D(e.state.crystals).toFixed(0)).toBe('1');
    expect(e.state.pixOrders['777'].status).toBe('done');
  });
});
