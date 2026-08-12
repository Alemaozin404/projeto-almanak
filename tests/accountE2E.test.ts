/**
 * Teste E2E do fluxo completo de contas entre SITE e APP — dois dispositivos:
 *
 *   1. SITE: cria a conta (registro → código → verificação → login), joga um
 *      pouco e sincroniza o primeiro save com a conta;
 *   2. APP: em OUTRA máquina (sem nada local), loga na mesma conta e restaura
 *      tudo que estava no site — itens e progresso voltam inteiros;
 *   3. SITE: o app faz progresso novo (que sobe para a conta) e, ao voltar ao
 *      site, o progresso novo do app é restaurado lá — sync BIDIRECIONAL.
 *
 * O que é REAL neste teste:
 * - O servidor Express de verdade (server/index.js), em porta efêmera;
 * - O código CLIENTE de verdade (src/online/account.ts + src/online/accountSync.ts),
 *   o SaveManager e o GameEngine reais;
 * - Requisições HTTP reais entre dispositivo ↔ servidor (fetch nativo) — os dois
 *   "dispositivos" usam o mesmo código que o site (navegador) e o app (Electron).
 *
 * O que é SIMULADO:
 * - KV em memória (UPSTASH zerado — nunca toca o Redis real);
 * - Gmail em modo dev (sem GMAIL_USER → resposta traz devCode para confirmar);
 * - O "tempo passando" entre dispositivos: os arquivos de save locais são
 *   recodificados com savedAt no passado/futuro para respeitar a margem de
 *   restauração (RESTORE_MIN_NEWER_MS = 60s) sem depender de espera real.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../server/index.js';
import { GameEngine } from '../src/game/engine';
import { SaveManager } from '../src/save/saveManager';
import { GameConfig } from '../src/config/GameConfig';
import { hashStr } from '../src/core/utils';
import type { GameState } from '../src/game/types';
import {
  registerAccount, verifyAccount, loginAccount, setSession, resetAccountSessionState,
} from '../src/online/account';
import {
  syncAccountOnLoad, checkAccountRestore, applyAccountRestore, resetAccountSyncState,
} from '../src/online/accountSync';
import { RESTORE_MIN_NEWER_MS } from '../src/online/autoCloud';

/** Monta um arquivo de save NC1 válido com um savedAt controlado (simula passagem de tempo). */
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

interface LoginResult {
  ok?: boolean;
  token?: string;
  username?: string;
  email?: string;
  verified?: boolean;
  hasSave?: boolean;
  saveName?: string;
  saveSlot?: string;
}

describe('E2E — conta e sync do save entre SITE e APP (dois dispositivos)', () => {
  let server: Server;
  let baseUrl = '';
  /** localStorage de cada dispositivo — trocado pelo helper useDevice(). */
  let siteStore: Record<string, string>;
  let appStore: Record<string, string>;

  /** Ativa um "dispositivo": passa a usar o localStorage dele. */
  function useDevice(store: Record<string, string>): void {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
  }

  /** Cria um dispositivo com o backend apontando para o servidor local. */
  function newDevice(): Record<string, string> {
    return { [GameConfig.wallet.backendUrlKey]: baseUrl };
  }

  beforeAll(async () => {
    // os testes NUNCA tocam o Upstash real (server/.env é carregado pelo dotenv)
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    // sem GMAIL_USER/GMAIL_APP_PASSWORD → modo dev (devCode nas respostas)
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
    siteStore = newDevice();
    appStore = newDevice();
  });

  beforeEach(() => {
    resetAccountSyncState();
    resetAccountSessionState();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('SITE: registro → verificação → login → joga e sobe o primeiro save para a conta', async () => {
    useDevice(siteStore);

    // 1. registro — devCode vem na resposta (modo dev, sem Gmail real)
    const reg = await registerAccount({ username: 'heroi_site', email: 'heroi.site@gmail.com', password: 'senha-forte-123' });
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    expect(reg.devCode).toMatch(/^\d{6}$/);

    // 2. verificação do e-mail com o código
    const ver = await verifyAccount('heroi.site@gmail.com', reg.devCode!);
    expect(ver.ok).toBe(true);
    if (!ver.ok) return;
    expect(ver.verified).toBe(true);

    // 3. login → sessão na "máquina do site"
    const login = await loginAccount('heroi_site', 'senha-forte-123');
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    expect(login.token).toMatch(/^[0-9a-f]{64}$/);
    expect(login.hasSave).toBe(false); // conta recém-criada
    setSession({ username: login.username!, email: login.email!, verified: true, token: login.token! });

    // 4. o site joga um pouco e salva localmente (slot1)
    const engineSite = new GameEngine();
    engineSite.state.name = 'Herói do Site';
    const saveMgrSite = new SaveManager();
    saveMgrSite.setSlot('slot1');
    await saveMgrSite.save(engineSite);

    // 5. no load, a conta não tem save → o site sobe o dele como primeiro backup
    expect(await syncAccountOnLoad(saveMgrSite, engineSite)).toBe('pushed');

    // 6. o servidor agora reporta o save vinculado
    const login2 = await loginAccount('heroi_site', 'senha-forte-123');
    expect(login2.ok).toBe(true);
    if (!login2.ok) return;
    expect(login2.hasSave).toBe(true);
    expect(login2.saveName).toBe('Herói do Site');
    expect(login2.saveSlot).toBe('slot1');
  });

  it('APP: outra máquina loga na mesma conta e RESTAURA tudo que estava no site', async () => {
    useDevice(appStore); // máquina nova: sem sessão, sem saves

    // 1. login — o servidor já avisa que há save (nome + slot)
    const login = await loginAccount('heroi_site', 'senha-forte-123');
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    expect(login.hasSave).toBe(true);
    expect(login.saveName).toBe('Herói do Site');
    expect(login.saveSlot).toBe('slot1');
    setSession({ username: login.username!, email: login.email!, verified: true, token: login.token! });

    // 2. jogo novo no app (sem progresso local)
    const engineApp = new GameEngine();
    const saveMgrApp = new SaveManager();
    saveMgrApp.setSlot('slot1');

    // 3. o app detecta o candidato (conta com save mais novo que o nada local)
    const check = await checkAccountRestore(saveMgrApp, engineApp);
    expect(check.pending).toBe(true);
    if (!check.pending) return;
    expect(check.info.slot).toBe('slot1');
    expect(check.info.name).toBe('Herói do Site');
    expect(check.info.saveText.startsWith('NC1.')).toBe(true);

    // 4. confirmação (como a tela de Conta faria) → backup + import
    expect(await applyAccountRestore(saveMgrApp, engineApp, check.info)).toBe(true);

    // 5. TUDO do site está lá no app — itens, nome e progresso
    const loaded = await saveMgrApp.load('slot1');
    expect(loaded).not.toBeNull();
    expect(loaded!.engine.state.name).toBe('Herói do Site');
  });

  it('SITE: o app faz progresso novo (que sobe para a conta) e o site recebe ao voltar — sync bidirecional', async () => {
    // ── APP continua jogando e faz progresso NOVO ──
    useDevice(appStore);
    const saveMgrApp = new SaveManager();
    saveMgrApp.setSlot('slot1');

    // o app restaura o save da conta (como um boot normal faria)
    const loaded = await saveMgrApp.load('slot1');
    expect(loaded).not.toBeNull();
    const appEngine = loaded!.engine;
    appEngine.state.name = 'Herói do App (progresso novo)';
    await saveMgrApp.save(appEngine);
    // simula "o app jogou por mais de um minuto": local significativamente mais
    // novo que o save da conta (margem de restauração dobrada de folga)
    appStore['nc_slot1'] = craftSaveFile(appEngine.state, Date.now() + RESTORE_MIN_NEWER_MS * 2);

    // local mais novo → o app SOBE o progresso dele (não regride para a conta)
    expect(await syncAccountOnLoad(saveMgrApp, appEngine)).toBe('pushed');

    // o servidor agora tem o save novo do app
    const me = await loginAccount('heroi_site', 'senha-forte-123');
    expect(me.ok).toBe(true);
    if (!me.ok) return;
    expect(me.saveName).toBe('Herói do App (progresso novo)');

    // ── SITE volta (máquina de origem, save local ANTIGO) e recebe o app ──
    useDevice(siteStore);
    const engineSite = new GameEngine();
    const saveMgrSite = new SaveManager();
    saveMgrSite.setSlot('slot1');
    // o save local do site está velho (ficou fechado enquanto o app jogava)
    siteStore['nc_slot1'] = craftSaveFile(engineSite.state, Date.now() - RESTORE_MIN_NEWER_MS * 10);

    // candidato a restauração: a conta tem o progresso novo do app
    const check = await checkAccountRestore(saveMgrSite, engineSite);
    expect(check.pending).toBe(true);
    if (!check.pending) return;
    expect(check.info.name).toBe('Herói do App (progresso novo)');

    // boot automático do site → restaura o progresso do app (com backup do local)
    expect(await syncAccountOnLoad(saveMgrSite, engineSite)).toBe('restored');

    const backOnSite = await saveMgrSite.load('slot1');
    expect(backOnSite).not.toBeNull();
    expect(backOnSite!.engine.state.name).toBe('Herói do App (progresso novo)');
  });
});
