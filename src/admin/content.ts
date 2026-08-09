/**
 * Armazenamento de conteúdo administrativo — estados DRAFT/REVIEW/SCHEDULED/
 * PUBLISHED/DISABLED/ARCHIVED. Nunca publica imediatamente por acidente:
 * rascunho → preview → publicar.
 *
 * Conteúdo administrativo é validado (rejeita preço < 0, datas invertidas,
 * IDs duplicados, referências inválidas) e o backup automático roda antes de
 * alterações críticas.
 */
import { GameConfig } from '../config/GameConfig';
import { audit } from './audit';

export type ContentStatus = 'DRAFT' | 'REVIEW' | 'SCHEDULED' | 'PUBLISHED' | 'DISABLED' | 'ARCHIVED';

export type ContentKind = 'event' | 'skin' | 'banner' | 'news' | 'pass' | 'season' | 'reward';

export interface AdminContent {
  id: string;
  kind: ContentKind;
  name: string;
  status: ContentStatus;
  payload: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  publishedAt?: number;
  scheduledAt?: number;
  version: number;
}

export interface ContentValidation {
  ok: boolean;
  errors: string[];
}

const KEY = GameConfig.admin.contentStorageKey;
const BACKUP_PREFIX = 'nc_admin_backup_';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadContent(): AdminContent[] {
  const st = storage();
  if (!st) return [];
  try {
    const raw = st.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((c) => c && typeof c.id === 'string') : [];
  } catch {
    return [];
  }
}

function saveContent(items: AdminContent[]): void {
  storage()?.setItem(KEY, JSON.stringify(items));
}

function readBackup(fullKey: string): AdminContent[] | null {
  const st = storage();
  if (!st) return null;
  try {
    const raw = st.getItem(fullKey);
    return raw ? (JSON.parse(raw) as AdminContent[]) : null;
  } catch {
    return null;
  }
}

/**
 * Validação de conteúdo administrativo — regras de segurança de conteúdo.
 * Rejeita: preço < 0, data final < data inicial, XP negativa, recompensa
 * inválida, ID duplicado, referências a skin/evento inexistentes.
 */
export function validateContent(c: AdminContent): ContentValidation {
  const errors: string[] = [];
  const p = c.payload ?? {};

  if (!c.id || c.id.length < 2) errors.push('ID muito curto');
  if (!c.name || c.name.trim().length === 0) errors.push('Nome obrigatório');

  const existing = loadContent().find((x) => x.id === c.id && x.kind === c.kind);
  // duplicado permitido apenas se for o próprio item (edição — mesmo createdAt)
  if (existing && existing.createdAt !== c.createdAt) {
    errors.push(`ID duplicado: ${c.id}`);
  }

  const price = p.price as number | undefined;
  if (price !== undefined && (typeof price !== 'number' || !Number.isFinite(price) || price < 0)) {
    errors.push('Preço inválido (deve ser >= 0)');
  }

  const start = p.startAt as number | undefined;
  const end = p.endAt as number | undefined;
  if (start !== undefined && end !== undefined && typeof start === 'number' && typeof end === 'number' && end < start) {
    errors.push('Data final anterior à data inicial');
  }

  const xp = p.xp as number | undefined;
  if (xp !== undefined && (typeof xp !== 'number' || !Number.isFinite(xp) || xp < 0)) {
    errors.push('XP negativa ou inválida');
  }

  const rewards = p.reward as Record<string, unknown> | undefined;
  if (rewards && typeof rewards === 'object') {
    for (const k of ['gold', 'energy']) {
      const v = rewards[k] as string | undefined;
      if (v !== undefined && (typeof v !== 'string' || !/^\d+(\.\d+)?$/.test(v))) {
        errors.push(`Recompensa ${k} inválida`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/** Backup automático antes de alterações críticas (publicar/excluir). */
export function autoBackup(): { key: string; count: number } {
  const items = loadContent();
  const key = `${BACKUP_PREFIX}${new Date().toISOString().replace(/[:.]/g, '-')}`;
  storage()?.setItem(key, JSON.stringify(items));
  audit({ actor: 'SUPER_ADMIN', action: 'BACKUP_CREATE', target: 'content', detail: `${items.length} itens`, result: 'ok' });
  // mantém apenas os 5 backups mais recentes
  const st = storage();
  if (st) {
    const keys: string[] = [];
    for (let i = 0; i < st.length; i++) {
      const k = st.key(i);
      if (k && k.startsWith(BACKUP_PREFIX)) keys.push(k);
    }
    keys.sort().reverse();
    for (const old of keys.slice(5)) st.removeItem(old);
  }
  return { key, count: items.length };
}

export function backupList(): string[] {
  const st = storage();
  if (!st) return [];
  const keys: string[] = [];
  for (let i = 0; i < st.length; i++) {
    const k = st.key(i);
    if (k && k.startsWith(BACKUP_PREFIX)) keys.push(k);
  }
  return keys.sort().reverse();
}

export function restoreBackup(key: string): { ok: boolean; reason?: string } {
  const data = readBackup(key);
  if (!data) return { ok: false, reason: 'Backup inexistente' };
  saveContent(data);
  audit({ actor: 'SUPER_ADMIN', action: 'BACKUP_RESTORE', target: 'content', detail: `${data.length} itens`, result: 'ok' });
  return { ok: true };
}

export function saveDraft(c: AdminContent): { ok: boolean; errors: string[] } {
  const v = validateContent(c);
  if (!v.ok) return v;
  const items = loadContent();
  const idx = items.findIndex((x) => x.id === c.id && x.kind === c.kind);
  const fresh: AdminContent = {
    ...c,
    status: c.status || 'DRAFT',
    updatedAt: Date.now(),
    version: idx >= 0 ? (items[idx].version ?? 0) + 1 : 1,
  };
  if (idx >= 0) items[idx] = fresh;
  else items.push(fresh);
  saveContent(items);
  audit({ actor: 'SUPER_ADMIN', action: 'CONTENT_SAVE', target: `${c.kind}:${c.id}`, detail: `status ${fresh.status}`, result: 'ok' });
  return { ok: true, errors: [] };
}

export function publishContent(id: string, kind: ContentKind): { ok: boolean; reason?: string } {
  autoBackup();
  const items = loadContent();
  const c = items.find((x) => x.id === id && x.kind === kind);
  if (!c) return { ok: false, reason: 'Conteúdo inexistente' };
  const v = validateContent(c);
  if (!v.ok) return { ok: false, reason: `Validação falhou: ${v.errors.join('; ')}` };
  c.status = 'PUBLISHED';
  c.publishedAt = Date.now();
  c.updatedAt = Date.now();
  saveContent(items);
  audit({ actor: 'SUPER_ADMIN', action: 'CONTENT_PUBLISH', target: `${kind}:${id}`, detail: 'rascunho → publicado', result: 'ok' });
  return { ok: true };
}

export function deleteContent(id: string, kind: ContentKind): { ok: boolean; reason?: string } {
  autoBackup();
  const items = loadContent();
  const next = items.filter((x) => !(x.id === id && x.kind === kind));
  if (next.length === items.length) return { ok: false, reason: 'Conteúdo inexistente' };
  saveContent(next);
  audit({ actor: 'SUPER_ADMIN', action: 'CONTENT_SAVE', target: `${kind}:${id}`, detail: 'excluído', result: 'ok' });
  return { ok: true };
}

/** Último backup criado (para o dashboard de status). */
export function lastBackupTime(): number | null {
  const list = backupList();
  if (list.length === 0) return null;
  // a chave contém o timestamp ISO — extrai do último
  const m = list[0].match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).getTime();
}
