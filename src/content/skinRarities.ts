/**
 * Raridades de skins — sistema central.
 * NUNCA espalhar cores/estilos de raridade pelo código: use SKIN_RARITIES.
 */
export type SkinRarityId =
  | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'
  | 'divine' | 'celestial' | 'exclusive' | 'limited' | 'event' | 'founder';

export interface SkinRarity {
  id: SkinRarityId;
  name: string;
  order: number; // 0 = mais comum
  color: string;
  glow: string;
  /** Peso visual (glow de texto/cartão). */
  textShadow?: string;
  /** Raridades limitadas/obsoletas: exibir como indisponível após a data. */
  temporal?: boolean;
}

export const SKIN_RARITIES: SkinRarity[] = [
  { id: 'common', name: 'Comum', order: 0, color: '#9aa5b1', glow: 'rgba(154,165,177,0.35)' },
  { id: 'uncommon', name: 'Incomum', order: 1, color: '#3ddc84', glow: 'rgba(61,220,132,0.4)' },
  { id: 'rare', name: 'Rara', order: 2, color: '#4da6ff', glow: 'rgba(77,166,255,0.4)' },
  { id: 'epic', name: 'Épica', order: 3, color: '#b06cff', glow: 'rgba(176,108,255,0.45)' },
  { id: 'legendary', name: 'Lendária', order: 4, color: '#ff8a3d', glow: 'rgba(255,138,61,0.5)', textShadow: '0 0 8px rgba(255,138,61,0.5)' },
  { id: 'mythic', name: 'Mítica', order: 5, color: '#ff4d6d', glow: 'rgba(255,77,109,0.5)', textShadow: '0 0 8px rgba(255,77,109,0.5)' },
  { id: 'divine', name: 'Divina', order: 6, color: '#ffe14d', glow: 'rgba(255,225,77,0.5)', textShadow: '0 0 8px rgba(255,225,77,0.5)' },
  { id: 'celestial', name: 'Celestial', order: 7, color: '#37f5ff', glow: 'rgba(55,245,255,0.55)', textShadow: '0 0 8px rgba(55,245,255,0.55)' },
  { id: 'exclusive', name: 'Exclusiva', order: 8, color: '#ff6bff', glow: 'rgba(255,107,255,0.6)', textShadow: '0 0 10px rgba(255,107,255,0.6)' },
  { id: 'limited', name: 'Limitada', order: 9, color: '#ff2d55', glow: 'rgba(255,45,85,0.6)', textShadow: '0 0 10px rgba(255,45,85,0.6)', temporal: true },
  { id: 'event', name: 'Eventual', order: 10, color: '#3ddc84', glow: 'rgba(61,220,132,0.5)', temporal: true },
  { id: 'founder', name: 'Fundador', order: 11, color: '#ffd94d', glow: 'rgba(255,217,77,0.6)', textShadow: '0 0 10px rgba(255,217,77,0.6)' },
];

export const SKIN_RARITY_MAP: Record<SkinRarityId, SkinRarity> = Object.fromEntries(
  SKIN_RARITIES.map((r) => [r.id, r]),
) as Record<SkinRarityId, SkinRarity>;

export function skinRarity(id: SkinRarityId): SkinRarity {
  return SKIN_RARITY_MAP[id] ?? SKIN_RARITY_MAP.common;
}

/** Classe CSS padronizada: `skin-rarity-{id}`. */
export function skinRarityClass(id: SkinRarityId): string {
  return `skin-rarity-${id}`;
}
