import type { RarityId } from '../game/types';

export interface RarityDef {
  id: RarityId;
  name: string;
  color: string;
  colorSoft: string;
  glow: string;
  mult: number;
  weight: number;
  order: number;
}

/** Fonte única de verdade para raridades — nenhuma cor fixa espalhada no código. */
export const RARITIES: Record<RarityId, RarityDef> = {
  common: { id: 'common', name: 'Comum', color: '#9aa5b1', colorSoft: 'rgba(154,165,177,0.14)', glow: 'rgba(154,165,177,0.35)', mult: 1, weight: 1000, order: 0 },
  uncommon: { id: 'uncommon', name: 'Incomum', color: '#3ddc84', colorSoft: 'rgba(61,220,132,0.14)', glow: 'rgba(61,220,132,0.4)', mult: 1.6, weight: 500, order: 1 },
  rare: { id: 'rare', name: 'Raro', color: '#4da6ff', colorSoft: 'rgba(77,166,255,0.14)', glow: 'rgba(77,166,255,0.45)', mult: 2.6, weight: 210, order: 2 },
  epic: { id: 'epic', name: 'Épico', color: '#b06cff', colorSoft: 'rgba(176,108,255,0.16)', glow: 'rgba(176,108,255,0.5)', mult: 4.2, weight: 85, order: 3 },
  legendary: { id: 'legendary', name: 'Lendário', color: '#ff8a3d', colorSoft: 'rgba(255,138,61,0.16)', glow: 'rgba(255,138,61,0.55)', mult: 7, weight: 32, order: 4 },
  mythic: { id: 'mythic', name: 'Mítico', color: '#ff4d6d', colorSoft: 'rgba(255,77,109,0.17)', glow: 'rgba(255,77,109,0.6)', mult: 12, weight: 11, order: 5 },
  divine: { id: 'divine', name: 'Divino', color: '#ffe14d', colorSoft: 'rgba(255,225,77,0.17)', glow: 'rgba(255,225,77,0.65)', mult: 20, weight: 3.5, order: 6 },
  celestial: { id: 'celestial', name: 'Celestial', color: '#37f5ff', colorSoft: 'rgba(55,245,255,0.18)', glow: 'rgba(55,245,255,0.7)', mult: 35, weight: 1, order: 7 },
  transcendent: { id: 'transcendent', name: 'Transcendente', color: '#ff6bff', colorSoft: 'rgba(255,107,255,0.2)', glow: 'rgba(255,107,255,0.8)', mult: 60, weight: 0.2, order: 8 },
};

export const RARITY_LIST: RarityDef[] = Object.values(RARITIES).sort((a, b) => a.order - b.order);

export function rarityOf(id: RarityId): RarityDef {
  return RARITIES[id] ?? RARITIES.common;
}

/** Sorteia uma raridade a partir de pesos. */
export function rollRarity(weights: Partial<Record<RarityId, number>>, luckMult = 1): RarityId {
  const entries = Object.entries(weights) as [RarityId, number][];
  let total = 0;
  const scaled = entries.map(([id, w]) => {
    // sorte aumenta o peso das raridades mais altas
    const boosted = id === 'common' ? w / luckMult : w * luckMult;
    total += Math.max(0.0001, boosted);
    return [id, Math.max(0.0001, boosted)] as [RarityId, number];
  });
  let r = Math.random() * total;
  for (const [id, w] of scaled) {
    r -= w;
    if (r <= 0) return id;
  }
  return scaled[scaled.length - 1][0];
}
