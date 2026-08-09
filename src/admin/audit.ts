/**
 * Auditoria e log de segurança do Admin Control Center.
 *
 * Toda ação administrativa gera um registro (quem, quando, o quê, antes, depois).
 * Logs são mantidos no localStorage com rotação (nunca crescem sem limite).
 */
import { GameConfig } from '../config/GameConfig';

export type AuditAction =
  | 'LOGIN_ADMIN' | 'LOGOUT_ADMIN' | 'LOGIN_FAILED' | 'PERMISSION_DENIED'
  | 'SAVE_EDIT' | 'REWARD_GRANT' | 'ITEM_GRANT' | 'ITEM_REMOVE'
  | 'EVENT_PUBLISH' | 'SKIN_PUBLISH' | 'PASS_EDIT'
  | 'CONTENT_SAVE' | 'CONTENT_PUBLISH' | 'BACKUP_CREATE' | 'BACKUP_RESTORE';

export interface AuditEntry {
  at: number; // timestamp ms
  actor: string; // papel/usuário
  action: AuditAction;
  target: string; // objeto afetado
  detail: string; // antes → depois
  result: 'ok' | 'denied' | 'error';
}

const AUDIT_KEY = GameConfig.admin.auditStorageKey;
const SECURITY_KEY = GameConfig.admin.securityStorageKey;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function read<T>(key: string): T[] {
  const st = storage();
  if (!st) return [];
  try {
    const raw = st.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, arr: T[], max: number): void {
  storage()?.setItem(key, JSON.stringify(arr.slice(-max)));
}

export function audit(entry: Omit<AuditEntry, 'at'>): void {
  const arr = read<AuditEntry>(AUDIT_KEY);
  arr.push({ ...entry, at: Date.now() });
  write(AUDIT_KEY, arr, GameConfig.admin.maxAuditEntries);
}

export function securityLog(action: AuditAction, detail: string, actor = 'local'): void {
  const arr = read<AuditEntry>(SECURITY_KEY);
  arr.push({ at: Date.now(), actor, action, target: 'security', detail, result: 'ok' });
  write(SECURITY_KEY, arr, GameConfig.admin.maxSecurityEntries);
}

export function auditLog(): AuditEntry[] {
  return read<AuditEntry>(AUDIT_KEY).reverse();
}

export function securityLogEntries(): AuditEntry[] {
  return read<AuditEntry>(SECURITY_KEY).reverse();
}

export function clearAuditLogs(): void {
  storage()?.removeItem(AUDIT_KEY);
  storage()?.removeItem(SECURITY_KEY);
}

export function formatAudit(e: AuditEntry): string {
  const d = new Date(e.at);
  const time = d.toLocaleString('pt-BR');
  return `[${time}] ${e.actor} · ${e.action} · ${e.target}${e.detail ? ` · ${e.detail}` : ''}`;
}
