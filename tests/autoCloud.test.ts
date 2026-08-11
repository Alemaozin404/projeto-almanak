/**
 * Testes da sincronização automática com a nuvem (online por padrão):
 *   1. autoPushSave — envia o save após cada save local (com throttle);
 *   2. autoSyncOnLoad — restaura a nuvem quando mais nova, sobe o local quando
 *      não há save na nuvem, e respeita o toggle de sincronização automática.
 *
 * Usa o servidor REAL (server/index.js) em porta efêmera — sem UPSTASH, o KV
 * cai no Map em memória (isolado por processo).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../server/index.js';
import { GameConfig } from '../src/config/GameConfig';
import { GameEngine } from '../src/game/engine';
import { SaveManager } from '../src/save/saveManager';
import { autoPushSave, autoSyncOnLoad, resetAutoCloudState } from '../src/online/autoCloud';
import { resetCloudStatus } from '../src/online/status';
import { hashStr } from '../src/core/utils';
import type { GameState } from '../src/game/types';

/** Monta um arquivo de save NC1 válido com um savedAt controlado (para simular saves antigos). */
function craftSaveFile(state: GameState, savedAt: number): string {
  const payload = JSON.stringify(state);
  const file = {
    version: 1,
    schemaVersion: state.schemaVersion,
    data: state,
    checksum: hashStr(payload),
    savedAt,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(file));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'NC1.' + btoa(bin);
}

function stubLocalStorage(store: Record<string, string>) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
}

describe('Auto-sync do save com a nuvem', () => {
  let server: Server;
  let baseUrl = '';
  const store: Record<string, string> = {};

  beforeAll(async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    stubLocalStorage(store);
    store[GameConfig.wallet.backendUrlKey] = 'http://fake.test'; // inicialmente desligado (será sobrescrito)

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
    resetAutoCloudState();
    resetCloudStatus();
    store[GameConfig.wallet.backendUrlKey] = baseUrl; // backend online por padrão
  });

  function engineWith(playerId: number, name = 'Teste') {
    const e = new GameEngine();
    e.state.createdAt = playerId;
    e.state.name = name;
    return e;
  }

  it('autoPushSave envia o save para a nuvem quando online', async () => {
    const e = engineWith(900001);
    const mgr = new SaveManager();
    mgr.setSlot('slot1');
    await mgr.save(e);
    const r = await autoPushSave(e, mgr, true);
    expect(r.ok).toBe(true);
    // confere que o save chegou ao servidor
    const res = await fetch(`${baseUrl}/api/save/900001`, {
      headers: { 'x-app-secret': GameConfig.wallet.appSharedSecret },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { saveText?: string; name?: string };
    expect(data.saveText?.startsWith('NC1.')).toBe(true);
    expect(data.name).toBe('Teste');
  });

  it('autoPushSave é no-op sem backend configurado', async () => {
    store[GameConfig.wallet.backendUrlKey] = '';
    const e = engineWith(900002);
    const mgr = new SaveManager();
    mgr.setSlot('slot1');
    const r = await autoPushSave(e, mgr, true);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Backend');
  });

  it('autoPushSave respeita o toggle de sincronização automática', async () => {
    const e = engineWith(900003);
    e.state.settings.cloudSyncEnabled = false;
    const mgr = new SaveManager();
    mgr.setSlot('slot1');
    const r = await autoPushSave(e, mgr, true);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('desativada');
  });

  it('autoSyncOnLoad restaura a nuvem quando ela é mais recente (com backup)', async () => {
    const playerId = 900004;
    // 1. envia a versão da nuvem (save válido com playerId do jogador)
    const cloud = engineWith(playerId, 'Versão Nuvem');
    const mgrCloud = new SaveManager();
    mgrCloud.setSlot('slot1');
    const push = await autoPushSave(cloud, mgrCloud, true);
    expect(push.ok).toBe(true);

    // 2. o save LOCAL é mais antigo (simulado com timestamp no passado)
    const local = engineWith(playerId, 'Versão Local');
    const oldFile = craftSaveFile(local.state, Date.now() - 3_600_000); // 1h atrás
    store[`nc_slot1`] = oldFile;

    // 3. ao carregar, a nuvem (mais nova) deve ser restaurada
    const mgr = new SaveManager();
    mgr.setSlot('slot1');
    const r = await autoSyncOnLoad(mgr, local);
    expect(r).toBe('restored');
    // o slot agora contém a versão da nuvem
    const loaded = await mgr.load('slot1');
    expect(loaded).not.toBeNull();
    expect(loaded!.engine.state.name).toBe('Versão Nuvem');
  });

  it('autoSyncOnLoad sobe o local quando ele é mais novo que a nuvem', async () => {
    const playerId = 900008;
    // nuvem com save antigo
    const cloud = engineWith(playerId, 'Nuvem Antiga');
    const mgrCloud = new SaveManager();
    mgrCloud.setSlot('slot1');
    await mgrCloud.save(cloud);
    // push direto (sem throttle) e confirma o savedAt da nuvem
    await autoPushSave(cloud, mgrCloud, true);

    // local significativamente mais novo (simulado com timestamp no futuro)
    const local = engineWith(playerId, 'Local Novo');
    const freshFile = craftSaveFile(local.state, Date.now() + 3_600_000); // +1h
    store[`nc_slot1`] = freshFile;
    const mgr = new SaveManager();
    mgr.setSlot('slot1');
    const r = await autoSyncOnLoad(mgr, local);
    expect(r).toBe('pushed');
    // a nuvem agora tem a versão local
    const res = await fetch(`${baseUrl}/api/save/${playerId}`, {
      headers: { 'x-app-secret': GameConfig.wallet.appSharedSecret },
    });
    const data = (await res.json()) as { name?: string };
    expect(data.name).toBe('Local Novo');
  });

  it('autoSyncOnLoad não faz nada quando os timestamps são equivalentes (mesma sessão)', async () => {
    const playerId = 900009;
    // nuvem e local com o MESMO save (cenário de boot normal no mesmo PC)
    const e = engineWith(playerId, 'Igual');
    const mgr = new SaveManager();
    mgr.setSlot('slot1');
    await mgr.save(e);
    const push = await autoPushSave(e, mgr, true);
    expect(push.ok).toBe(true);
    // local com timestamp equivalente (poucos ms depois do push)
    const r = await autoSyncOnLoad(mgr, e);
    expect(r).toBe('noop');
    // a nuvem não foi sobrescrita por um save "levemente mais novo"
    const res = await fetch(`${baseUrl}/api/save/${playerId}`, {
      headers: { 'x-app-secret': GameConfig.wallet.appSharedSecret },
    });
    expect(res.status).toBe(200);
  });

  it('autoSyncOnLoad sobe o local quando não há save na nuvem (primeiro backup)', async () => {
    const e = engineWith(900005, 'Primeiro');
    const mgr = new SaveManager();
    mgr.setSlot('slot1');
    await mgr.save(e);
    const r = await autoSyncOnLoad(mgr, e);
    expect(r).toBe('pushed');
    // confere que o servidor agora tem o save
    const res = await fetch(`${baseUrl}/api/save/900005`, {
      headers: { 'x-app-secret': GameConfig.wallet.appSharedSecret },
    });
    expect(res.status).toBe(200);
  });

  it('autoSyncOnLoad respeita o toggle desativado', async () => {
    const e = engineWith(900006);
    e.state.settings.cloudSyncEnabled = false;
    const mgr = new SaveManager();
    mgr.setSlot('slot1');
    const r = await autoSyncOnLoad(mgr, e);
    expect(r).toBe('disabled');
  });

  it('autoSyncOnLoad é no-op sem backend', async () => {
    store[GameConfig.wallet.backendUrlKey] = '';
    const e = engineWith(900007);
    const mgr = new SaveManager();
    mgr.setSlot('slot1');
    const r = await autoSyncOnLoad(mgr, e);
    expect(r).toBe('offline');
  });
});
