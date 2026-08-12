/**
 * Testes do store reativo da sessão da conta — o snapshot estável consumido
 * pela TopBar via useSyncExternalStore (mesmo padrão de src/online/status.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSession, setSession, clearSession, getSessionSnapshot,
  subscribeAccountSession, resetAccountSessionState,
  getAccountSlotPref, setAccountSlotPref,
  type AccountSession,
} from '../src/online/account';

function stubLocalStorage(store: Record<string, string>) {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
  });
}

const SESSION: AccountSession = { username: 'jogador', email: 'jogador@gmail.com', verified: true, token: 'a'.repeat(64) };

describe('Sessão da conta — store reativo (getSessionSnapshot/subscribe)', () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    stubLocalStorage(store);
    resetAccountSessionState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetAccountSessionState();
  });

  it('snapshot começa null e reflete set/clear com referência estável', () => {
    expect(getSessionSnapshot()).toBeNull();

    setSession(SESSION);
    const snap1 = getSessionSnapshot();
    expect(snap1?.username).toBe('jogador');
    // referência ESTÁVEL: chamadas seguidas devolvem o mesmo objeto (useSyncExternalStore)
    expect(getSessionSnapshot()).toBe(snap1);

    clearSession();
    expect(getSessionSnapshot()).toBeNull();
  });

  it('getSession lê do localStorage (persistência) e o snapshot acompanha', () => {
    setSession(SESSION);
    expect(getSession()).toEqual(SESSION);
    expect(getSessionSnapshot()).toEqual(SESSION);
  });

  it('subscribeAccountSession notifica em login/logout e o unsubscribe para de notificar', () => {
    const seen: (AccountSession | null)[] = [];
    const off = subscribeAccountSession(() => seen.push(getSessionSnapshot()));

    setSession(SESSION);
    clearSession();
    expect(seen).toEqual([SESSION, null]);

    off();
    setSession(SESSION);
    expect(seen.length).toBe(2); // sem notificação após unsubscribe
  });

  it('preferência de slot de vínculo: set/get persistem e valores inválidos caem em automático (\'\')', () => {
    // inicia vazia → automático
    expect(getAccountSlotPref()).toBe('');

    setAccountSlotPref('slot2');
    expect(getAccountSlotPref()).toBe('slot2');

    setAccountSlotPref('slot1');
    expect(getAccountSlotPref()).toBe('slot1');

    setAccountSlotPref('');
    expect(getAccountSlotPref()).toBe('');

    // valor corrompido no storage → tratado como automático
    store['nc_account_slot_v1'] = 'slot9';
    expect(getAccountSlotPref()).toBe('');
  });

  it('resetAccountSessionState limpa listeners e invalida o snapshot (relê do storage)', () => {
    setSession(SESSION);
    const off = subscribeAccountSession(() => { /* noop */ });

    resetAccountSessionState();
    // snapshot inválido → a próxima leitura RELÊ o storage (a sessão ainda está lá)
    expect(getSessionSnapshot()).toEqual(SESSION);

    clearSession();
    resetAccountSessionState();
    // storage vazio → relê como null
    expect(getSessionSnapshot()).toBeNull();

    // listeners zerados → setSession não quebra (e volta a ter sessão)
    off();
    setSession(SESSION);
    expect(getSessionSnapshot()).toEqual(SESSION);
  });
});
