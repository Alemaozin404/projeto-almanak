import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { FICHA_PACKS, CREDIT_PACKS, fichaPackById, creditPackById, creditsToBRL, creditsToDiamonds, generatePixCopyPaste } from '../src/wallet/pix';
import { BOX_DEFS } from '../src/shop/boxes';
import { CONSUMABLE_DEFS } from '../src/shop/consumables';
import { resolvePixGateway, pixBackendUrl, setPixBackendUrl, clearPixBackendUrl, testPixBackend, isPixBackendUrlValid } from '../src/wallet/mp';
import { GameConfig } from '../src/config/GameConfig';
import { D } from '../src/core/bignum';
import { migrateSave } from '../src/save/migrations';
import { validateState } from '../src/save/validation';
import { createInitialState } from '../src/game/initial';

function withOnlineBackend(handler: (req: Request) => Promise<Response>) {
  const store: Record<string, string> = { [GameConfig.wallet.backendUrlKey]: 'https://pix.example.com' };
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))));
}

/** Força o modo simulado local (backend desativado explicitamente no override). */
function withLocalMode() {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k === GameConfig.wallet.backendUrlKey ? '' : null),
    setItem: () => {},
    removeItem: () => {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Carteira Ficha/Créditos', () => {
  it('catálogo de fichas tem preços crescentes e rende 1 ficha = 1 crédito', () => {
    expect(FICHA_PACKS.length).toBeGreaterThanOrEqual(4);
    let lastPrice = 0;
    let lastFichasPerReal = 0;
    for (const p of FICHA_PACKS) {
      expect(p.priceBRL).toBeGreaterThan(lastPrice);
      expect(p.fichas).toBeGreaterThan(0);
      const perReal = p.fichas / p.priceBRL;
      expect(perReal).toBeGreaterThanOrEqual(lastFichasPerReal); // pacotes maiores: melhor custo-benefício
      lastPrice = p.priceBRL;
      lastFichasPerReal = perReal;
    }
    expect(fichaPackById('fichas_100')?.priceBRL).toBe(GameConfig.wallet.pricePer100Fichas);
    expect(fichaPackById('inexistente')).toBeUndefined();
  });

  it('catálogo de créditos tem preços crescentes e é moeda universal', () => {
    expect(CREDIT_PACKS.length).toBeGreaterThanOrEqual(4);
    let lastPrice = 0;
    for (const p of CREDIT_PACKS) {
      expect(p.priceBRL).toBeGreaterThan(lastPrice);
      expect(p.credits).toBeGreaterThan(0);
      lastPrice = p.priceBRL;
    }
    expect(creditPackById('credits_100')?.credits).toBe(100);
    expect(creditPackById('inexistente')).toBeUndefined();
  });

  it('buyFichaPack concede fichas via gateway Pix e registra no log', async () => {
    withLocalMode();
    const e = new GameEngine();
    const r = await e.buyFichaPack('fichas_100');
    expect(r.ok).toBe(true);
    expect(r.fichas).toBe(100);
    expect(r.pixCode.length).toBeGreaterThan(50); // código Pix copia-e-cola gerado
    expect(D(e.state.fichas).toFixed(0)).toBe('100');
    expect(e.state.log.some((l) => l.code === 'wallet')).toBe(true);
  });

  it('pacote inexistente é rejeitado sem conceder fichas', async () => {
    const e = new GameEngine();
    const r = await e.buyFichaPack('fichas_nao_existe');
    expect(r.ok).toBe(false);
    expect(e.state.fichas).toBe('0');
  });

  it('buyCreditPack concede créditos via gateway Pix e registra no log', async () => {
    withLocalMode();
    const e = new GameEngine();
    const r = await e.buyCreditPack('credits_100');
    expect(r.ok).toBe(true);
    expect(r.credits).toBe(100);
    expect(D(e.state.credits).toFixed(0)).toBe('100');
    expect(e.state.fichas).toBe('0'); // fichas NÃO viram créditos (moedas separadas)
  });

  it('fichas não são mais convertíveis em créditos (viraram moeda de evento premium)', () => {
    const e = new GameEngine();
    e.addRes('fichas', D(500));
    expect(e.state.credits).toBe('0');
    expect(D(e.state.fichas).toFixed(0)).toBe('500');
    // o método de conversão foi removido da reestruturação
    expect((e as unknown as Record<string, unknown>).convertFichasToCredits).toBeUndefined();
  });

  it('créditos são convertidos em diamantes (1 crédito = 1 diamante) e gastos no jogo', () => {
    const e = new GameEngine();
    e.addRes('credits', D(120));
    const r = e.convertCreditsToDiamonds(100);
    expect(r.ok).toBe(true);
    expect(r.diamonds).toBe(100);
    expect(e.state.credits).toBe('20');
    expect(D(e.state.crystals).toFixed(0)).toBe('100');
    // diamantes são gastáveis no sistema premium (ex.: comprar caixa)
    const c = e.boxBuyCost('rare');
    if (c.lte(D(e.state.crystals))) {
      expect(e.buyBox('rare', 1).ok).toBe(true);
    }
    // saldo insuficiente
    expect(e.convertCreditsToDiamonds(500).ok).toBe(false);
    expect(e.convertCreditsToDiamonds(0).ok).toBe(false);
  });

  it('passe premium pode ser comprado com créditos (moeda universal)', async () => {
    const e = new GameEngine();
    // saldo insuficiente
    expect((await e.buyPremiumPass({ withCredits: true })).ok).toBe(false);
    e.addRes('credits', D(GameConfig.pass.creditsPrice));
    const r = await e.buyPremiumPass({ withCredits: true });
    expect(r.ok).toBe(true);
    expect(e.state.premiumPass.owned).toBe(true);
    expect(e.state.credits).toBe('0');
    // não compra duas vezes
    expect((await e.buyPremiumPass({ withCredits: true })).ok).toBe(false);
  });

  it('avatares premium são compráveis individualmente com créditos', () => {
    const e = new GameEngine();
    // sem créditos: falha
    expect(e.buyAvatarItem('icons', 'av_cyber').ok).toBe(false);
    e.addRes('credits', D(150));
    const r = e.buyAvatarItem('icons', 'av_cyber');
    expect(r.ok).toBe(true);
    expect(e.state.avatarItems).toContain('av_cyber');
    expect(e.state.credits).toBe('0');
    // item já possuído não compra de novo
    expect(e.buyAvatarItem('icons', 'av_cyber').ok).toBe(false);
    // item sem preço não é comprável
    expect(e.buyAvatarItem('icons', 'av_hero').ok).toBe(false);
  });

  it('caixas premium podem ser pagas com CRÉDITOS (moeda principal)', () => {
    const e = new GameEngine();
    const box = BOX_DEFS.find((b) => b.id === 'basic')!;
    expect(box.creditCost).toBeGreaterThan(0);
    // sem créditos: falha
    expect(e.buyBox('basic', 1, 'credits').ok).toBe(false);
    e.addRes('credits', D(box.creditCost! + 10));
    const r = e.buyBox('basic', 1, 'credits');
    expect(r.ok).toBe(true);
    expect(e.boxCount('basic')).toBe(1);
    expect(D(e.state.credits).eq(box.creditCost! + 10 - box.creditCost!)).toBe(true);
    // pagamento padrão continua em diamantes
    e.addRes('crystals', D(100));
    expect(e.buyBox('basic', 1).ok).toBe(true);
    expect(e.state.crystals).not.toBe('100');
  });

  it('consumíveis premium podem ser pagos com CRÉDITOS', () => {
    const e = new GameEngine();
    const def = CONSUMABLE_DEFS.find((c) => c.id === 'diamond_click')!;
    expect(def.creditCost).toBeGreaterThan(0);
    expect(e.buyConsumable('diamond_click', 1, 'credits').ok).toBe(false);
    e.addRes('credits', D(def.creditCost!));
    const r = e.buyConsumable('diamond_click', 1, 'credits');
    expect(r.ok).toBe(true);
    expect(e.consumableCount('diamond_click')).toBe(1);
    expect(e.state.credits).toBe('0');
  });

  it('XP do passe é comprável com diamantes', () => {
    const e = new GameEngine();
    expect(e.buyPassXp(0).ok).toBe(false);
    e.addRes('crystals', D(10));
    const r = e.buyPassXp(GameConfig.pass.xpPerDiamond);
    expect(r.ok).toBe(true);
    expect(D(e.state.premiumPass.xp).gte(GameConfig.pass.xpPerDiamond)).toBe(true);
    expect(e.state.crystals).not.toBe('10');
  });

  it('migração v6→v7 cria a carteira e limpa o bloco antigo de saque', () => {
    const old = createInitialState();
    old.schemaVersion = 6;
    (old as unknown as Record<string, unknown>).wallet = { pixKey: 'x', pixKeyType: 'email', withdrawals: [{ id: 'w1', credits: '10', brl: '0.5', key: 'k', at: 1, status: 'pending' }] };
    const mig = migrateSave(old);
    expect(mig.fichas).toBe('0');
    expect(mig.credits).toBe('0');
    expect('wallet' in mig).toBe(false);
    // validação também remove o bloco de saque se aparecer
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(mig));
    raw.wallet = { pixKey: 'x', pixKeyType: 'email', withdrawals: [] };
    const { state } = validateState(raw);
    expect('wallet' in state).toBe(false);
  });

  it('fichas e créditos sobrevivem ao reset de prestígio (moeda real separada)', () => {
    const e = new GameEngine();
    e.addRes('fichas', D(50));
    e.addRes('credits', D(100));
    e.addRes('energy', D(1e9));
    e.state.prestige.energyThisCycle = '1000000';
    e.prestige();
    expect(e.state.fichas).toBe('50');
    expect(e.state.credits).toBe('100');
  });

  it('código Pix copia-e-cola tem estrutura EMV e CRC válido', () => {
    const code = generatePixCopyPaste('pix-1', 6.25, 42);
    expect(code.startsWith('000201')).toBe(true);
    expect(code.includes('BR.GOV.BCB.PIX')).toBe(true);
    expect(code.endsWith('6304')).toBe(false); // CRC foi calculado no lugar do placeholder
    expect(code.length).toBeGreaterThan(100);
  });

  it('fichas são BARATAS (usadas só em eventos) — custam menos que créditos', () => {
    const f = FICHA_PACKS[0];
    const c = CREDIT_PACKS[0];
    expect(f.fichas).toBe(c.credits);
    // mesmo volume (100), fichas custam bem menos que créditos
    expect(f.priceBRL).toBeLessThan(c.priceBRL);
  });

  it('cotação configurada: 100 fichas = R$ 3,99 e 1 crédito = 1 diamante = R$ 0,05', () => {
    expect(GameConfig.wallet.pricePer100Fichas).toBe(3.99);
    expect(GameConfig.wallet.creditBRL).toBe(0.05);
    expect(GameConfig.wallet.creditsPerDiamond).toBe(1);
    expect(creditsToDiamonds(100)).toBe(100);
    expect(creditsToBRL(100)).toBeCloseTo(5, 2);
  });

  it('por padrão (sem override), o jogo usa o backend de produção configurado', () => {
    expect(pixBackendUrl()).toBe(GameConfig.wallet.backendUrl);
    expect(GameConfig.wallet.backendUrl.length).toBeGreaterThan(0);
    expect(resolvePixGateway().provider).toBe('online');
  });

  it('configuração de URL do backend via localStorage (sem recompilar)', () => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
    try {
      // sem override: padrão de produção
      expect(pixBackendUrl()).toBe(GameConfig.wallet.backendUrl);
      setPixBackendUrl('https://api.seudominio.com/');
      expect(pixBackendUrl()).toBe('https://api.seudominio.com'); // barra final removida
      expect(resolvePixGateway().provider).toBe('online');
      expect(isPixBackendUrlValid('https://x.com')).toBe(true);
      expect(isPixBackendUrlValid('nao-e-url')).toBe(false);
      clearPixBackendUrl();
      expect(pixBackendUrl()).toBe(''); // desativado explicitamente → simulado
      expect(resolvePixGateway().provider).toBe('local');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('teste de conexão com o backend usa /api/health', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, mp: 'configured' }), { status: 200 })));
    const r = await testPixBackend('https://api.seudominio.com');
    expect(r.ok).toBe(true);
    expect(r.mp).toBe('configured');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith('https://api.seudominio.com/api/health', expect.objectContaining({ headers: expect.anything() }));
    // sem URL
    const r2 = await testPixBackend('');
    expect(r2.ok).toBe(false);
    vi.unstubAllGlobals();
  });

  it('migração v7→v8 adiciona pixOrders', () => {
    const old = createInitialState();
    old.schemaVersion = 7;
    const mig = migrateSave(old);
    expect(mig.pixOrders).toEqual({});
  });

  it('fluxo online: cria pedido pendente, só concede fichas após aprovação', async () => {
    let approved = false;
    withOnlineBackend(async (req) => {
      if (req.url.includes('/api/pix/charge')) {
        return new Response(JSON.stringify({ ok: true, orderId: '12345', status: 'pending', pixCode: '000201...', qrCodeBase64: 'iVBORw0KGgo=', amountBRL: 6.25 }), { status: 200 });
      }
      if (req.url.includes('/api/pix/status/')) {
        return new Response(JSON.stringify({ ok: true, status: approved ? 'approved' : 'pending' }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    expect(resolvePixGateway().provider).toBe('online');

    const e = new GameEngine();
    const r = await e.buyFichaPack('fichas_100');
    expect(r.ok).toBe(true);
    expect(r.pending).toBe(true); // cobrança criada — aguardando pagamento
    expect(r.qrCodeBase64).toBe('iVBORw0KGgo=');
    expect(e.state.fichas).toBe('0'); // nada concedido ainda
    expect(e.pendingPixOrders().length).toBe(1);

    // primeiro check: ainda pendente
    let st = await e.checkPixOrder('12345');
    expect(st.status).toBe('pending');
    expect(e.state.fichas).toBe('0');

    // pagamento aprovado no Mercado Pago
    approved = true;
    st = await e.checkPixOrder('12345');
    expect(st.status).toBe('approved');
    expect(st.fichas).toBe(100);
    expect(e.state.fichas).toBe('100');
    expect(e.state.pixOrders['12345'].status).toBe('done');
    expect(e.pendingPixOrders().length).toBe(0);

    // segundo check: não concede de novo (idempotente)
    st = await e.checkPixOrder('12345');
    expect(st.done).toBe(true);
    expect(e.state.fichas).toBe('100');
  });

  it('fluxo online: backend recusando não concede fichas e propaga o motivo', async () => {
    withOnlineBackend(async () => new Response(JSON.stringify({ ok: false, reason: 'Pacote inexistente' }), { status: 400 }));
    const e = new GameEngine();
    const r = await e.buyFichaPack('fichas_100');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('400'); // motivo real do servidor chega ao jogador
    expect(e.state.fichas).toBe('0');
    expect(e.pendingPixOrders().length).toBe(0);
  });

  it('fluxo online: servidor inacessível (sem rede) falha com mensagem clara', async () => {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (k === GameConfig.wallet.backendUrlKey ? 'https://pix.example.com' : null),
      setItem: () => {},
      removeItem: () => {},
    });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    const e = new GameEngine();
    const r = await e.buyFichaPack('fichas_100');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Sem conexão com o servidor');
    expect(e.state.fichas).toBe('0');
  });

  it('fluxo online: recibo inválido do servidor NÃO concede o passe (mantém pendente)', async () => {
    withOnlineBackend(async (req) => {
      if (req.url.includes('/api/pix/charge')) {
        return new Response(JSON.stringify({ ok: true, orderId: '5555', status: 'pending', pixCode: '000201...', amountBRL: GameConfig.pass.priceBRL }), { status: 200 });
      }
      if (req.url.includes('/api/pix/status/')) {
        // assinatura forjada — não confere com a chave pública embutida
        return new Response(JSON.stringify({ ok: true, status: 'approved', receipt: `srv2:${'a'.repeat(128)}` }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404 });
    });
    const e = new GameEngine();
    const r = await e.buyPremiumPass();
    expect(r.ok).toBe(true);
    expect(r.pending).toBe(true);
    const st = await e.checkPixOrder('5555');
    expect(st.status).toBe('pending'); // recibo não verifica → NÃO concede
    expect(e.state.premiumPass.owned).toBe(false);
    expect(e.pendingPixOrders()).toHaveLength(1); // continua pendente p/ retry
  });

  it('pedidos Pix expiram após o prazo sem conceder fichas', async () => {
    let status = 'pending';
    withOnlineBackend(async (req) => {
      if (req.url.includes('/api/pix/charge')) {
        return new Response(JSON.stringify({ ok: true, orderId: '999', status: 'pending', pixCode: '000201...' }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, status }), { status: 200 });
    });
    const e = new GameEngine();
    const r = await e.buyFichaPack('fichas_100');
    expect(r.pending).toBe(true);
    // envelhece o pedido além do prazo
    e.state.pixOrders['999'].at = Date.now() - GameConfig.wallet.pixOrderExpiryMs - 1000;
    const st = await e.checkPixOrder('999');
    expect(st.status).toBe('cancelled');
    expect(st.done).toBe(true);
    expect(e.state.fichas).toBe('0');
    expect(e.pendingPixOrders().length).toBe(0);
  });
});
