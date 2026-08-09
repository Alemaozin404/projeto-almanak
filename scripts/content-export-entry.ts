/**
 * Entrypoint do export de conteúdo (usado por scripts/export-content.mjs).
 * Coleta TODO o conteúdo data-driven do jogo e o serializa para
 * server/content.json — que o servidor serve via GET /api/content.
 *
 * IMPORTANTE: este arquivo é bundlado pelo esbuild e EXECUTADO (Node).
 * O JSON gerado é commitado no git (é o que vai ao Vercel).
 */
import { GAME_VERSION, UPDATES, type PatchNote } from '../src/content/updates';
import { NEWS, type NewsItem } from '../src/content/news';
import { BANNERS, type BannerDef } from '../src/content/banners';
import { EVENTS_ALL, type EventDef } from '../src/content/events';
import { SEASONS, type SeasonDef } from '../src/content/seasons';
import { CODES, type CodeDef } from '../src/content/codes';
import { MAINTENANCE_WINDOWS, type MaintenanceWindow } from '../src/content/maintenance';

// NOTE: sem campos voláteis (ex.: timestamp de exportação) — o CI compara
// server/content.json após regenerar e exige diff ZERO em conteúdo inalterado.
export interface ExportedContent {
  gameVersion: string;
  updates: PatchNote[];
  news: NewsItem[];
  banners: BannerDef[];
  events: EventDef[];
  seasons: SeasonDef[];
  codes: CodeDef[];
  maintenance: MaintenanceWindow[];
}

const content: ExportedContent = {
  gameVersion: GAME_VERSION,
  updates: UPDATES,
  news: NEWS,
  banners: BANNERS,
  events: EVENTS_ALL,
  seasons: SEASONS,
  codes: CODES,
  maintenance: MAINTENANCE_WINDOWS,
};

export default content;
