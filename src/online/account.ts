/**
 * Conta — cliente do sistema de contas do servidor (server/accounts.js).
 *
 * Fluxos: registro (envia código de confirmação por e-mail), verificação
 * (código → e-mail de agradecimento), login (gera token de sessão), logout,
 * recuperação de senha (código de recuperação → redefinição) e save da conta
 * (o jogo envia o save automaticamente a cada 1 hora quando conectado).
 *
 * A sessão (token + dados) fica no localStorage — o servidor é quem valida o
 * token a cada requisição. Sem sessão, nada é enviado.
 */
import { apiFetch, apiJson } from './api';
import { GameConfig } from '../config/GameConfig';
import { SAVE_SLOTS, type SaveSlot } from '../save/saveManager';

export interface AccountSession {
  username: string;
  email: string;
  verified: boolean;
  token: string;
}

export interface AccountInfo {
  username: string;
  email: string;
  verified: boolean;
  createdAt?: number;
  hasSave?: boolean;
  saveName?: string;
  saveSavedAt?: number;
  /** Slot de save vinculado ao save guardado na conta (slot1|slot2|slot3). */
  saveSlot?: string;
}

export type AccountResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; reason: string; status?: number };

const SESSION_KEY = GameConfig.account.sessionStorageKey;
const SLOT_PREF_KEY = GameConfig.account.slotStorageKey;

/** Assinantes de mudanças de sessão (para a UI re-renderizar ao logar/sair). */
const sessionListeners = new Set<() => void>();
/** Snapshot estável da sessão para useSyncExternalStore (undefined = ainda não lido). */
let sessionSnapshot: AccountSession | null | undefined;

function notifySessionChanged(): void {
  sessionListeners.forEach((fn) => fn());
}

/** Assina mudanças de sessão (login/logout). Retorna a função que cancela. */
export function subscribeAccountSession(fn: () => void): () => void {
  sessionListeners.add(fn);
  return () => {
    sessionListeners.delete(fn);
  };
}

/** Snapshot da sessão com referência ESTÁVEL (para useSyncExternalStore). */
export function getSessionSnapshot(): AccountSession | null {
  if (sessionSnapshot === undefined) sessionSnapshot = getSession();
  return sessionSnapshot;
}

/** Zera listeners + snapshot (testes — isolamento entre execuções). */
export function resetAccountSessionState(): void {
  sessionListeners.clear();
  sessionSnapshot = undefined;
}

/**
 * Slot escolhido para vincular o save da conta ('slot1'|'slot2'|'slot3' ou '').
 * '' = automático → usa o slot do jogo aberto no momento do envio.
 */
export function getAccountSlotPref(): SaveSlot | '' {
  try {
    const v = localStorage.getItem(SLOT_PREF_KEY);
    return SAVE_SLOTS.includes(v as SaveSlot) ? (v as SaveSlot) : '';
  } catch {
    return '';
  }
}

/** Define o slot escolhido para vincular o save da conta ('' = automático). */
export function setAccountSlotPref(slot: SaveSlot | ''): void {
  try {
    if (slot) localStorage.setItem(SLOT_PREF_KEY, slot);
    else localStorage.removeItem(SLOT_PREF_KEY);
  } catch {
    // armazenamento indisponível — a preferência apenas não persiste
  }
}

/**
 * Re-vincula o save guardado na conta a outro slot (sem reenviar o save).
 * `slot` vazio = automático (segue o slot do jogo aberto no envio).
 */
export async function linkAccountSlot(token: string, slot: SaveSlot | ''): Promise<AccountResult<{ saveSlot?: string }>> {
  try {
    const res = await apiFetch('/api/account/link-slot', {
      method: 'POST',
      headers: { 'x-account-token': token },
      body: JSON.stringify({ slot }),
    });
    const data = await apiJson<{ ok?: boolean; reason?: string; saveSlot?: string }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})`, status: res.status };
    return { ok: true, saveSlot: data.saveSlot ?? '' };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

function readStorage(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null;
  } catch {
    return null;
  }
}

function writeStorage(value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, value);
  } catch {
    // armazenamento indisponível — a sessão apenas não persiste entre sessões
  }
}

/** Sessão salva (ou null). Não valida com o servidor — só lê o cache local. */
export function getSession(): AccountSession | null {
  const raw = readStorage();
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as AccountSession;
    if (typeof s.token === 'string' && s.token.length === 64 && typeof s.username === 'string') return s;
    return null;
  } catch {
    return null;
  }
}

export function setSession(s: AccountSession): void {
  sessionSnapshot = s;
  writeStorage(JSON.stringify(s));
  notifySessionChanged();
}

export function clearSession(): void {
  sessionSnapshot = null;
  writeStorage(null);
  notifySessionChanged();
}

/** Há uma conta conectada nesta máquina? */
export function isLoggedIn(): boolean {
  return getSession() !== null;
}

export async function registerAccount(input: {
  username: string;
  email: string;
  password: string;
}): Promise<AccountResult<{ username: string; email: string; devCode?: string }>> {
  try {
    const res = await apiFetch('/api/account/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const data = await apiJson<{ ok?: boolean; reason?: string; username?: string; email?: string; devCode?: string }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})` };
    return { ok: true, username: data.username ?? input.username, email: data.email ?? input.email, ...(data.devCode ? { devCode: data.devCode } : {}) };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

export async function verifyAccount(email: string, code: string): Promise<AccountResult<AccountInfo>> {
  try {
    const res = await apiFetch('/api/account/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
    const data = await apiJson<{ ok?: boolean; reason?: string; username?: string; email?: string; verified?: boolean }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})` };
    return { ok: true, username: data.username ?? '', email: data.email ?? email, verified: data.verified === true };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

export async function resendVerification(email: string): Promise<AccountResult<{ devCode?: string }>> {
  try {
    const res = await apiFetch('/api/account/resend', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    const data = await apiJson<{ ok?: boolean; reason?: string; devCode?: string }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})` };
    return { ok: true, ...(data.devCode ? { devCode: data.devCode } : {}) };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

export async function loginAccount(
  login: string,
  password: string,
): Promise<AccountResult<AccountInfo & { token: string }>> {
  try {
    const res = await apiFetch('/api/account/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    });
    const data = await apiJson<{
      ok?: boolean;
      reason?: string;
      token?: string;
      username?: string;
      email?: string;
      verified?: boolean;
      hasSave?: boolean;
      saveName?: string;
      saveSavedAt?: number;
      saveSlot?: string;
    }>(res);
    if (!res.ok || data?.ok !== true || typeof data.token !== 'string') {
      return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})` };
    }
    return {
      ok: true,
      token: data.token,
      username: data.username ?? '',
      email: data.email ?? '',
      verified: data.verified === true,
      hasSave: data.hasSave === true,
      saveName: data.saveName ?? '',
      saveSavedAt: data.saveSavedAt ?? 0,
      saveSlot: data.saveSlot ?? '',
    };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

export async function logoutAccount(token: string): Promise<void> {
  try {
    await apiFetch('/api/account/logout', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  } catch {
    // logout é best-effort — a sessão local some de qualquer forma
  }
}

/** Troca a senha estando logado (exige a senha atual + o token de sessão). */
export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<AccountResult> {
  try {
    const res = await apiFetch('/api/account/change-password', {
      method: 'POST',
      headers: { 'x-account-token': token },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await apiJson<{ ok?: boolean; reason?: string }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})`, status: res.status };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

export async function requestRecovery(email: string): Promise<AccountResult<{ devCode?: string }>> {
  try {
    const res = await apiFetch('/api/account/recover', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    const data = await apiJson<{ ok?: boolean; reason?: string; devCode?: string }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})` };
    return { ok: true, ...(data.devCode ? { devCode: data.devCode } : {}) };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

export async function resetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<AccountResult> {
  try {
    const res = await apiFetch('/api/account/reset', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword }),
    });
    const data = await apiJson<{ ok?: boolean; reason?: string }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})` };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

/** Valida a sessão local no servidor e devolve os dados atualizados da conta. */
export async function fetchAccountMe(token: string): Promise<AccountResult<AccountInfo>> {
  try {
    const res = await apiFetch('/api/account/me', {
      headers: { 'x-account-token': token },
    });
    const data = await apiJson<{
      ok?: boolean;
      reason?: string;
      username?: string;
      email?: string;
      verified?: boolean;
      hasSave?: boolean;
      saveName?: string;
      saveSavedAt?: number;
      saveSlot?: string;
    }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})`, status: res.status };
    return {
      ok: true,
      username: data.username ?? '',
      email: data.email ?? '',
      verified: data.verified === true,
      hasSave: data.hasSave === true,
      saveName: data.saveName ?? '',
      saveSavedAt: data.saveSavedAt ?? 0,
      saveSlot: data.saveSlot ?? '',
    };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

export interface AccountSaveInfo {
  saveText: string;
  name: string;
  savedAt: number;
  /** Slot de save de onde o save da conta veio ('' = não vinculado). */
  slot: string;
}

/** Envia o save atual para a conta (chamado pelo auto-save de 1h e manualmente). */
export async function pushAccountSave(
  token: string,
  saveText: string,
  name: string,
  slot: string,
): Promise<AccountResult<{ savedAt?: number }>> {
  try {
    const body = JSON.stringify({ saveText, name: name.slice(0, 40), savedAt: Date.now(), slot: slot.slice(0, 10) });
    const res = await apiFetch('/api/account/save', {
      method: 'PUT',
      headers: { 'x-account-token': token },
      body,
      // keepalive só para corpos pequenos (limite do navegador: 64KB): permite que o
      // push final ao FECHAR a aba do site complete mesmo com a página sendo destruída
      // (a conta fica fresca para o app — sync bidirecional app ↔ site)
      ...(new Blob([body]).size <= 64 * 1024 ? { keepalive: true } : {}),
    });
    const data = await apiJson<{ ok?: boolean; savedAt?: number; reason?: string }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})` };
    return { ok: true, savedAt: data.savedAt };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

/** Baixa o save guardado na conta (para restaurar em outro computador). */
export async function pullAccountSave(token: string): Promise<AccountResult<{ info: AccountSaveInfo }>> {
  try {
    const res = await apiFetch('/api/account/save', {
      headers: { 'x-account-token': token },
    });
    const data = await apiJson<{ ok?: boolean; saveText?: string; name?: string; savedAt?: number; slot?: string; reason?: string }>(res);
    if (!res.ok || data?.ok !== true || typeof data.saveText !== 'string') {
      return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})`, status: res.status };
    }
    return { ok: true, info: { saveText: data.saveText, name: data.name ?? '', savedAt: data.savedAt ?? 0, slot: data.slot ?? '' } };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}
