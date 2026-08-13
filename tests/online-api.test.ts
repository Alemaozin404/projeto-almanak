/**
 * Testes da API online — conteúdo, save na nuvem e ranking global.
 * O servidor REAL (server/index.js) sobe em porta efêmera; sem UPSTASH_*
 * configurado, o store cai para o Map em memória (isolado por processo).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../server/index.js';
import { GameConfig } from '../src/config/GameConfig';

describe('API online — conteúdo, save na nuvem e ranking', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
    // os testes NUNCA tocam o Upstash real (server/.env é carregado pelo dotenv)
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const app = createApp({
      MERCADO_PAGO_ACCESS_TOKEN: 'TEST-1234567890',
      MERCADO_PAGO_WEBHOOK_SECRET: 'test-webhook-secret',
      APP_SHARED_SECRET: GameConfig.wallet.appSharedSecret,
      PORT: '0',
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('sem porta atribuída');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/content serve o conteúdo exportado (server/content.json)', async () => {
    const res = await fetch(`${baseUrl}/api/content`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok?: boolean; content?: Record<string, unknown> };
    expect(data.ok).toBe(true);
    expect(typeof data.content?.gameVersion).toBe('string');
    expect(Array.isArray(data.content?.updates)).toBe(true);
    expect(Array.isArray(data.content?.events)).toBe(true);
    expect(Array.isArray(data.content?.maintenance)).toBe(true);
  });

  it('GET /api/meta expõe versão e janelas de manutenção', async () => {
    const res = await fetch(`${baseUrl}/api/meta`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { gameVersion?: string; maintenance?: unknown[] };
    expect(typeof data.gameVersion).toBe('string');
    expect(Array.isArray(data.maintenance)).toBe(true);
  });

  it('save na nuvem: exige segredo, guarda e devolve o save', async () => {
    // sem x-app-secret → 401
    const denied = await fetch(`${baseUrl}/api/save/123`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ saveText: 'NC1.abc', name: 'X', savedAt: 1 }),
    });
    expect(denied.status).toBe(401);

    const put = await fetch(`${baseUrl}/api/save/123`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-app-secret': GameConfig.wallet.appSharedSecret },
      body: JSON.stringify({ saveText: 'NC1.SAVE_DE_TESTE_123', name: 'JogadorX', savedAt: 1700000000000 }),
    });
    expect(put.status).toBe(200);
    expect(((await put.json()) as { ok?: boolean }).ok).toBe(true);

    const get = await fetch(`${baseUrl}/api/save/123`, {
      headers: { 'x-app-secret': GameConfig.wallet.appSharedSecret },
    });
    expect(get.status).toBe(200);
    const data = (await get.json()) as { saveText?: string; name?: string; savedAt?: number };
    expect(data.saveText).toBe('NC1.SAVE_DE_TESTE_123');
    expect(data.name).toBe('JogadorX');
    expect(data.savedAt).toBe(1700000000000);

    // inexistente → 404
    const missing = await fetch(`${baseUrl}/api/save/999`, {
      headers: { 'x-app-secret': GameConfig.wallet.appSharedSecret },
    });
    expect(missing.status).toBe(404);

    // playerId inválido → 400
    const bad = await fetch(`${baseUrl}/api/save/abc`, {
      headers: { 'x-app-secret': GameConfig.wallet.appSharedSecret },
    });
    expect(bad.status).toBe(400);
  });

  it('ranking: exige segredo, mantém o melhor por jogador e ordena por ganho', async () => {
    const post = (entry: Record<string, unknown>) =>
      fetch(`${baseUrl}/api/rank`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-app-secret': GameConfig.wallet.appSharedSecret },
        body: JSON.stringify(entry),
      });

    // sem segredo → 401
    const denied = await fetch(`${baseUrl}/api/rank`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'prestige', playerId: '1', gain: '10', name: 'A' }),
    });
    expect(denied.status).toBe(401);

    await post({ kind: 'prestige', playerId: '1', gain: '100', name: 'Ana', count: 3 });
    await post({ kind: 'prestige', playerId: '2', gain: '1e120', name: 'Bob', count: 1 });
    await post({ kind: 'prestige', playerId: '1', gain: '150', name: 'Ana', count: 4 }); // melhora o próprio recorde

    const res = await fetch(`${baseUrl}/api/rank?kind=prestige`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { list?: { playerId: string; gain: string }[] };
    expect(data.list?.length).toBe(2);
    // ordena pelo ganho real (bignum) — 1e120 > 150
    expect(data.list?.[0]?.gain).toBe('1e120');
    expect(data.list?.[1]?.gain).toBe('150');
    // cada jogador aparece apenas 1x
    const ids = (data.list ?? []).map((e) => e.playerId);
    expect(new Set(ids).size).toBe(ids.length);

    // kind inválido → 400
    const bad = await fetch(`${baseUrl}/api/rank?kind=zzz`);
    expect(bad.status).toBe(400);
  });

  it('ranking por plataforma: POST guarda a plataforma; GET filtra (all/android/pc/web)', async () => {
    const post = (entry: Record<string, unknown>) =>
      fetch(`${baseUrl}/api/rank`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-app-secret': GameConfig.wallet.appSharedSecret },
        body: JSON.stringify(entry),
      });

    await post({ kind: 'ascension', playerId: '901', gain: '500', name: 'Celu', count: 1, platform: 'android' });
    await post({ kind: 'ascension', playerId: '902', gain: '600', name: 'PcMan', count: 1, platform: 'pc' });
    await post({ kind: 'ascension', playerId: '903', gain: '700', name: 'WebGuy', count: 1 }); // sem plataforma → web

    // 'all' (padrão) traz todo mundo
    const all = (await (await fetch(`${baseUrl}/api/rank?kind=ascension`)).json()) as { list?: { playerId: string; platform?: string }[] };
    expect(all.list).toHaveLength(3);

    const android = (await (await fetch(`${baseUrl}/api/rank?kind=ascension&platform=android`)).json()) as { list?: { playerId: string }[] };
    expect(android.list).toHaveLength(1);
    expect(android.list![0].playerId).toBe('901');

    const pc = (await (await fetch(`${baseUrl}/api/rank?kind=ascension&platform=pc`)).json()) as { list?: { playerId: string }[] };
    expect(pc.list).toHaveLength(1);
    expect(pc.list![0].playerId).toBe('902');

    const web = (await (await fetch(`${baseUrl}/api/rank?kind=ascension&platform=web`)).json()) as { list?: { playerId: string }[] };
    expect(web.list).toHaveLength(1);
    expect(web.list![0].playerId).toBe('903');

    // plataforma inválida → 400
    const bad = await fetch(`${baseUrl}/api/rank?kind=ascension&platform=console`);
    expect(bad.status).toBe(400);
  });

  it('packs do admin: CRUD exige segredo, valida preço e persiste', async () => {
    const headers = { 'content-type': 'application/json', 'x-app-secret': GameConfig.wallet.appSharedSecret };

    // sem segredo → 401
    const denied = await fetch(`${baseUrl}/api/packs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'diamond_10', name: '10💎', priceBRL: 0.5, gold: '0', diamonds: 10 }),
    });
    expect(denied.status).toBe(401);

    // preço inválido (abaixo de 1 centavo) → 400
    const badPrice = await fetch(`${baseUrl}/api/packs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'diamond_10', name: '10💎', priceBRL: 0.001, gold: '0', diamonds: 10 }),
    });
    expect(badPrice.status).toBe(400);

    // sem conteúdo (nem moedas nem diamantes) → 400
    const empty = await fetch(`${baseUrl}/api/packs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'empty_pack', name: 'Vazio', priceBRL: 1, gold: '0', diamonds: 0 }),
    });
    expect(empty.status).toBe(400);

    // cria pacote válido → 200
    const create = await fetch(`${baseUrl}/api/packs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'diamond_10', name: '10 Diamantes', icon: '💎', priceBRL: 0.5, gold: '0', diamonds: 10, tag: 'Entrada' }),
    });
    expect(create.status).toBe(200);
    expect(((await create.json()) as { ok?: boolean }).ok).toBe(true);

    // lista → contém o pacote criado
    const list = await fetch(`${baseUrl}/api/packs`, { headers });
    const data = (await list.json()) as { packs?: { id: string; priceBRL: number }[] };
    expect(data.packs?.some((p) => p.id === 'diamond_10' && p.priceBRL === 0.5)).toBe(true);

    // atualiza o mesmo pacote (upsert) → preço muda
    await fetch(`${baseUrl}/api/packs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'diamond_10', name: '10 Diamantes (novo)', priceBRL: 0.75, gold: '1000', diamonds: 10 }),
    });
    const list2 = await fetch(`${baseUrl}/api/packs`, { headers });
    const data2 = (await list2.json()) as { packs?: { id: string; priceBRL: number; gold: string }[] };
    const updated = data2.packs?.find((p) => p.id === 'diamond_10');
    expect(updated?.priceBRL).toBe(0.75);
    expect(updated?.gold).toBe('1000');

    // remove → 200 e some da lista
    const del = await fetch(`${baseUrl}/api/packs/diamond_10`, { method: 'DELETE', headers });
    expect(del.status).toBe(200);
    const list3 = await fetch(`${baseUrl}/api/packs`, { headers });
    const data3 = (await list3.json()) as { packs?: { id: string }[] };
    expect(data3.packs?.some((p) => p.id === 'diamond_10')).toBe(false);

    // remover inexistente → 404
    const delMissing = await fetch(`${baseUrl}/api/packs/nao_existe`, { method: 'DELETE', headers });
    expect(delMissing.status).toBe(404);
  });

  it('packs do admin: pacote MISTO (créditos/XP/skins/caixas) é validado e persistido com conteúdo completo', async () => {
    const headers = { 'content-type': 'application/json', 'x-app-secret': GameConfig.wallet.appSharedSecret };

    // sem nenhum item → 400 (nem moedas/diamantes, nem conteúdo misto)
    const empty = await fetch(`${baseUrl}/api/packs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'vazio2', name: 'Vazio', priceBRL: 1 }),
    });
    expect(empty.status).toBe(400);

    // conteúdo misto válido → 200 e persistido com TUDO
    const create = await fetch(`${baseUrl}/api/packs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: 'combo_admin', name: 'Combo do Admin', icon: '🧺', priceBRL: 19.99,
        gold: '25000', diamonds: 700, credits: 200, xp: 1000,
        skins: ['plasma', 'num_gold'], boxes: [{ boxId: 'rare', qty: 2 }],
        titles: ['combo_mythic'], badges: ['bd_combo_mythic'],
      }),
    });
    expect(create.status).toBe(200);

    const list = await fetch(`${baseUrl}/api/packs`, { headers });
    const data = (await list.json()) as { packs?: { id: string; credits?: number; xp?: number; skins?: string[]; boxes?: { boxId: string; qty: number }[]; titles?: string[]; badges?: string[] }[] };
    const saved = data.packs?.find((p) => p.id === 'combo_admin');
    expect(saved?.credits).toBe(200);
    expect(saved?.xp).toBe(1000);
    expect(saved?.skins).toEqual(['plasma', 'num_gold']);
    expect(saved?.boxes).toEqual([{ boxId: 'rare', qty: 2 }]);
    expect(saved?.titles).toEqual(['combo_mythic']);
    expect(saved?.badges).toEqual(['bd_combo_mythic']);

    // conteúdo inválido → 400 (caixa sem qty válida)
    const badBox = await fetch(`${baseUrl}/api/packs`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ id: 'bad_box', name: 'Caixa ruim', priceBRL: 1, boxes: [{ boxId: 'rare', qty: 0 }] }),
    });
    expect(badBox.status).toBe(400);

    // remove o pacote criado
    await fetch(`${baseUrl}/api/packs/combo_admin`, { method: 'DELETE', headers });
  });

  it('packs do admin: o pacote de teste pix_test_1d é resolvido na cobrança (R$ 0,01)', async () => {
    const headers = { 'content-type': 'application/json', 'x-app-secret': GameConfig.wallet.appSharedSecret };
    const realFetch = globalThis.fetch;
    // stuba o Mercado Pago para a cobrança ser criada de verdade (evita rede real)
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('https://api.mercadopago.com')) {
        const body = JSON.parse(String(init?.body));
        if (url.endsWith('/v1/payments')) {
          return new Response(JSON.stringify({
            id: 9001,
            status: 'pending',
            transaction_amount: body.transaction_amount,
            point_of_interaction: { transaction_data: { qr_code: '000201...', qr_code_base64: 'iVBORw0KGgo=' } },
          }), { status: 201, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({}), { status: 404 });
      }
      // servidor local real
      const real = await realFetch(input, init);
      return new Response(real.body, { status: real.status, headers: real.headers });
    }));

    const charge = await fetch(`${baseUrl}/api/pix/charge`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ packId: 'pix_test_1d', playerId: 1 }),
    });
    expect(charge.status).toBe(200);
    const body = (await charge.json()) as { ok?: boolean; orderId?: string; amountBRL?: number };
    expect(body.ok).toBe(true);
    expect(body.orderId).toBe('9001');
    expect(body.amountBRL).toBe(GameConfig.wallet.pixTestPriceBRL); // R$ 0,01 vindo do SERVIDOR
    vi.unstubAllGlobals();
  });

  it('packs do admin: cobrança com pacote inexistente → 400', async () => {
    const headers = { 'content-type': 'application/json', 'x-app-secret': GameConfig.wallet.appSharedSecret };
    const charge = await fetch(`${baseUrl}/api/pix/charge`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ packId: 'pacote_nao_existe_xyz', playerId: 1 }),
    });
    expect(charge.status).toBe(400);
    const body = (await charge.json()) as { reason?: string };
    expect(body.reason).toBe('Pacote inexistente');
  });
});

/**
 * GET /api/health deve refletir o env INJETADO no createApp (não process.env).
 * O process.env aqui está com UPSTASH_* stubbed para '' pelo beforeAll — se o
 * health lesse process.env direto, reportaria 'memory' mesmo com UPSTASH
 * injetado (o bug). Com o env injetado, o status sai correto.
 */
describe('GET /api/health — usa o env injetado (não process.env)', () => {
  let healthServer: Server | null = null;

  afterEach(async () => {
    if (healthServer) {
      await new Promise<void>((resolve) => healthServer!.close(() => resolve()));
      healthServer = null;
    }
  });

  /** Sobe um servidor isolado com o env injetado desejado (fecha em caso de falha). */
  async function startHealthServer(env: { mp?: string; kvUrl?: string; kvToken?: string } = {}): Promise<string> {
    const app = createApp({
      MERCADO_PAGO_ACCESS_TOKEN: env.mp ?? '',
      MERCADO_PAGO_WEBHOOK_SECRET: 'test-webhook-secret',
      APP_SHARED_SECRET: GameConfig.wallet.appSharedSecret,
      UPSTASH_REDIS_REST_URL: env.kvUrl ?? '',
      UPSTASH_REDIS_REST_TOKEN: env.kvToken ?? '',
      PORT: '0',
    });
    const srv = app.listen(0, '127.0.0.1');
    healthServer = srv;
    try {
      await new Promise<void>((resolve) => srv.once('listening', resolve));
      const addr = srv.address();
      if (!addr || typeof addr === 'string') throw new Error('sem porta atribuída');
      return `http://127.0.0.1:${addr.port}`;
    } catch (err) {
      // não deixa servidor órfão se a subida falhar no meio
      await new Promise<void>((resolve) => srv.close(() => resolve()));
      healthServer = null;
      throw err;
    }
  }

  it('com UPSTASH + token do MP no env INJETADO → kv configured e mp configured (mesmo sem process.env)', async () => {
    const url = await startHealthServer({ mp: 'APP_USR-PRODUCAO', kvUrl: 'https://upstash.example.com', kvToken: 'token-secreto' });
    const res = await fetch(`${url}/api/health`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok?: boolean; mp?: string; kv?: string; version?: string };
    expect(data.ok).toBe(true);
    expect(data.mp).toBe('configured');
    expect(data.kv).toBe('configured');
    expect(typeof data.version).toBe('string');
  });

  it('sem nada injetado → mp missing-token e kv memory', async () => {
    const url = await startHealthServer();
    const res = await fetch(`${url}/api/health`);
    const data = (await res.json()) as { mp?: string; kv?: string };
    expect(data.mp).toBe('missing-token');
    expect(data.kv).toBe('memory');
  });

  it('com MP mas sem UPSTASH injetado → mp configured e kv memory', async () => {
    const url = await startHealthServer({ mp: 'APP_USR-PRODUCAO' });
    const res = await fetch(`${url}/api/health`);
    const data = (await res.json()) as { mp?: string; kv?: string };
    expect(data.mp).toBe('configured');
    expect(data.kv).toBe('memory');
  });
});

/**
 * Telemetria — heartbeat registra DAU/instalação e GET /api/analytics agrega.
 * Servidor próprio para estado limpo (o store em memória é por processo).
 */
describe('telemetria — DAU, instalação e resumo agregado', () => {
  let teleServer: Server | null = null;
  let teleUrl = '';
  const secret = GameConfig.wallet.appSharedSecret;

  beforeAll(async () => {
    const app = createApp({
      MERCADO_PAGO_ACCESS_TOKEN: 'TEST-1234567890',
      MERCADO_PAGO_WEBHOOK_SECRET: 'test-webhook-secret',
      APP_SHARED_SECRET: secret,
      PORT: '0',
    });
    teleServer = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => teleServer!.once('listening', resolve));
    const addr = teleServer.address();
    if (!addr || typeof addr === 'string') throw new Error('sem porta atribuída');
    teleUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    if (teleServer) await new Promise<void>((resolve) => teleServer!.close(() => resolve()));
  });

  it('GET /api/analytics exige o segredo do app (401 sem ele)', async () => {
    const res = await fetch(`${teleUrl}/api/analytics`);
    expect(res.status).toBe(401);
  });

  it('heartbeat de jogadores registra DAU e instalação; analytics reflete', async () => {
    const beat = (playerId: number, platform: string) =>
      fetch(`${teleUrl}/api/heartbeat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-app-secret': secret },
        body: JSON.stringify({ playerId, gameVersion: '1.6.0', platform }),
      });
    // 3 jogadores distintos (2 android, 1 web) — primeiro sinal = instalação
    await beat(700001, 'android');
    await beat(700002, 'android');
    await beat(700003, 'web');
    // repetição do mesmo jogador NÃO conta nova instalação nem infla DAU
    await beat(700001, 'android');

    const res = await fetch(`${teleUrl}/api/analytics?days=7`, {
      headers: { 'x-app-secret': secret },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      ok?: boolean;
      series?: { dau?: number; installs?: number }[];
      platforms?: { android?: number; pc?: number; web?: number };
    };
    expect(data.ok).toBe(true);
    // o último dia da série é hoje — deve ter os 3 jogadores distintos
    const today = data.series?.at(-1);
    expect(today?.dau).toBe(3);
    expect(today?.installs).toBe(3); // 3 primeiros sinais = 3 instalações
    expect(data.platforms?.android).toBe(2);
    expect(data.platforms?.web).toBe(1);
    expect(data.platforms?.pc).toBe(0);
  });

  it('retrocede dias: série com dias anteriores não estoura', async () => {
    const res = await fetch(`${teleUrl}/api/analytics?days=60`, {
      headers: { 'x-app-secret': secret },
    });
    const data = (await res.json()) as { ok?: boolean; series?: unknown[]; days?: number };
    expect(data.ok).toBe(true);
    expect(data.days).toBe(60);
    expect(Array.isArray(data.series)).toBe(true);
    expect(data.series?.length).toBe(60);
    // dias sem dados: DAU 0, instalações 0 — nunca null/NaN
    const first = data.series?.[0] as { dau?: number; installs?: number; revenueBRL?: number };
    expect(first.dau).toBe(0);
    expect(first.installs).toBe(0);
    expect(first.revenueBRL).toBe(0);
  });
});
