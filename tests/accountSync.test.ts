/**
 * Testes do save automático da CONTA no servidor (a cada 1 hora).
 *
 * O módulo de rede (`src/online/account`) é mockado: aqui validamos a LÓGICA
 * do accountSync (sessão, cadência horária, toggle de sincronização e erros),
 * não o servidor — esse fluxo é coberto por tests/account.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { SaveManager } from '../src/save/saveManager';
import { hashStr } from '../src/core/utils';
import type { GameState } from '../src/game/types';

vi.mock('../src/online/account', () => ({
  getSession: vi.fn(),
  pushAccountSave: vi.fn(),
  pullAccountSave: vi.fn(),
  getAccountSlotPref: vi.fn(),
}));

import { getSession, pushAccountSave, pullAccountSave, getAccountSlotPref } from '../src/online/account';
import {
  ACCOUNT_SAVE_INTERVAL_MS,
  pushAccountSaveNow,
  autoPushAccountSave,
  syncAccountOnLoad,
  checkAccountRestore,
  applyAccountRestore,
  resetAccountSyncState,
  startAccountAutoSave,
  stopAccountAutoSave,
  lastAccountSyncAt,
  getNextAccountSyncAt,
} from '../src/online/accountSync';

const TOKEN = 'a'.repeat(64);
const SESSION = { username: 'jogador', email: 'jogador@gmail.com', verified: true, token: TOKEN };

/** Monta um arquivo de save NC1 válido com um savedAt controlado. */
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

describe('accountSync — save automático da conta (1h)', () => {
  beforeEach(() => {
    resetAccountSyncState();
    vi.clearAllMocks();
    vi.mocked(getSession).mockReturnValue(null);
    vi.mocked(pullAccountSave).mockResolvedValue({ ok: false, reason: 'Nenhum save na conta' });
    vi.mocked(getAccountSlotPref).mockReturnValue(''); // default: automático
  });

  afterEach(() => {
    stopAccountAutoSave();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function setup() {
    const engine = new GameEngine();
    engine.state.name = 'Jogador Teste';
    const saveMgr = new SaveManager();
    saveMgr.setSlot('slot1');
    return { engine, saveMgr };
  }

  it('sem conta conectada → não envia nada', async () => {
    const { engine, saveMgr } = setup();
    const r = await pushAccountSaveNow(engine, saveMgr);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Nenhuma conta');
    expect(pushAccountSave).not.toHaveBeenCalled();
  });

  it('com conta conectada → envia o save com token, nome e o SLOT atual vinculado', async () => {
    vi.mocked(getSession).mockReturnValue(SESSION);
    vi.mocked(pushAccountSave).mockResolvedValue({ ok: true, savedAt: 1700000000000 });
    const { engine, saveMgr } = setup();

    const r = await pushAccountSaveNow(engine, saveMgr);
    expect(r.ok).toBe(true);
    expect(pushAccountSave).toHaveBeenCalledTimes(1);
    const [token, saveText, name, slot] = vi.mocked(pushAccountSave).mock.calls[0];
    expect(token).toBe(TOKEN);
    expect(saveText.startsWith('NC1.')).toBe(true);
    expect(name).toBe('Jogador Teste');
    expect(slot).toBe('slot1'); // vinculado ao slot atual
    expect(lastAccountSyncAt()).toBeGreaterThan(0);
  });

  it('pushAccountSaveNow: usa o slot escolhido na tela de Conta quando definido', async () => {
    vi.mocked(getSession).mockReturnValue(SESSION);
    vi.mocked(pushAccountSave).mockResolvedValue({ ok: true, savedAt: 1700000000000 });
    // preferência global de vínculo (exercitada ponta a ponta em accountSession.test.ts)
    vi.mocked(getAccountSlotPref).mockReturnValue('slot3');
    const { engine, saveMgr } = setup();
    saveMgr.setSlot('slot1'); // o jogo aberto está no slot1, mas o vínculo escolhido é slot3

    const r = await pushAccountSaveNow(engine, saveMgr);
    expect(r.ok).toBe(true);
    const [, , , slot] = vi.mocked(pushAccountSave).mock.calls[0];
    expect(slot).toBe('slot3');
    expect(slot).not.toBe(saveMgr.getSlot());
  });

  it('pushAccountSaveNow: sem preferência → usa o slot do jogo aberto', async () => {
    vi.mocked(getSession).mockReturnValue(SESSION);
    vi.mocked(pushAccountSave).mockResolvedValue({ ok: true, savedAt: 1700000000000 });
    vi.mocked(getAccountSlotPref).mockReturnValue('');
    const { engine, saveMgr } = setup();
    saveMgr.setSlot('slot2');

    const r = await pushAccountSaveNow(engine, saveMgr);
    expect(r.ok).toBe(true);
    const [, , , slot] = vi.mocked(pushAccountSave).mock.calls[0];
    expect(slot).toBe('slot2');
  });

  it('respeita o toggle de sincronização automática (Configurações)', async () => {
    vi.mocked(getSession).mockReturnValue({ username: 'jogador', email: 'jogador@gmail.com', verified: true, token: TOKEN });
    const { engine, saveMgr } = setup();
    engine.state.settings.cloudSyncEnabled = false;

    const r = await pushAccountSaveNow(engine, saveMgr);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('desativada');
    expect(pushAccountSave).not.toHaveBeenCalled();
  });

  // ── autoPushAccountSave (push automático espelho da nuvem — mantém a conta fresca) ──

  it('autoPushAccountSave: sem conta conectada → não envia nada', async () => {
    const { engine, saveMgr } = setup();
    const r = await autoPushAccountSave(engine, saveMgr);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('Nenhuma conta');
    expect(pushAccountSave).not.toHaveBeenCalled();
  });

  it('autoPushAccountSave: envia e respeita o throttle de 1 min', async () => {
    vi.mocked(getSession).mockReturnValue(SESSION);
    vi.mocked(pushAccountSave).mockResolvedValue({ ok: true, savedAt: Date.now() });
    const { engine, saveMgr } = setup();

    const r1 = await autoPushAccountSave(engine, saveMgr);
    expect(r1.ok).toBe(true);
    expect(pushAccountSave).toHaveBeenCalledTimes(1);

    // dentro do throttle → não envia de novo (ok:true, throttled)
    const r2 = await autoPushAccountSave(engine, saveMgr);
    expect(r2.ok).toBe(true);
    expect(r2.reason).toBe('throttled');
    expect(pushAccountSave).toHaveBeenCalledTimes(1);

    // com force → ignora o throttle e envia (usado ao fechar o jogo)
    const r3 = await autoPushAccountSave(engine, saveMgr, true);
    expect(r3.ok).toBe(true);
    expect(pushAccountSave).toHaveBeenCalledTimes(2);
  });

  it('autoPushAccountSave: falha do servidor não marca sincronização', async () => {
    vi.mocked(getSession).mockReturnValue(SESSION);
    vi.mocked(pushAccountSave).mockResolvedValue({ ok: false, reason: 'Servidor recusou (429)' });
    const { engine, saveMgr } = setup();

    const r = await autoPushAccountSave(engine, saveMgr);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Servidor recusou (429)');
    expect(lastAccountSyncAt()).toBe(0);
  });

  it('falha do servidor → propaga a razão sem derrubar o jogo', async () => {
    vi.mocked(getSession).mockReturnValue({ username: 'jogador', email: 'jogador@gmail.com', verified: true, token: TOKEN });
    vi.mocked(pushAccountSave).mockResolvedValue({ ok: false, reason: 'Servidor recusou (429)' });
    const { engine, saveMgr } = setup();

    const r = await pushAccountSaveNow(engine, saveMgr);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Servidor recusou (429)');
    expect(lastAccountSyncAt()).toBe(0); // falha não marca sincronização
  });

  it('o timer automático dispara a cada 1 hora', async () => {
    vi.useFakeTimers();
    vi.mocked(getSession).mockReturnValue({ username: 'jogador', email: 'jogador@gmail.com', verified: true, token: TOKEN });
    vi.mocked(pushAccountSave).mockResolvedValue({ ok: true, savedAt: Date.now() });
    const { engine, saveMgr } = setup();

    startAccountAutoSave(engine, saveMgr);
    expect(pushAccountSave).not.toHaveBeenCalled();

    // menos de 1 hora → nada
    await vi.advanceTimersByTimeAsync(ACCOUNT_SAVE_INTERVAL_MS - 1000);
    expect(pushAccountSave).not.toHaveBeenCalled();

    // cruza a 1 hora → envia
    await vi.advanceTimersByTimeAsync(1000);
    expect(pushAccountSave).toHaveBeenCalledTimes(1);

    // segunda hora → envia de novo
    await vi.advanceTimersByTimeAsync(ACCOUNT_SAVE_INTERVAL_MS);
    expect(pushAccountSave).toHaveBeenCalledTimes(2);

    stopAccountAutoSave();
    // parado → não dispara mais
    await vi.advanceTimersByTimeAsync(ACCOUNT_SAVE_INTERVAL_MS * 2);
    expect(pushAccountSave).toHaveBeenCalledTimes(2);
  });

  it('syncAccountOnLoad: sem sessão → no-session', async () => {
    const { engine, saveMgr } = setup();
    expect(await syncAccountOnLoad(saveMgr, engine)).toBe('no-session');
    expect(pullAccountSave).not.toHaveBeenCalled();
  });

  it('syncAccountOnLoad: respeita o toggle desativado', async () => {
    vi.mocked(getSession).mockReturnValue(SESSION);
    const { engine, saveMgr } = setup();
    engine.state.settings.cloudSyncEnabled = false;
    expect(await syncAccountOnLoad(saveMgr, engine)).toBe('disabled');
  });

  it('syncAccountOnLoad: save da conta de OUTRO slot → não restaura (noop)', async () => {
    stubLocalStorage({});
    vi.mocked(getSession).mockReturnValue(SESSION);
    vi.mocked(pullAccountSave).mockResolvedValue({
      ok: true,
      info: { saveText: 'NC1.xyz', name: 'X', savedAt: Date.now(), slot: 'slot2' },
    });
    const { engine, saveMgr } = setup();

    expect(await syncAccountOnLoad(saveMgr, engine)).toBe('noop');
    // nada foi escrito no slot1
    const metas = await saveMgr.listSlots();
    expect(metas.find((m) => m.slot === 'slot1')?.exists).toBe(false);
  });

  it('syncAccountOnLoad: restaura quando o slot bate e a conta é mais nova (com backup)', async () => {
    const store: Record<string, string> = {};
    stubLocalStorage(store);
    vi.mocked(getSession).mockReturnValue(SESSION);

    // save da conta: slot1, recente, nome 'Versão Conta'
    const cloud = new GameEngine();
    cloud.state.name = 'Versão Conta';
    vi.mocked(pullAccountSave).mockResolvedValue({
      ok: true,
      info: { saveText: craftSaveFile(cloud.state, Date.now()), name: 'Versão Conta', savedAt: Date.now(), slot: 'slot1' },
    });

    // slot local com save ANTIGO
    const local = new GameEngine();
    local.state.name = 'Versão Local';
    store['nc_slot1'] = craftSaveFile(local.state, Date.now() - 3_600_000);

    const { engine, saveMgr } = setup();
    const r = await syncAccountOnLoad(saveMgr, engine);
    expect(r).toBe('restored');

    const loaded = await saveMgr.load('slot1');
    expect(loaded).not.toBeNull();
    expect(loaded!.engine.state.name).toBe('Versão Conta');
  });

  it('syncAccountOnLoad: conta mais velha que o local → sobe o local (pushed, sem regredir)', async () => {
    const store: Record<string, string> = {};
    stubLocalStorage(store);
    vi.mocked(getSession).mockReturnValue(SESSION);
    vi.mocked(pushAccountSave).mockResolvedValue({ ok: true, savedAt: Date.now() });

    const cloud = new GameEngine();
    cloud.state.name = 'Conta Antiga';
    vi.mocked(pullAccountSave).mockResolvedValue({
      ok: true,
      info: { saveText: craftSaveFile(cloud.state, Date.now() - 3_600_000), name: 'Conta Antiga', savedAt: Date.now() - 3_600_000, slot: 'slot1' },
    });
    const local = new GameEngine();
    local.state.name = 'Local Novo';
    store['nc_slot1'] = craftSaveFile(local.state, Date.now());

    const { engine, saveMgr } = setup();
    expect(await syncAccountOnLoad(saveMgr, engine)).toBe('pushed');
    const loaded = await saveMgr.load('slot1');
    expect(loaded!.engine.state.name).toBe('Local Novo'); // não regride o local
  });

  it('syncAccountOnLoad: local mais novo que a conta → sobe o local (pushed) para o outro dispositivo', async () => {
    const store: Record<string, string> = {};
    stubLocalStorage(store);
    vi.mocked(getSession).mockReturnValue(SESSION);
    const cloud = new GameEngine();
    cloud.state.name = 'Conta Antiga';
    vi.mocked(pullAccountSave).mockResolvedValue({
      ok: true,
      info: { saveText: craftSaveFile(cloud.state, Date.now() - 3_600_000), name: 'Conta Antiga', savedAt: Date.now() - 3_600_000, slot: 'slot1' },
    });
    vi.mocked(pushAccountSave).mockResolvedValue({ ok: true, savedAt: Date.now() });
    const local = new GameEngine();
    local.state.name = 'Local Novo';
    store['nc_slot1'] = craftSaveFile(local.state, Date.now());

    const { engine, saveMgr } = setup();
    const r = await syncAccountOnLoad(saveMgr, engine);
    expect(r).toBe('pushed');
    expect(pushAccountSave).toHaveBeenCalledTimes(1);
  });

  it('syncAccountOnLoad: sem save na conta (404) → sobe o local como primeiro backup (pushed)', async () => {
    vi.mocked(getSession).mockReturnValue(SESSION);
    vi.mocked(pullAccountSave).mockResolvedValue({ ok: false, reason: 'Nenhum save na conta', status: 404 });
    vi.mocked(pushAccountSave).mockResolvedValue({ ok: true, savedAt: Date.now() });
    const { engine, saveMgr } = setup();

    const r = await syncAccountOnLoad(saveMgr, engine);
    expect(r).toBe('pushed');
    expect(pushAccountSave).toHaveBeenCalledTimes(1);
  });

  it('syncAccountOnLoad: falha de REDE no pull → NÃO sobe o local (protege o backup da conta)', async () => {
    vi.mocked(getSession).mockReturnValue(SESSION);
    vi.mocked(pullAccountSave).mockResolvedValue({ ok: false, reason: 'Sem conexão com o servidor' }); // sem status 404
    const { engine, saveMgr } = setup();

    const r = await syncAccountOnLoad(saveMgr, engine);
    expect(r).toBe('noop');
    expect(pushAccountSave).not.toHaveBeenCalled(); // nunca sobrescreve o backup por falha de rede
  });

  // ── checkAccountRestore (verificação SEM efeito — usada para pedir confirmação) ──

  it('checkAccountRestore: sem sessão → no-session (não toca no servidor)', async () => {
    const { engine, saveMgr } = setup();
    const check = await checkAccountRestore(saveMgr, engine);
    expect(check).toEqual({ pending: false, reason: 'no-session' });
    expect(pullAccountSave).not.toHaveBeenCalled();
  });

  it('checkAccountRestore: conta mais nova no slot → pending com candidato (SEM alterar nada)', async () => {
    const store: Record<string, string> = {};
    stubLocalStorage(store);
    vi.mocked(getSession).mockReturnValue(SESSION);

    const cloud = new GameEngine();
    cloud.state.name = 'Versão Conta';
    vi.mocked(pullAccountSave).mockResolvedValue({
      ok: true,
      info: { saveText: craftSaveFile(cloud.state, Date.now()), name: 'Versão Conta', savedAt: Date.now(), slot: 'slot1' },
    });
    const local = new GameEngine();
    local.state.name = 'Versão Local';
    store['nc_slot1'] = craftSaveFile(local.state, Date.now() - 3_600_000);

    const { engine, saveMgr } = setup();
    const check = await checkAccountRestore(saveMgr, engine);
    expect(check.pending).toBe(true);
    if (!check.pending) return;
    expect(check.info.slot).toBe('slot1');
    expect(check.info.name).toBe('Versão Conta');
    expect(check.info.localSavedAt).toBeGreaterThan(0);
    expect(check.info.saveText.startsWith('NC1.')).toBe(true);

    // NADA foi alterado: o slot local continua com a versão local
    const loaded = await saveMgr.load('slot1');
    expect(loaded!.engine.state.name).toBe('Versão Local');
  });

  it('checkAccountRestore: local significativamente mais novo → local-newer (sobe, não restaura)', async () => {
    const store: Record<string, string> = {};
    stubLocalStorage(store);
    vi.mocked(getSession).mockReturnValue(SESSION);
    const cloud = new GameEngine();
    cloud.state.name = 'Conta Antiga';
    vi.mocked(pullAccountSave).mockResolvedValue({
      ok: true,
      info: { saveText: craftSaveFile(cloud.state, Date.now() - 3_600_000), name: 'Conta Antiga', savedAt: Date.now() - 3_600_000, slot: 'slot1' },
    });
    const local = new GameEngine();
    local.state.name = 'Local Novo';
    store['nc_slot1'] = craftSaveFile(local.state, Date.now());

    const { engine, saveMgr } = setup();
    expect(await checkAccountRestore(saveMgr, engine)).toEqual({ pending: false, reason: 'local-newer' });
  });

  it('checkAccountRestore: timestamps dentro da margem → not-newer (não faz nada)', async () => {
    const store: Record<string, string> = {};
    stubLocalStorage(store);
    vi.mocked(getSession).mockReturnValue(SESSION);
    const cloud = new GameEngine();
    cloud.state.name = 'Conta';
    vi.mocked(pullAccountSave).mockResolvedValue({
      ok: true,
      info: { saveText: craftSaveFile(cloud.state, Date.now() - 45_000), name: 'Conta', savedAt: Date.now() - 45_000, slot: 'slot1' },
    });
    const local = new GameEngine();
    local.state.name = 'Local';
    store['nc_slot1'] = craftSaveFile(local.state, Date.now() - 10_000);

    const { engine, saveMgr } = setup();
    expect(await checkAccountRestore(saveMgr, engine)).toEqual({ pending: false, reason: 'not-newer' });
  });

  it('checkAccountRestore: save de OUTRO slot → other-slot', async () => {
    stubLocalStorage({});
    vi.mocked(getSession).mockReturnValue(SESSION);
    vi.mocked(pullAccountSave).mockResolvedValue({
      ok: true,
      info: { saveText: 'NC1.xyz', name: 'X', savedAt: Date.now(), slot: 'slot2' },
    });
    const { engine, saveMgr } = setup();
    expect(await checkAccountRestore(saveMgr, engine)).toEqual({ pending: false, reason: 'other-slot' });
  });

  it('checkAccountRestore: sem save na conta (404) → no-save (primeiro backup, sem confirmação)', async () => {
    vi.mocked(getSession).mockReturnValue(SESSION);
    vi.mocked(pullAccountSave).mockResolvedValue({ ok: false, reason: 'Nenhum save na conta', status: 404 });
    const { engine, saveMgr } = setup();
    expect(await checkAccountRestore(saveMgr, engine)).toEqual({ pending: false, reason: 'no-save' });
  });

  it('checkAccountRestore: falha de REDE no pull → network (nunca vira candidato)', async () => {
    vi.mocked(getSession).mockReturnValue(SESSION);
    vi.mocked(pullAccountSave).mockResolvedValue({ ok: false, reason: 'Sem conexão com o servidor' });
    const { engine, saveMgr } = setup();
    expect(await checkAccountRestore(saveMgr, engine)).toEqual({ pending: false, reason: 'network' });
  });

  // ── applyAccountRestore (aplica a restauração CONFIRMADA) ──

  it('applyAccountRestore: backup do local + import do save da conta no slot', async () => {
    const store: Record<string, string> = {};
    stubLocalStorage(store);
    vi.mocked(getSession).mockReturnValue(SESSION);

    const cloud = new GameEngine();
    cloud.state.name = 'Versão Conta';
    const local = new GameEngine();
    local.state.name = 'Versão Local';
    store['nc_slot1'] = craftSaveFile(local.state, Date.now() - 3_600_000);

    const { engine, saveMgr } = setup();
    const ok = await applyAccountRestore(saveMgr, engine, {
      slot: 'slot1',
      name: 'Versão Conta',
      savedAt: Date.now(),
      localSavedAt: Date.now() - 3_600_000,
      saveText: craftSaveFile(cloud.state, Date.now()),
    });
    expect(ok).toBe(true);

    const loaded = await saveMgr.load('slot1');
    expect(loaded!.engine.state.name).toBe('Versão Conta');
  });

  it('getNextAccountSyncAt: 0 sem timer, agendado ao iniciar, re-agendado a cada hora, 0 ao parar', async () => {
    vi.useFakeTimers();
    vi.mocked(getSession).mockReturnValue({ username: 'jogador', email: 'jogador@gmail.com', verified: true, token: TOKEN });
    vi.mocked(pushAccountSave).mockResolvedValue({ ok: true, savedAt: Date.now() });
    const { engine, saveMgr } = setup();

    // sem timer ativo → 0 (a TopBar esconde o countdown)
    expect(getNextAccountSyncAt()).toBe(0);

    startAccountAutoSave(engine, saveMgr);
    // agendado para daqui a 1 hora
    expect(getNextAccountSyncAt() - Date.now()).toBe(ACCOUNT_SAVE_INTERVAL_MS);

    // cruza a 1 hora → envia e RE-agenda o próximo
    await vi.advanceTimersByTimeAsync(ACCOUNT_SAVE_INTERVAL_MS);
    expect(pushAccountSave).toHaveBeenCalledTimes(1);
    expect(getNextAccountSyncAt() - Date.now()).toBe(ACCOUNT_SAVE_INTERVAL_MS);

    stopAccountAutoSave();
    expect(getNextAccountSyncAt()).toBe(0);

    // reset também zera
    startAccountAutoSave(engine, saveMgr);
    expect(getNextAccountSyncAt()).toBeGreaterThan(0);
    resetAccountSyncState();
    expect(getNextAccountSyncAt()).toBe(0);
  });
});
