/**
 * ContentManager — ponto central de acesso ao conteúdo data-driven.
 * Skins · Events · Banners · News · Updates · Seasons · Codes · Rewards.
 */
import { SKINS, SKIN_CATEGORIES, SKIN_MAP, type SkinDef, type SkinCategory } from '../content/skins';
import { SKIN_RARITIES, SKIN_RARITY_MAP, type SkinRarityId } from '../content/skinRarities';
import { EVENTS_ALL, type EventDef } from '../content/events';
import { BANNERS, type BannerDef } from '../content/banners';
import { NEWS, type NewsItem } from '../content/news';
import { UPDATES, GAME_VERSION, type PatchNote } from '../content/updates';
import { SEASONS, type SeasonDef } from '../content/seasons';
import { CODES, type CodeDef } from '../content/codes';

export interface ContentStats {
  skins: number;
  skinsOwned: number;
  events: number;
  banners: number;
  news: number;
  updates: number;
  seasons: number;
  codes: number;
}

export class ContentManager {
  static version(): string {
    return GAME_VERSION;
  }

  // ── Skins ──
  static skins(): SkinDef[] {
    return SKINS;
  }

  static skin(id: string): SkinDef | undefined {
    return SKIN_MAP[id];
  }

  static skinCategories(): { id: SkinCategory; name: string; icon: string }[] {
    return SKIN_CATEGORIES;
  }

  static skinRarities() {
    return SKIN_RARITIES;
  }

  static skinRarity(id: SkinRarityId) {
    return SKIN_RARITY_MAP[id] ?? SKIN_RARITY_MAP.common;
  }

  // ── Events ──
  static events(): EventDef[] {
    return EVENTS_ALL;
  }

  // ── Banners ──
  static banners(): BannerDef[] {
    return BANNERS;
  }

  // ── News ──
  static news(): NewsItem[] {
    return NEWS;
  }

  // ── Updates ──
  static updates(): PatchNote[] {
    return UPDATES;
  }

  // ── Seasons ──
  static seasons(): SeasonDef[] {
    return SEASONS;
  }

  // ── Codes ──
  static codes(): CodeDef[] {
    return CODES;
  }

  static code(id: string): CodeDef | undefined {
    return CODES.find((c) => c.id === id.toUpperCase());
  }

  /** Estatísticas de conteúdo (para o painel de desenvolvedor). */
  static stats(ownedSkinIds: string[]): ContentStats {
    return {
      skins: SKINS.length,
      skinsOwned: new Set(ownedSkinIds).size,
      events: EVENTS_ALL.length,
      banners: BANNERS.length,
      news: NEWS.length,
      updates: UPDATES.length,
      seasons: SEASONS.length,
      codes: CODES.length,
    };
  }
}
