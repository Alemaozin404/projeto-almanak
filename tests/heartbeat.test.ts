/**
 * Testes do sistema oculto de heartbeat:
 *   1. Endpoint do servidor POST /api/heartbeat — registra presença e devolve
 *      o ponteiro de atualização (versão + conteúdo exportado);
 *   2. Cliente startHeartbeat — envia o sinal a cada 1 minuto e dispara o
 *      re-sync de conteúdo quando o servidor reporta conteúdo novo.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../server/index.js';
import { GameConfig } from '../src/config/GameConfig';
import { HEARTBEAT_INTERVAL_MS, resetHeartbeatState, startHeartbeat } from '../src/online/heartbeat';

function stubLocalStorage(store: Record<string, string>) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
}

describe('Servidor — POST /api/heartbeat', () => {
  let server: Server;
  let baseUrl = '';
  const store: Record<string, string> = {};

  beforeAll(async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    stubLocalStorage(store);

    const app = createApp({
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

  it('aceita o sinal com x-app-secret e devolve o ponteiro de atualização', async () => {
    const res = await fetch(`${baseUrl}/api/heartbeat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-app-secret': GameConfig.wallet.appSharedSecret,
      },
      body: JSON.stringify({ playerId: 12345, gameVersion: GameConfig.version }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean; ts: number; gameVersion: string; contentUpdatedAt: string | null; maintenance: boolean };
    expect(data.ok).toBe(true);
    expect(typeof data.ts).toBe('number');
    expect(typeof data.gameVersion).toBe('string');
    expect('contentUpdatedAt' in data).toBe(true);
    expect(typeof data.maintenance).toBe('boolean');
  });

  it('rejeita o sinal sem x-app-secret (401)', async () => {
    const res = await fetch(`${baseUrl}/api/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerId: 12345 }),
    });
    expect(res.status).toBe(401);
  });

  it('playerId inválido não quebra o sinal (presença ignorada, resposta ok)', async () => {
    const res = await fetch(`${baseUrl}/api/heartbeat`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-app-secret': GameConfig.wallet.appSharedSecret,
      },
      body: JSON.stringify({ playerId: 'abc' }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it('GET /api/online lista quem sinalizou nos últimos 3 min e exige x-app-secret', async () => {
    // sem secret → 401
    const denied = await fetch(`${baseUrl}/api/online`);
    expect(denied.status).toBe(401);

    // dois jogadores únicos sinalizam → ambos aparecem, mais recente primeiro
    const h1 = await fetch(`${baseUrl}/api/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-secret': GameConfig.wallet.appSharedSecret },
      body: JSON.stringify({ playerId: 1111, gameVersion: '1.2.4' }),
    });
    expect(h1.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10)); // garante ordem de lastSeenAt
    const h2 = await fetch(`${baseUrl}/api/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-secret': GameConfig.wallet.appSharedSecret },
      body: JSON.stringify({ playerId: 2222, gameVersion: '1.2.4' }),
    });
    expect(h2.status).toBe(200);

    const list = await fetch(`${baseUrl}/api/online`, {
      headers: { 'x-app-secret': GameConfig.wallet.appSharedSecret },
    });
    const data = (await list.json()) as { ok: boolean; count: number; online: { playerId: string; gameVersion: string; lastSeenAt: number }[] };
    expect(data.ok).toBe(true);
    const ids = data.online.map((p) => p.playerId);
    expect(ids).toContain('1111');
    expect(ids).toContain('2222');
    // os dois sinais que acabamos de enviar são os mais recentes e nessa ordem
    expect(ids[0]).toBe('2222');
    expect(ids[1]).toBe('1111');
    expect(data.online.find((p) => p.playerId === '1111')?.gameVersion).toBe('1.2.4');
    expect(typeof data.online[0].lastSeenAt).toBe('number');
  });
});

describe('Cliente — startHeartbeat (sinal oculto de 1 min)', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    // estado module-level do heartbeat é compartilhado entre execuções — zera para isolamento
    resetHeartbeatState();
  });

  beforeAll(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    stubLocalStorage(store);
    store[GameConfig.wallet.backendUrlKey] = 'http://fake.test';
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('envia o sinal a cada 1 minuto e re-sincroniza quando o conteúdo muda', async () => {
    vi.useFakeTimers();
    let contentStamp = '2026-01-01T00:00:00.000Z';
    let maintenance = false;
    let beats = 0;
    const onChange = vi.fn();
    const onMaintenance = vi.fn();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const json = (body: unknown, status = 200) =>
          new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

        // /api/heartbeat — o servidor devolve o ponteiro atual
        if (url.endsWith('/api/heartbeat') && init?.method === 'POST') {
          beats += 1;
          return json({ ok: true, ts: Date.now(), gameVersion: '1.2.4', contentUpdatedAt: contentStamp, maintenance });
        }
        // /api/content — o conteúdo que o re-sync baixa
        if (url.endsWith('/api/content')) {
          return json({
            ok: true,
            content: {
              gameVersion: '1.2.4',
              exportedAt: contentStamp,
              updates: [],
              news: [],
              banners: [],
              events: [],
              seasons: [],
              codes: [],
              maintenance: [],
            },
          });
        }
        return json({ ok: false }, 404);
      }),
    );

    const stop = startHeartbeat(1, onChange, onMaintenance);

    // sinal imediato (1º batimento registra o ponteiro — sem re-sync)
    await vi.advanceTimersByTimeAsync(0);
    expect(beats).toBe(1);
    expect(onChange).not.toHaveBeenCalled();
    expect(onMaintenance).not.toHaveBeenCalled(); // servidor sem manutenção

    // +1 min: ponteiro igual → sinal enviado, mas SEM re-sync
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    expect(beats).toBe(2);
    expect(onChange).not.toHaveBeenCalled();

    // o servidor publica conteúdo novo → +1 min: sinal detecta e re-sincroniza
    contentStamp = '2026-01-01T01:00:00.000Z';
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    expect(beats).toBe(3);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onMaintenance).not.toHaveBeenCalled();

    // servidor sinaliza manutenção → +1 min: aviso ÚNICO na transição false → true.
    // O sync também roda de novo (o conteúdo mudou junto) → onChange chega à 2ª chamada.
    maintenance = true;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    expect(beats).toBe(4);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onMaintenance).toHaveBeenCalledTimes(1);

    // manutenção continua sinalizada → +1 min: NÃO repete o aviso nem o re-sync
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS);
    expect(beats).toBe(5);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onMaintenance).toHaveBeenCalledTimes(1);

    // parado → não envia mais
    stop();
    await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
    expect(beats).toBe(5);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onMaintenance).toHaveBeenCalledTimes(1);
  });
});
