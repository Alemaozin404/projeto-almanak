import { D, type Num } from '../core/bignum';

/**
 * Custo de um upgrade: Custo = Base × Multiplicador^(nível)
 */
export function upgradeCost(baseCost: Num, costMult: number, level: number): ReturnType<typeof D> {
  return D(baseCost).mul(D(costMult).pow(level));
}

/** Custo total para comprar `qty` níveis de uma vez (série geométrica). */
export function bulkCost(baseCost: Num, costMult: number, fromLevel: number, qty: number): ReturnType<typeof D> {
  const mult = D(costMult);
  // base * mult^from * (mult^qty - 1) / (mult - 1)
  const top = mult.pow(fromLevel).mul(mult.pow(qty).minus(1));
  return D(baseCost).mul(top).div(mult.minus(1));
}

/** Preço dinâmico (aumenta com o nível do item). */
export function dynamicPrice(base: Num, level: number, growth = 1.5): ReturnType<typeof D> {
  return D(base).mul(D(growth).pow(level));
}

/** XP necessário para ir do nível `level` ao `level+1`. */
export function xpForLevel(level: number): ReturnType<typeof D> {
  return D(160).mul(D(level).pow(2.05)).plus(D(200).mul(level)).plus(100).floor();
}

/** XP necessário para o pet ir do nível `level` ao próximo. */
export function petXpForLevel(level: number): ReturnType<typeof D> {
  return D(100).mul(D(1.35).pow(level)).mul(level + 1).floor();
}

export const PRESTIGE_MIN_ENERGY = D(1e6);

/** Fragmentos obtidos ao prestigiar. Requer pelo menos 1M de energia no ciclo. */
export function prestigeFragments(energyThisCycle: Num, prestigeCount: number): ReturnType<typeof D> {
  const e = D(energyThisCycle);
  if (e.lt(PRESTIGE_MIN_ENERGY)) return D(0);
  return e.div(PRESTIGE_MIN_ENERGY).pow(0.65).mul(1 + prestigeCount * 0.08).floor();
}

/** Moedas de prestígio ganhas junto com os fragmentos. */
export function prestigeCoinsGain(fragments: ReturnType<typeof D>, prestigeCount: number): ReturnType<typeof D> {
  return fragments.div(10).floor().plus(prestigeCount * 2 + 1);
}

export const ASCENSION_MIN_FRAGMENTS = D(25);

/** Moedas de ascensão. Requer fragmentos no ciclo desde a última ascensão. */
export function ascensionCoins(fragmentsThisCycle: Num, ascensionCount: number): ReturnType<typeof D> {
  const f = D(fragmentsThisCycle);
  if (f.lt(ASCENSION_MIN_FRAGMENTS)) return D(0);
  return f.div(ASCENSION_MIN_FRAGMENTS).pow(0.6).mul(1 + ascensionCount * 0.1).floor();
}

export const TRANSCENDENCE_MIN_COINS = D(5);

/** Essência obtida ao transcender. Requer moedas de ascensão no ciclo. */
export function transcendenceEssence(ascensionCoinsThisCycle: Num, transcendenceCount: number): ReturnType<typeof D> {
  const c = D(ascensionCoinsThisCycle);
  if (c.lt(TRANSCENDENCE_MIN_COINS)) return D(0);
  return c.div(TRANSCENDENCE_MIN_COINS).pow(0.6).mul(1 + transcendenceCount * 0.15).floor();
}

/** Nível calculado a partir do XP total. */
export function levelFromXp(totalXp: Num): { level: number; xpInto: ReturnType<typeof D> } {
  const xp = D(totalXp);
  let level = 1;
  let remaining = xp;
  let need = xpForLevel(level);
  while (remaining.gte(need) && level < 5000) {
    remaining = remaining.minus(need);
    level += 1;
    need = xpForLevel(level);
  }
  return { level, xpInto: remaining };
}

/** Ganho offline bruto (antes do teto). */
export function offlineRawProduction(energyPerSec: ReturnType<typeof D>, seconds: number, offlineMult: ReturnType<typeof D>): ReturnType<typeof D> {
  return energyPerSec.mul(seconds).mul(offlineMult);
}
