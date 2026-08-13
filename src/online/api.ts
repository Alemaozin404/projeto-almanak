/**
 * Cliente da API online — fala com o mesmo backend do Pix (server/ no Vercel).
 * Cobre: conteúdo online (RemoteContent), save na nuvem e ranking global.
 *
 * Todas as rotas que ESCREVEM dados exigem o header `x-app-secret`
 * (GameConfig.wallet.appSharedSecret) — a mesma proteção leve usada no Pix.
 */
import { pixBackendUrl, pixOnlineEnabled } from '../wallet/mp';
import { GameConfig } from '../config/GameConfig';
import { platformName, type PlayerPlatform } from '../core/platform';

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
  /** Plataforma de origem do recorde (android | pc | web) — filtro do ranking. */
  platform?: string;
}

export type RankPlatform = 'all' | PlayerPlatform;

/** Baixa o ranking global de um tipo de ciclo (com filtro opcional por plataforma). */
export async function fetchGlobalRank(kind: RankEntry['kind'], limit = 10, platform: RankPlatform = 'all'): Promise<RankEntry[]> {
  try {
    const q = new URLSearchParams({ kind, limit: String(limit) });
    if (platform && platform !== 'all') q.set('platform', platform);
    const res = await fetch(`${serverUrl()}/api/rank?${q}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { ok?: boolean; list?: RankEntry[] };
    return Array.isArray(data.list) ? data.list.slice(0, limit) : [];
  } catch {
    return [];
  }
}

export interface OnlinePlayer {
  playerId: string;
  gameVersion?: string;
  lastSeenAt: number;
}

/**
 * Lista os jogadores online agora (presença do heartbeat — sinal nos últimos 3 min).
 * Retorna null quando o servidor está inacessível/recusou (falha ≠ lista vazia).
 */
export async function fetchOnlinePlayers(): Promise<OnlinePlayer[] | null> {
  try {
    const res = await apiFetch('/api/online');
    if (res.redirected) return null; // protegido por login (Vercel Authentication)
    if (!res.ok) return null;
    const data = await apiJson<{ ok?: boolean; online?: OnlinePlayer[] }>(res);
    return Array.isArray(data?.online) ? data.online : [];
  } catch {
    return null;
  }
}

/** Publica um ciclo no ranking global. Retorna a posição (ou null). */
export async function submitGlobalRank(entry: Omit<RankEntry, 'at' | 'platform'> & { at?: number; platform?: string }): Promise<{ ok: boolean; position?: number | null; reason?: string }> {
  try {
    const res = await apiFetch('/api/rank', {
      method: 'POST',
      body: JSON.stringify({ ...entry, platform: entry.platform ?? platformName(), at: entry.at ?? Date.now() }),
    });
    const data = await apiJson<{ ok?: boolean; position?: number | null; reason?: string }>(res);
    return { ok: data?.ok === true, position: data?.position, reason: data?.reason };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}
