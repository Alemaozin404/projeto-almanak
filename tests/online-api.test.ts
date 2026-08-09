/**
 * Testes da API online — conteúdo, save na nuvem e ranking global.
 * O servidor REAL (server/index.js) sobe em porta efêmera; sem UPSTASH_*
 * configurado, o store cai para o Map em memória (isolado por processo).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../server/index.js';
import { GameConfig } from '../src/config/GameConfig';

describe('API online — conteúdo, save na nuvem e ranking', () => {
  let server: Server;
  let baseUrl = '';

  beforeAll(async () => {
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
});
