/**
 * Cliente da API online — fala com o mesmo backend do Pix (server/ no Vercel).
 * Cobre: conteúdo online (RemoteContent), save na nuvem e ranking global.
 *
 * Todas as rotas que ESCREVEM dados exigem o header `x-app-secret`
 * (GameConfig.wallet.appSharedSecret) — a mesma proteção leve usada no Pix.
 */
import { pixBackendUrl, pixOnlineEnabled } from '../wallet/mp';
import { GameConfig } from '../config/GameConfig';

/** O backend online está configurado? (URL definida em GameConfig/localStorage). */
export const onlineEnabled = pixOnlineEnabled;

/** URL base do servidor (sem barra final). */
export function serverUrl(): string {
  return pixBackendUrl();
}

/** fetch com segredo compartilhado + JSON. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${serverUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-app-secret': GameConfig.wallet.appSharedSecret,
      ...(init.headers ?? {}),
    },
  });
}

/** JSON parse seguro (null em resposta não-JSON). */
export async function apiJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface RankEntry {
  playerId: string;
  name: string;
  kind: 'prestige' | 'ascension' | 'transcendence';
  gain: string;
  count: number;
  at: number;
}

/** Baixa o ranking global de um tipo de ciclo. */
export async function fetchGlobalRank(kind: RankEntry['kind'], limit = 10): Promise<RankEntry[]> {
  try {
    const res = await fetch(`${serverUrl()}/api/rank?kind=${encodeURIComponent(kind)}&limit=${limit}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; list?: RankEntry[] };
    return Array.isArray(data.list) ? data.list.slice(0, limit) : [];
  } catch {
    return [];
  }
}

/** Publica um ciclo no ranking global. Retorna a posição (ou null). */
export async function submitGlobalRank(entry: Omit<RankEntry, 'at'> & { at?: number }): Promise<{ ok: boolean; position?: number | null; reason?: string }> {
  try {
    const res = await apiFetch('/api/rank', {
      method: 'POST',
      body: JSON.stringify({ ...entry, at: entry.at ?? Date.now() }),
    });
    const data = await apiJson<{ ok?: boolean; position?: number | null; reason?: string }>(res);
    return { ok: data?.ok === true, position: data?.position, reason: data?.reason };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}
