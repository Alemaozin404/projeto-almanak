/**
 * RemoteContent — sincronização do conteúdo do jogo com o servidor (Vercel).
 *
 * Fluxo:
 *   1. `syncRemoteContent()` baixa GET /api/content (notícias, eventos,
 *      banners, códigos, changelog, janelas de manutenção);
 *   2. aplica via `hydrate*()` — as telas do jogo passam a exibir o conteúdo
 *      online sem recompilar/reinstalar;
 *   3. guarda uma cópia no localStorage: se o servidor estiver fora do ar
 *      depois, o jogo usa a última versão conhecida (offline-first).
 *
 * Se nenhum backend estiver configurado, o jogo segue 100% com o conteúdo
 * local embutido — nada muda para quem joga offline.
 */
import { pixBackendUrl, pixOnlineEnabled } from '../wallet/mp';
import { hydrateNews, type NewsItem } from '../content/news';
import { hydrateUpdates, type PatchNote } from '../content/updates';
import { hydrateBanners, type BannerDef } from '../content/banners';
import { hydrateEvents, type EventDef } from '../content/events';
import { hydrateSeasons, type SeasonDef } from '../content/seasons';
import { hydrateCodes, type CodeDef } from '../content/codes';
import { hydrateMaintenance, type MaintenanceWindow } from '../content/maintenance';

export interface RemoteContentDto {
  gameVersion: string;
  exportedAt?: string;
  updates?: PatchNote[];
  news?: NewsItem[];
  banners?: BannerDef[];
  events?: EventDef[];
  seasons?: SeasonDef[];
  codes?: CodeDef[];
  maintenance?: MaintenanceWindow[];
}

const CACHE_KEY = 'nc_remote_content_v1';
/** Intervalo entre sincronizações com o servidor. */
export const SYNC_INTERVAL_MS = 30 * 60 * 1000;

export type SyncResult = 'online' | 'cached' | 'offline';

interface CacheEntry {
  fetchedAt: number;
  dto: RemoteContentDto;
}

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readCache(): CacheEntry | null {
  const st = storage();
  if (!st) return null;
  try {
    const raw = st.getItem(CACHE_KEY);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry;
    if (!entry || !entry.dto || !entry.dto.gameVersion) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeCache(dto: RemoteContentDto): void {
  const st = storage();
  if (!st) return;
  try {
    const entry: CacheEntry = { fetchedAt: Date.now(), dto };
    st.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* sem espaço — ignora (conteúdo segue online) */
  }
}

function clearCache(): void {
  storage()?.removeItem(CACHE_KEY);
}

/** Aplica um conteúdo remoto validado nos módulos do jogo. */
export function applyRemoteContent(dto: RemoteContentDto): void {
  if (Array.isArray(dto.updates)) hydrateUpdates(dto.updates);
  if (Array.isArray(dto.news)) hydrateNews(dto.news);
  if (Array.isArray(dto.banners)) hydrateBanners(dto.banners);
  if (Array.isArray(dto.events)) hydrateEvents(dto.events);
  if (Array.isArray(dto.seasons)) hydrateSeasons(dto.seasons);
  if (Array.isArray(dto.codes)) hydrateCodes(dto.codes);
  if (Array.isArray(dto.maintenance)) hydrateMaintenance(dto.maintenance);
}

/** Baixa o conteúdo do servidor (sem aplicar). */
export async function fetchRemoteContent(base?: string): Promise<RemoteContentDto | null> {
  const server = (base ?? pixBackendUrl()).replace(/\/+$/, '');
  if (!server) return null;
  const res = await fetch(`${server}/api/content`, { headers: { accept: 'application/json' } });
  if (!res.ok) return null;
  const data = (await res.json()) as { ok?: boolean; content?: RemoteContentDto };
  const dto = data?.content;
  if (!dto || typeof dto.gameVersion !== 'string') return null;
  return dto;
}

/** Aplica a última versão em cache (se existir). Retorna false se não houver. */
export function applyCachedContent(): boolean {
  const entry = readCache();
  if (!entry) return false;
  applyRemoteContent(entry.dto);
  return true;
}

/**
 * Sincroniza o conteúdo com o servidor:
 *  - 'online'  → baixou e aplicou conteúdo novo;
 *  - 'cached'  → servidor indisponível, usou o conteúdo em cache;
 *  - 'offline' → nenhum backend configurado (jogo 100% local).
 */
export async function syncRemoteContent(): Promise<SyncResult> {
  if (!pixOnlineEnabled()) return 'offline';
  try {
    const dto = await fetchRemoteContent();
    if (!dto) return applyCachedContent() ? 'cached' : 'offline';
    applyRemoteContent(dto);
    writeCache(dto);
    return 'online';
  } catch {
    return applyCachedContent() ? 'cached' : 'offline';
  }
}

/** Última sincronização (para telas de status). 0 = nunca. */
export function lastSyncAt(): number {
  return readCache()?.fetchedAt ?? 0;
}

/** Versão do conteúdo remoto em uso (ou null). */
export function remoteGameVersion(): string | null {
  return readCache()?.dto.gameVersion ?? null;
}

/** Limpa o cache de conteúdo remoto (usado ao trocar de servidor). */
export function resetRemoteContent(): void {
  clearCache();
}

export type { MaintenanceWindow };
