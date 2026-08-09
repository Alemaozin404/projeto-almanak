/**
 * Compatibilidade: o catálogo completo de skins agora vive em src/content/skins.
 * Este módulo re-exporta para não quebrar imports existentes.
 */
export {
  SKINS, SKIN_MAP, SKIN_CATEGORIES, equippedSkin, unlockedSkins,
  isSkinOwned, isSkinEquipped, skinStatus, at,
} from '../content/skins';
export type {
  SkinDef, SkinCategory, SkinObtain, SkinStatus, SkinVisual,
  CoreVisual, ProfileVisual, BannerVisual,
} from '../content/skins';
