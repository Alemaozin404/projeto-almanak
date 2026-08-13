import { D } from '../core/bignum';
import { pct, type PartialModifiers } from '../core/modifiers';
import type { GameState } from '../game/types';
import { GameConfig } from '../config/GameConfig';

export interface TitleDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  check: (state: GameState) => boolean;
  bonus?: PartialModifiers;
}

export const TITLES: TitleDef[] = [
  { id: 'novato', name: 'Novato', icon: '🌱', desc: 'Comece a jogar.', check: () => true, bonus: undefined },
  { id: 'clicador', name: 'Clicador', icon: '🖱️', desc: 'Clique 10.000 vezes.', check: (s) => D(s.stats.clicks ?? '0').gte(10000), bonus: pct({ clickPower: 5 }) },
  { id: 'mestre', name: 'Mestre', icon: '🎓', desc: 'Alcance o nível 50.', check: (s) => s.level >= 50, bonus: pct({ xpGain: 15 }) },
  { id: 'magnata', name: 'Magnata', icon: '💰', desc: 'Ganhe 1 trilhão de ouro.', check: (s) => D(s.stats.goldEarned ?? '0').gte(1e12), bonus: pct({ goldGain: 15 }) },
  { id: 'bilionario', name: 'Bilionário', icon: '💵', desc: 'Produza 1 bilhão de energia.', check: (s) => D(s.stats.energyProduced ?? '0').gte(1e9), bonus: pct({ production: 10 }) },
  { id: 'lenda', name: 'Lenda', icon: '🌟', desc: 'Produza 1 trilhão de energia.', check: (s) => D(s.stats.energyProduced ?? '0').gte(1e12), bonus: pct({ production: 20, clickPower: 20 }) },
  { id: 'ascendente', name: 'Ascendente', icon: '👑', desc: 'Faça sua primeira ascensão.', check: (s) => s.ascension.count >= 1, bonus: pct({ production: 30, clickPower: 30 }) },
  { id: 'divino', name: 'Divino', icon: '😇', desc: 'Transcenda pela primeira vez.', check: (s) => s.transcendence.count >= 1, bonus: pct({ production: 60, clickPower: 60, goldGain: 30 }) },
  { id: 'transcendente', name: 'Transcendente', icon: '✨', desc: 'Transcenda 5 vezes.', check: (s) => s.transcendence.count >= 5, bonus: pct({ production: 150, clickPower: 150, critChance: 10 }) },
  { id: 'colecionador', name: 'Colecionador', icon: '🏆', desc: 'Desbloqueie 60 conquistas.', check: (s) => D(s.stats.achievementsUnlocked ?? '0').gte(60), bonus: pct({ luck: 25 }) },
  { id: 'pets', name: 'Caçador de Pets', icon: '🐾', desc: 'Encontre 150 pets.', check: (s) => D(s.stats.petsFound ?? '0').gte(150), bonus: pct({ petPower: 30, petFind: 20 }) },
  { id: 'sem_limites', name: 'Sem Limites', icon: '🌌', desc: 'Clique 1 bilhão de vezes.', check: (s) => D(s.stats.clicks ?? '0').gte(1e9), bonus: pct({ clickPower: 50 }) },
  { id: 'veterano', name: 'Veterano', icon: '🕰️', desc: 'Jogue por 100 horas.', check: (s) => s.playTimeSeconds >= 360000, bonus: pct({ production: 40 }) },
  // ── Títulos do Passe Premium / Temporada (Update 3.0) ──
  { id: 'pass_premium', name: 'Premium', icon: '💎', desc: 'Adquira o Passe Premium.', check: (s) => s.premiumPass?.owned === true, bonus: pct({ luck: 10 }) },
  { id: 'pass_omega', name: 'Omega', icon: '⏳', desc: 'Complete o nível 100 do Passe Premium.', check: (s) => s.premiumPass?.owned === true && s.premiumPass.xp >= GameConfig.pass.xpForLevel(100), bonus: pct({ production: 50, clickPower: 50, critChance: 5 }) },
  { id: 'cyber_genesis', name: 'Gênese Cyber', icon: '🌐', desc: 'Complete o passe da Temporada Cyber Genesis.', check: (s) => (s.passTracks?.season_season4?.claimedFree?.length ?? 0) >= 10, bonus: pct({ production: 15, goldGain: 15 }) },
  // ── Títulos EXCLUSIVOS dos Combos (Loja → Combos) — concedidos apenas pelo pacote, nunca por progresso ──
  { id: 'combo_mythic', name: 'Mítico dos Combos', icon: '🪔', desc: 'Adquira o Combo Mítico na Loja.', check: () => false, bonus: pct({ luck: 5 }) },
  { id: 'combo_divine', name: 'Divino dos Combos', icon: '😇', desc: 'Adquira o Combo Divino na Loja.', check: () => false, bonus: pct({ luck: 8 }) },
  { id: 'combo_celestial', name: 'Celestial dos Combos', icon: '✨', desc: 'Adquira o Combo Celestial na Loja.', check: () => false, bonus: pct({ luck: 10 }) },
  { id: 'combo_omega', name: 'Supremo dos Combos', icon: '👑', desc: 'Adquira o Combo Supremo na Loja.', check: () => false, bonus: pct({ production: 10, luck: 10 }) },
];

export const TITLE_MAP: Record<string, TitleDef> = Object.fromEntries(TITLES.map((t) => [t.id, t]));

export function titleBonusOf(state: GameState): PartialModifiers {
  if (!state.equippedTitle) return {};
  const t = TITLE_MAP[state.equippedTitle];
  return t?.bonus ?? {};
}
