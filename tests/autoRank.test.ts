/**
 * Testes da publicação automática de recordes no ranking global (online por padrão):
 *   1. bestRunOfKind — escolhe o melhor ciclo de cada tipo;
 *   2. publishBestRuns — publica apenas o melhor de cada tipo no servidor real.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../server/index.js';
import { GameConfig } from '../src/config/GameConfig';
import { GameEngine } from '../src/game/engine';
import { bestRunOfKind, publishBestRuns, resetAutoRankState } from '../src/online/autoRank';
import { D } from '../src/core/bignum';

function stubLocalStorage(store: Record<string, string>) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
}

describe('Auto-publicação no ranking global', () => {
  let server: Server;
  let baseUrl = '';
  const store: Record<string, string> = {};

  beforeAll(async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    stubLocalStorage(store);
    store[GameConfig.wallet.backendUrlKey] = 'http://fake.test';

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

  beforeEach(() => {
    resetAutoRankState();
    store[GameConfig.wallet.backendUrlKey] = baseUrl;
  });

  function stateWithRuns() {
    const e = new GameEngine();
    e.state.createdAt = 800001;
    e.state.name = 'Rankeada';
    e.state.ranking = [
      { kind: 'prestige', gain: '100', count: 1, at: 1 },
      { kind: 'prestige', gain: '1e120', count: 2, at: 2 }, // melhor prestígio
      { kind: 'prestige', gain: '50', count: 3, at: 3 },
      { kind: 'ascension', gain: '999', count: 1, at: 4 }, // melhor ascensão
      { kind: 'transcendence', gain: '42', count: 1, at: 5 }, // melhor transcendência
    ];
    return e;
  }

  it('bestRunOfKind escolhe o melhor ciclo por tipo (bignum, sem perder precisão)', () => {
    const e = stateWithRuns();
    const best = bestRunOfKind(e.state, 'prestige');
    expect(best).toBeDefined();
    expect(best!.gain).toBe('1e120'); // 1e120 > 100 (comparação decimal, não string)
    expect(D(best!.gain).cmp(D('100'))).toBeGreaterThan(0);
    expect(bestRunOfKind(e.state, 'ascension')!.gain).toBe('999');
    expect(bestRunOfKind(e.state, 'transcendence')!.gain).toBe('42');
  });

  it('publishBestRuns publica o melhor de cada tipo no servidor real', async () => {
    const e = stateWithRuns();
    const results = await publishBestRuns(e.state);
    // 3 tipos com ciclo → 3 publicações
    expect(results.length).toBe(3);
    expect(results.every((r) => r.ok)).toBe(true);
    // servidor mantém o MELHOR ganho por jogador
    const res = await fetch(`${baseUrl}/api/rank?kind=prestige`);
    const data = (await res.json()) as { list?: { gain: string; count: number }[] };
    expect(data.list?.[0]?.gain).toBe('1e120');
    expect(data.list?.[0]?.count).toBe(2);
  });

  it('publishBestRuns não publica nada sem backend', async () => {
    store[GameConfig.wallet.backendUrlKey] = '';
    const e = stateWithRuns();
    const results = await publishBestRuns(e.state);
    expect(results.length).toBe(0);
  });

  it('publishBestRuns não publica nada sem identificador válido', async () => {
    const e = stateWithRuns();
    e.state.createdAt = 0;
    const results = await publishBestRuns(e.state);
    expect(results.length).toBe(0);
  });

  it('publishBestRuns ignora tipos sem ciclo', async () => {
    const e = new GameEngine();
    e.state.createdAt = 800002;
    e.state.name = 'PrestigioSo';
    e.state.ranking = [{ kind: 'prestige', gain: '5', count: 1, at: 1 }];
    const results = await publishBestRuns(e.state);
    expect(results.length).toBe(1);
    expect(results[0].kind).toBe('prestige');
  });
});
