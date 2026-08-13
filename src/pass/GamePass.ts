/**
 * Passe Premium global — 100 níveis.
 * Trilha GRÁTIS (todos) + trilha PREMIUM (exclusiva para quem adquiriu o passe).
 * Itens exclusivos do passe NÃO aparecem na loja comum.
 *
 * A aquisição usa o mesmo fluxo Pix da Carteira/Loja (engine.buyPremiumPass):
 * online = Mercado Pago via servidor com recibo assinado no backend; local =
 * simulação com recibo assinado localmente (modo de teste/dev).
 */
import type { EventRewardSpec } from '../content/rewards';
import { GameConfig } from '../config/GameConfig';

export interface PassLevelDef {
  level: number;
  /** XP total acumulada para atingir este nível. */
  xp: number;
  free?: EventRewardSpec;
  premium?: EventRewardSpec;
}

/** Itens exclusivos do passe (não disponíveis na loja comum) — skin aparece UMA única vez. */
export const PASS_EXCLUSIVE: { skin: string; atLevel: number }[] = [
  { skin: 'pass_echo', atLevel: 5 },
  { skin: 'pass_core', atLevel: 15 },
  { skin: 'pass_glitch', atLevel: 30 },
  { skin: 'pass_divine', atLevel: 50 },
  { skin: 'pass_omega', atLevel: 75 },
  { skin: 'pass_omega_alt', atLevel: 100 },
];

export const PASS_EXCLUSIVE_PET = 'pet_chrono';
export const PASS_EXCLUSIVE_TITLE = 'pass_premium';
export const PASS_EXCLUSIVE_TITLE_OMEGA = 'pass_omega';
export const PASS_EXCLUSIVE_AVATAR = 'av_cyber';
export const PASS_EXCLUSIVE_FRAME = 'fr_premium';
export const PASS_EXCLUSIVE_EFFECT = 'fx_premium';
export const PASS_EXCLUSIVE_BADGE = 'bd_premium';

export interface PassSummary {
  freeRewards: number;
  premiumRewards: number;
  skins: { skin: string; atLevel: number }[];
  totalCredits: number;
  totalCrystals: number;
  totalBoxes: number;
  hasPet: boolean;
  hasTitles: boolean;
  hasAvatarItems: boolean;
}

function gold(n: number | string): EventRewardSpec { return { gold: String(n) }; }
function boxes(n: number, boxId = 'basic'): EventRewardSpec { return { boxes: [{ boxId, qty: n }] }; }

/**
 * Trilha GRÁTIS — recompensa em TODOS os níveis com variedade:
 * ouro progressivo + diamantes a cada 3, caixas a cada 5, fragmentos a cada 7,
 * consumíveis a cada 8, e marcos curados (10, 20, … 100) com diamantes/caixas.
 */
function fillerFree(level: number): EventRewardSpec {
  if (level % 10 === 0) return { crystals: 50 + level * 3, boxes: [{ boxId: 'basic', qty: 2 }] }; // marco: 💎 + caixas
  if (level % 5 === 0) return { gold: String(20000 + 12000 * level), boxes: [{ boxId: 'basic', qty: 1 }] };
  if (level % 8 === 0) return { gold: String(15000 + 6000 * level), consumables: [{ id: 'pet_food', qty: 1 }] };
  if (level % 7 === 0) return { gold: String(18000 + 7000 * level), fragments: 5 + level };
  if (level % 3 === 0) return { gold: String(15000 + 6500 * level), crystals: 8 + level };
  return { gold: String(10000 + 5000 * level) };
}

/**
 * Trilha PREMIUM — recompensa forte em TODOS os níveis: créditos 💳 frequentes,
 * diamantes, caixas event, fragmentos, XP e consumíveis. Skins/avatar/pet/títulos
 * ficam apenas nos marcos curados (nunca duplicados).
 */
function fillerPremium(level: number): EventRewardSpec {
  if (level % 6 === 0) return { credits: 10 + Math.round(level * 1.5), gold: String(30000 + 9000 * level) };
  if (level % 5 === 0) return { crystals: 60 + level * 4, boxes: [{ boxId: 'event', qty: 1 }] };
  if (level % 8 === 0) return { gold: String(50000 + 12000 * level), consumables: [{ id: 'pet_food', qty: 3 }], fragments: 10 + level };
  if (level % 4 === 0) return { crystals: 40 + level * 3, gold: String(40000 + 10000 * level) };
  return { gold: String(25000 + 8000 * level), crystals: 15 + level };
}

/** Gera os 100 níveis do passe (curadoria nos marcos). */
export function generatePassLevels(): PassLevelDef[] {
  const levels: PassLevelDef[] = [];
  for (let lvl = 1; lvl <= GameConfig.pass.maxLevel; lvl++) {
    let free: EventRewardSpec = fillerFree(lvl);
    let premium: EventRewardSpec = fillerPremium(lvl);

    // ── marcos curados — grátis: diamantes/caixas crescendo ──
    if (lvl === 10) { free = { crystals: 120, boxes: [{ boxId: 'basic', qty: 2 }] }; }
    if (lvl === 20) { free = { crystals: 200, boxes: [{ boxId: 'rare', qty: 1 }] }; }
    if (lvl === 30) { free = { crystals: 300, boxes: [{ boxId: 'rare', qty: 1 }] }; }
    if (lvl === 40) { free = { crystals: 400, boxes: [{ boxId: 'rare', qty: 2 }] }; }
    if (lvl === 50) { free = { crystals: 500, boxes: [{ boxId: 'event', qty: 1 }] }; }
    if (lvl === 60) { free = { crystals: 600, boxes: [{ boxId: 'event', qty: 1 }] }; }
    if (lvl === 70) { free = { crystals: 700, boxes: [{ boxId: 'event', qty: 2 }] }; }
    if (lvl === 80) { free = { crystals: 800, boxes: [{ boxId: 'event', qty: 2 }] }; }
    if (lvl === 90) { free = { crystals: 900, boxes: [{ boxId: 'event', qty: 3 }] }; }
    if (lvl === 100) { free = { crystals: 1200, boxes: [{ boxId: 'event', qty: 4 }], gold: '100000' }; }

    // ── marcos curados — premium: exclusivos (cada um UMA vez) ──
    if (lvl === 5) { premium = { skins: ['pass_echo'], crystals: 100, gold: '20000' }; }
    if (lvl === 10) { premium = { crystals: 300, boxes: [{ boxId: 'event', qty: 1 }], credits: 25 }; }
    if (lvl === 15) { premium = { skins: ['pass_core'], crystals: 150, credits: 30 }; }
    if (lvl === 20) { premium = { titles: [PASS_EXCLUSIVE_TITLE], crystals: 250, credits: 40 }; }
    if (lvl === 25) { premium = { crystals: 400, boxes: [{ boxId: 'event', qty: 2 }], credits: 50 }; }
    if (lvl === 30) { premium = { skins: ['pass_glitch'], crystals: 300, credits: 60 }; }
    if (lvl === 35) { premium = { avatarItems: [PASS_EXCLUSIVE_AVATAR], crystals: 350, credits: 70 }; }
    if (lvl === 40) { premium = { avatarItems: [PASS_EXCLUSIVE_FRAME], crystals: 450, credits: 80 }; }
    if (lvl === 45) { premium = { crystals: 600, boxes: [{ boxId: 'event', qty: 2 }], credits: 90 }; }
    if (lvl === 50) { premium = { skins: ['pass_divine'], crystals: 500, credits: 100 }; }
    if (lvl === 55) { premium = { avatarItems: [PASS_EXCLUSIVE_EFFECT], crystals: 700, credits: 110 }; }
    if (lvl === 60) { premium = { crystals: 900, boxes: [{ boxId: 'event', qty: 3 }], credits: 120 }; }
    if (lvl === 65) { premium = { avatarItems: [PASS_EXCLUSIVE_BADGE], crystals: 850, credits: 130 }; }
    if (lvl === 70) { premium = { crystals: 1200, boxes: [{ boxId: 'event', qty: 3 }], credits: 150 }; }
    if (lvl === 75) { premium = { skins: ['pass_omega'], crystals: 1000, credits: 160 }; }
    if (lvl === 80) { premium = { crystals: 1500, boxes: [{ boxId: 'event', qty: 4 }], credits: 180 }; }
    if (lvl === 85) { premium = { crystals: 1600, boxes: [{ boxId: 'event', qty: 3 }], credits: 200 }; }
    if (lvl === 90) { premium = { crystals: 2000, boxes: [{ boxId: 'event', qty: 4 }], credits: 220 }; }
    if (lvl === 95) { premium = { crystals: 2500, boxes: [{ boxId: 'event', qty: 4 }], credits: 250 }; }
    if (lvl === 100) {
      premium = {
        skins: ['pass_omega_alt'],
        pets: [PASS_EXCLUSIVE_PET],
        titles: [PASS_EXCLUSIVE_TITLE_OMEGA],
        avatarItems: [PASS_EXCLUSIVE_AVATAR, PASS_EXCLUSIVE_FRAME, PASS_EXCLUSIVE_EFFECT, PASS_EXCLUSIVE_BADGE],
        crystals: 3000,
        credits: 300,
        boxes: [{ boxId: 'event', qty: 5 }],
        gold: '100000',
      };
    }

    levels.push({
      level: lvl,
      xp: GameConfig.pass.xpForLevel(lvl),
      free,
      premium,
    });
  }
  return levels;
}

/** Resumo do passe inteiro (para o topo da tela: “o que você ganha”). */
export function summarizePass(): PassSummary {
  const levels = GAME_PASS_LEVELS;
  const skins = PASS_EXCLUSIVE;
  let totalCredits = 0;
  let totalCrystals = 0;
  let totalBoxes = 0;
  let hasPet = false;
  let hasTitles = false;
  let hasAvatarItems = false;
  let premiumRewards = 0;
  let freeRewards = 0;
  for (const l of levels) {
    if (l.free) freeRewards += 1;
    if (l.premium) premiumRewards += 1;
    const spec = l.premium;
    if (!spec) continue;
    if (spec.credits) totalCredits += spec.credits;
    if (spec.crystals) totalCrystals += spec.crystals;
    if (spec.boxes) totalBoxes += spec.boxes.reduce((s, b) => s + b.qty, 0);
    if (spec.pets?.length) hasPet = true;
    if (spec.titles?.length) hasTitles = true;
    if (spec.avatarItems?.length) hasAvatarItems = true;
  }
  return { freeRewards, premiumRewards, skins, totalCredits, totalCrystals, totalBoxes, hasPet, hasTitles, hasAvatarItems };
}

export const GAME_PASS_LEVELS: PassLevelDef[] = generatePassLevels();

/** Nível atual a partir da XP acumulada (0 se sem XP). */
export function passLevelFromXp(xp: number): number {
  let level = 0;
  for (const l of GAME_PASS_LEVELS) {
    if (xp >= l.xp) level = l.level;
    else break;
  }
  return level;
}

/** XP necessária para o próximo nível a partir da XP atual. */
export function passNextLevel(xp: number): { level: number; needed: number; progress: number } | null {
  const next = GAME_PASS_LEVELS.find((l) => l.xp > xp);
  if (!next) return null;
  const prevXp = GAME_PASS_LEVELS[next.level - 2]?.xp ?? 0;
  return { level: next.level, needed: next.xp, progress: (xp - prevXp) / Math.max(1, next.xp - prevXp) };
}
