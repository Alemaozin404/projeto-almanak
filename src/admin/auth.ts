/**
 * Autenticação local do Admin Control Center.
 *
 * ⚠ Nenhuma senha/token/credencial é embutida no código.
 * O PIN é definido pelo jogador na primeira configuração e guardado apenas
 * como hash + sal no localStorage (separado do save do jogo).
 *
 * Para uma versão online, este módulo seria substituído por autenticação
 * real no servidor. Nunca armazene dados sensíveis no cliente.
 */
import { GameConfig } from '../config/GameConfig';
import { hashPin, randomSalt, verifyPin, isValidPin, type StoredPin } from '../security/hash';

export interface AdminSession {
  role: string; // papel simulado (o PIN local define SUPER_ADMIN)
  loginAt: number;
  source: 'local';
}

const PIN_KEY = GameConfig.admin.pinStorageKey;
const SESSION_KEY = GameConfig.admin.sessionStorageKey;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readStoredPin(): StoredPin | null {
  const st = storage();
  if (!st) return null;
  try {
    const raw = st.getItem(PIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPin;
    if (!parsed || typeof parsed.salt !== 'string' || typeof parsed.hash !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasAdminPin(): boolean {
  return readStoredPin() !== null;
}

/** Define o PIN do administrador (primeira configuração). */
export function setupAdminPin(pin: string): { ok: boolean; reason?: string } {
  if (!isValidPin(pin)) return { ok: false, reason: 'PIN deve ter entre 4 e 64 caracteres' };
  if (hasAdminPin()) return { ok: false, reason: 'PIN já configurado' };
  const salt = randomSalt();
  const stored: StoredPin = { salt, hash: hashPin(pin, salt), createdAt: Date.now() };
  storage()?.setItem(PIN_KEY, JSON.stringify(stored));
  return { ok: true };
}

/** Altera o PIN (exige o PIN atual). */
export function changeAdminPin(current: string, next: string): { ok: boolean; reason?: string } {
  if (!isValidPin(next)) return { ok: false, reason: 'PIN deve ter entre 4 e 64 caracteres' };
  const stored = readStoredPin();
  if (!verifyPin(stored, current)) return { ok: false, reason: 'PIN atual incorreto' };
  const salt = randomSalt();
  const fresh: StoredPin = { salt, hash: hashPin(next, salt), createdAt: Date.now() };
  storage()?.setItem(PIN_KEY, JSON.stringify(fresh));
  return { ok: true };
}

export function loginAdmin(pin: string): { ok: boolean; reason?: string } {
  const stored = readStoredPin();
  if (!verifyPin(stored, pin)) return { ok: false, reason: 'PIN incorreto' };
  const session: AdminSession = { role: 'SUPER_ADMIN', loginAt: Date.now(), source: 'local' };
  storage()?.setItem(SESSION_KEY, JSON.stringify(session));
  return { ok: true };
}

export function logoutAdmin(): void {
  storage()?.removeItem(SESSION_KEY);
}

export function adminSession(): AdminSession | null {
  const st = storage();
  if (!st) return null;
  try {
    const raw = st.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as AdminSession;
    if (!s || typeof s.loginAt !== 'number') return null;
    // sessão expira após 12h de inatividade do app (local)
    if (Date.now() - s.loginAt > 12 * 3600 * 1000) {
      st.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function isAdminLoggedIn(): boolean {
  return adminSession() !== null;
}
