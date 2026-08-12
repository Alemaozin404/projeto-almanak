/**
 * Restauração do save da CONTA ao logar em outro dispositivo — suíte dedicada.
 *
 * O cenário central: o jogador joga no SITE (dispositivo A), o save sobe para a
 * conta, e ao logar no APP (dispositivo B — máquina nova) o progresso volta
 * inteiro. Aqui cada cenário usa o servidor REAL (server/index.js), o código
 * cliente REAL (src/online/account.ts + accountSync.ts), o SaveManager e o
 * GameEngine reais, e fetch HTTP real entre dispositivo ↔ servidor.
 *
 * Casos de borda cobertos (o que NÃO deve destruir o save):
 * - conta mais nova que o local → restaura (automática e com confirmação);
 * - save da conta de OUTRO slot → não restaura automaticamente;
 * - local mais novo que a conta → sobe o local (nunca regride);
 * - falha de rede no pull → não toca em nada.
 *
 * Simulações: KV em memória (nunca toca o Upstash), Gmail em modo dev
 * (devCode na resposta) e passagem de tempo via savedAt craftado nos arquivos
 * locais (margem de restauração RESTORE_MIN_NEWER_MS = 60s).
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
  registerAccount, verifyAccount, loginAccount, setSession, setAccountSlotPref,
  changePassword, requestRecovery, resetPassword, fetchAccountMe, getSession,
  resetAccountSessionState,
} from '../src/online/account';
import {
  syncAccountOnLoad, checkAccountRestore, applyAccountRestore, pushAccountSaveNow,
  resetAccountSyncState,
} from '../src/online/accountSync';
import { RESTORE_MIN_NEWER_MS } from '../src/online/autoCloud';

/** Monta um arquivo de save NC1 válido com savedAt controlado (simula passagem de tempo). */
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

describe('Restauração do save da conta ao logar em outro dispositivo', () => {
  let server: Server;
  let baseUrl = '';
  let deviceA: Record<string, string>;
  let deviceB: Record<string, string>;
  let nextUser = 0;

  /** Alterna o "dispositivo" ativo (cada um tem seu próprio localStorage). */
  function useDevice(store: Record<string, string>): void {
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
  }

  function newDevice(): Record<string, string> {
    return { [GameConfig.wallet.backendUrlKey]: baseUrl };
  }

  /** Conta única por teste (o KV em memória persiste durante a suíte). */
  function newCreds(): { username: string; email: string; password: string } {
    nextUser += 1;
    return {
      username: `restaura_${nextUser}`,
      email: `restaura${nextUser}.test@gmail.com`,
      password: 'senha-forte-123',
    };
  }

  /** Loga no dispositivo atual e guarda a sessão local (como a tela de Conta faz). */
  async function loginAs(login: string, password: string): Promise<LoginResult> {
    const res = await loginAccount(login, password);
    expect(res.ok).toBe(true);
    if (!res.ok) return res;
    setSession({ username: res.username!, email: res.email!, verified: true, token: res.token! });
    return res;
  }

  /**
   * Fluxo completo no SITE (dispositivo A): cria a conta, confirma o e-mail
   * (devCode), loga, joga e sobe o primeiro save para a conta.
   */
  async function setupAccountWithProgress(): Promise<{ engine: GameEngine; saveMgr: SaveManager; username: string; email: string; password: string }> {
    // vínculo padrão (automático → segue o slot do jogo); o store do dispositivo
    // A persiste entre testes, então nunca herdar preferência de outro teste
    setAccountSlotPref('');
    const { username, email, password } = newCreds();
    const reg = await registerAccount({ username, email, password });
    expect(reg.ok).toBe(true);
    if (!reg.ok) throw new Error('registro falhou');
    const ver = await verifyAccount(email, reg.devCode!);
    expect(ver.ok).toBe(true);
    await loginAs(username, password);

    const engine = new GameEngine();
    engine.state.name = 'Mestre dos Itens';
    engine.state.gold = '25000';
    engine.state.level = 7;
    // itens e títulos NÃO-premium — sobrevivem à validação do save no load
    engine.state.avatarItems = ['av_default'];
    engine.state.titles = ['titulo_normal'];
    const saveMgr = new SaveManager();
    saveMgr.setSlot('slot1');
    await saveMgr.save(engine);

    // conta sem save → sobe o local como primeiro backup
    expect(await syncAccountOnLoad(saveMgr, engine)).toBe('pushed');
    return { engine, saveMgr, username, email, password };
  }

  beforeAll(async () => {
    // nunca toca o Upstash real (server/.env é carregado pelo dotenv)
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    // sem GMAIL → modo dev (devCode nas respostas)
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

  beforeEach(() => {
    resetAccountSyncState();
    resetAccountSessionState();
    // cada teste começa com dois dispositivos LIMPOS (o localStorage de um
    // dispositivo simula a máquina dele — não pode herdar saves de outro teste)
    deviceA = newDevice();
    deviceB = newDevice();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('boot em outra máquina restaura TUDO automaticamente: itens, recursos e progresso intactos', async () => {
    // SITE cria a conta e sobe o save
    useDevice(deviceA);
    const { username, password } = await setupAccountWithProgress();

    // APP: máquina nova, sem sessão, sem saves locais
    useDevice(deviceB);
    const login = await loginAs(username, password);
    expect(login.hasSave).toBe(true);
    expect(login.saveName).toBe('Mestre dos Itens');
    expect(login.saveSlot).toBe('slot1');

    const engineB = new GameEngine();
    const saveMgrB = new SaveManager();
    saveMgrB.setSlot('slot1');

    // boot automático (sem confirmação) → restaura o save da conta
    expect(await syncAccountOnLoad(saveMgrB, engineB)).toBe('restored');

    // NADA se perdeu: nome, recursos, nível, itens e títulos voltaram inteiros
    const loaded = await saveMgrB.load('slot1');
    expect(loaded).not.toBeNull();
    const s = loaded!.engine.state;
    expect(s.name).toBe('Mestre dos Itens');
    expect(s.gold).toBe('25000');
    expect(s.level).toBe(7);
    expect(s.avatarItems).toContain('av_default');
    expect(s.titles).toContain('titulo_normal');
  });

  it('fluxo COM confirmação: candidato não altera nada até o jogador confirmar (backup + import)', async () => {
    useDevice(deviceA);
    const { username, password } = await setupAccountWithProgress();

    useDevice(deviceB);
    await loginAs(username, password);

    // o app tem um save local ANTIGO (jogou há tempo, sem sincronizar)
    const oldLocal = new GameEngine();
    oldLocal.state.name = 'Save Local Antigo';
    const saveMgrB = new SaveManager();
    saveMgrB.setSlot('slot1');
    deviceB['nc_slot1'] = craftSaveFile(oldLocal.state, Date.now() - RESTORE_MIN_NEWER_MS * 10);

    // 1. só CONSULTA: pendente, com o candidato da conta
    const check = await checkAccountRestore(saveMgrB, new GameEngine());
    expect(check.pending).toBe(true);
    if (!check.pending) return;
    expect(check.info.slot).toBe('slot1');
    expect(check.info.name).toBe('Mestre dos Itens');

    // 2. ANTES de confirmar: o save local continua intacto
    const before = await saveMgrB.load('slot1');
    expect(before).not.toBeNull();
    expect(before!.engine.state.name).toBe('Save Local Antigo');

    // 3. confirmação → backup + import do save da conta
    expect(await applyAccountRestore(saveMgrB, new GameEngine(), check.info)).toBe(true);
    const after = await saveMgrB.load('slot1');
    expect(after).not.toBeNull();
    expect(after!.engine.state.name).toBe('Mestre dos Itens');
    expect(after!.engine.state.gold).toBe('25000');
  });

  it('save da conta de OUTRO slot não é restaurado automaticamente (other-slot)', async () => {
    useDevice(deviceA);
    const { username, email, password } = newCreds();
    const reg = await registerAccount({ username, email, password });
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    await verifyAccount(email, reg.devCode!);
    await loginAs(username, password);

    // o SITE joga no slot1, mas escolhe VINCULAR o save da conta ao slot2
    const engine = new GameEngine();
    engine.state.name = 'Jogador do Slot2';
    const saveMgr = new SaveManager();
    saveMgr.setSlot('slot1');
    setAccountSlotPref('slot2'); // preferência de vínculo escolhida na tela de Conta
    await saveMgr.save(engine);
    expect(await pushAccountSaveNow(engine, saveMgr)).toMatchObject({ ok: true });

    // APP: máquina nova, jogo aberto no slot1
    useDevice(deviceB);
    await loginAs(username, password);
    const saveMgrB = new SaveManager();
    saveMgrB.setSlot('slot1');

    const check = await checkAccountRestore(saveMgrB, new GameEngine());
    expect(check.pending).toBe(false);
    if (check.pending) return;
    expect(check.reason).toBe('other-slot');
    // boot automático → não faz nada (sem destruir nada)
    expect(await syncAccountOnLoad(saveMgrB, new GameEngine())).toBe('noop');
    const local = await saveMgrB.load('slot1');
    expect(local).toBeNull(); // máquina nova mesmo — nada foi importado
  });

  it('local MAIS NOVO que a conta → não restaura: sobe o local (nunca regride progresso)', async () => {
    useDevice(deviceA);
    const { username, password } = await setupAccountWithProgress();

    useDevice(deviceB);
    await loginAs(username, password);

    // o app tem um save local MAIS NOVO que a conta (jogou desde o último sync)
    const newerLocal = new GameEngine();
    newerLocal.state.name = 'Progresso Novo do App';
    const saveMgrB = new SaveManager();
    saveMgrB.setSlot('slot1');
    deviceB['nc_slot1'] = craftSaveFile(newerLocal.state, Date.now() + RESTORE_MIN_NEWER_MS * 2);

    // nada é restaurado — o local é a fonte da verdade
    const check = await checkAccountRestore(saveMgrB, new GameEngine());
    expect(check.pending).toBe(false);
    if (check.pending) return;
    expect(check.reason).toBe('local-newer');
    expect(await syncAccountOnLoad(saveMgrB, new GameEngine())).toBe('pushed');

    // o local continua com o progresso novo (e a conta passou a tê-lo também)
    const local = await saveMgrB.load('slot1');
    expect(local).not.toBeNull();
    expect(local!.engine.state.name).toBe('Progresso Novo do App');
  });

  it('falha de rede/sessão no pull → nada é tocado (protege o save local e o da conta)', async () => {
    useDevice(deviceA);
    await setupAccountWithProgress();

    useDevice(deviceB);
    // sessão INVÁLIDA (token forjado) — o pull falha como rede (401, não 404)
    setSession({ username: 'alguem', email: 'alguem@gmail.com', verified: true, token: 'f'.repeat(64) });
    const local = new GameEngine();
    local.state.name = 'Save Precioso Local';
    const saveMgrB = new SaveManager();
    saveMgrB.setSlot('slot1');
    deviceB['nc_slot1'] = craftSaveFile(local.state, Date.now());

    const check = await checkAccountRestore(saveMgrB, new GameEngine());
    expect(check.pending).toBe(false);
    if (check.pending) return;
    expect(check.reason).toBe('network');
    // nem o boot automático nem o check tocam no local
    expect(await syncAccountOnLoad(saveMgrB, new GameEngine())).toBe('noop');
    const intact = await saveMgrB.load('slot1');
    expect(intact).not.toBeNull();
    expect(intact!.engine.state.name).toBe('Save Precioso Local');
  });

  it('troca de senha no meio do caminho → outro dispositivo restaura com a senha NOVA', async () => {
    useDevice(deviceA);
    const { username, password } = await setupAccountWithProgress();

    // o jogador troca a senha NA MÁQUINA A (sessão A continua válida)
    const sessionA = getSession();
    expect(sessionA).not.toBeNull();
    const ch = await changePassword(sessionA!.token, password, 'senha-nova-456');
    expect(ch.ok).toBe(true);

    // a senha antiga não entra mais; a nova entra
    const oldLogin = await loginAccount(username, password);
    expect(oldLogin.ok).toBe(false);
    expect(oldLogin.reason).toContain('incorretos');
    const newLogin = await loginAccount(username, 'senha-nova-456');
    expect(newLogin.ok).toBe(true);

    // dispositivo B loga com a senha NOVA e restaura tudo
    useDevice(deviceB);
    const login = await loginAs(username, 'senha-nova-456');
    expect(login.hasSave).toBe(true);
    expect(login.saveName).toBe('Mestre dos Itens');
    const saveMgrB = new SaveManager();
    saveMgrB.setSlot('slot1');
    const check = await checkAccountRestore(saveMgrB, new GameEngine());
    expect(check.pending).toBe(true);
    if (!check.pending) return;
    expect(await applyAccountRestore(saveMgrB, new GameEngine(), check.info)).toBe(true);
    const loaded = await saveMgrB.load('slot1');
    expect(loaded).not.toBeNull();
    expect(loaded!.engine.state.name).toBe('Mestre dos Itens');
    expect(loaded!.engine.state.gold).toBe('25000');
    expect(loaded!.engine.state.level).toBe(7);
  });

  it('troca de senha derruba a sessão do OUTRO dispositivo — o save sobrevive e restaura', async () => {
    useDevice(deviceA);
    const { username, password } = await setupAccountWithProgress();

    // dispositivo B entra na conta (segunda sessão ativa)
    useDevice(deviceB);
    const loginB = await loginAs(username, password);
    expect(loginB.token).toMatch(/^[0-9a-f]{64}$/);

    // dispositivo A troca a senha → o servidor derruba as OUTRAS sessões
    useDevice(deviceA);
    const sessionA = getSession();
    expect(sessionA).not.toBeNull();
    expect((await changePassword(sessionA!.token, password, 'senha-nova-456')).ok).toBe(true);

    // a sessão do B morreu no servidor (a troca de senha não toca no save)
    const meB = await fetchAccountMe(loginB.token!);
    expect(meB.ok).toBe(false);
    expect(meB.status).toBe(401);

    // B re-loga com a senha nova e restaura TUDO (o save ficou intacto)
    useDevice(deviceB);
    const relogin = await loginAs(username, 'senha-nova-456');
    expect(relogin.hasSave).toBe(true);
    const saveMgrB = new SaveManager();
    saveMgrB.setSlot('slot1');
    const check = await checkAccountRestore(saveMgrB, new GameEngine());
    expect(check.pending).toBe(true);
    if (!check.pending) return;
    expect(check.info.name).toBe('Mestre dos Itens');
    expect(await applyAccountRestore(saveMgrB, new GameEngine(), check.info)).toBe(true);
    const loaded = await saveMgrB.load('slot1');
    expect(loaded).not.toBeNull();
    expect(loaded!.engine.state.name).toBe('Mestre dos Itens');
    expect(loaded!.engine.state.gold).toBe('25000');
  });

  it('recuperação de senha no meio do caminho → outro dispositivo restaura com a senha redefinida', async () => {
    useDevice(deviceA);
    const { username, email, password } = await setupAccountWithProgress();

    // o jogador esqueceu a senha: pede o código de recuperação e redefine
    const rec = await requestRecovery(email);
    expect(rec.ok).toBe(true);
    if (!rec.ok) return;
    expect(rec.devCode).toMatch(/^\d{6}$/);
    const reset = await resetPassword(email, rec.devCode!, 'senha-nova-789');
    expect(reset.ok).toBe(true);

    // senha antiga não entra mais; a redefinida entra
    const oldLogin = await loginAccount(username, password);
    expect(oldLogin.ok).toBe(false);
    const newLogin = await loginAccount(username, 'senha-nova-789');
    expect(newLogin.ok).toBe(true);

    // dispositivo B loga com a senha redefinida e restaura tudo
    useDevice(deviceB);
    const login = await loginAs(username, 'senha-nova-789');
    expect(login.hasSave).toBe(true);
    expect(login.saveName).toBe('Mestre dos Itens');
    const saveMgrB = new SaveManager();
    saveMgrB.setSlot('slot1');
    const check = await checkAccountRestore(saveMgrB, new GameEngine());
    expect(check.pending).toBe(true);
    if (!check.pending) return;
    expect(await applyAccountRestore(saveMgrB, new GameEngine(), check.info)).toBe(true);
    const loaded = await saveMgrB.load('slot1');
    expect(loaded).not.toBeNull();
    expect(loaded!.engine.state.name).toBe('Mestre dos Itens');
    expect(loaded!.engine.state.gold).toBe('25000');
    expect(loaded!.engine.state.level).toBe(7);
  });
});
