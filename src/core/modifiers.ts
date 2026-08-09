import { D, ONE } from './bignum';
import type { ModifierSet } from '../game/types';

export type PartialModifiers = Partial<ModifierSet>;

/**
 * Chaves ADITIVAS: o valor parcial é somado à base (ex.: chance crítica 0.05 + 0.01).
 * Demais chaves são MULTIPLICATIVAS: o valor parcial é multiplicado (fatores).
 */
export const ADDITIVE_KEYS = new Set<string>([
  'critChance',
  'superCritChance',
  'megaCritChance',
  'ultraCritChance',
  'comboDuration',
  'comboCap',
  'energyPerClick',
  'dropChance',
  'eventTokenChance',
]);

/** Valores base — tudo começa em 1 (multiplicativo) ou no valor aditivo base. */
export function baseModifiers(): ModifierSet {
  return {
    clickPower: ONE,
    critChance: D(0.05),
    critDamage: D(2),
    superCritChance: D(0),
    megaCritChance: D(0),
    ultraCritChance: D(0),
    production: ONE,
    goldGain: ONE,
    xpGain: ONE,
    petPower: ONE,
    luck: ONE,
    comboDuration: D(3),
    comboCap: D(100),
    prestigeGain: ONE,
    dropChance: D(0.12),
    petFind: ONE,
    autoClickSpeed: ONE,
    energyPerClick: D(0),
    discounts: ONE,
    eventTokenChance: D(0.0002),
  };
}

/** Mescla modificadores parciais (multiplicando fatores / somando aditivos). */
export function mergeModifiers(base: ModifierSet, part: PartialModifiers): ModifierSet {
  const out = { ...base };
  (Object.keys(part) as (keyof ModifierSet)[]).forEach((k) => {
    const v = part[k];
    if (v === undefined) return;
    out[k] = ADDITIVE_KEYS.has(k) ? base[k].plus(v) : base[k].mul(v);
  });
  return out;
}

/**
 * Escala um conjunto parcial por um multiplicador de nível (pets/equipamentos).
 * Aditivos escalam o delta; multiplicativos escalam o excedente (x-1).
 */
export function scaleModifiers(part: PartialModifiers, mult: number): PartialModifiers {
  const out: PartialModifiers = {};
  for (const k of Object.keys(part) as (keyof ModifierSet)[]) {
    const v = part[k];
    if (v === undefined) continue;
    out[k] = ADDITIVE_KEYS.has(k) ? v.mul(mult) : ONE.plus(v.minus(1).mul(mult));
  }
  return out;
}

/** Combina vários conjuntos parciais em um só (multiplicativo). */
export function combineModifiers(...parts: PartialModifiers[]): ModifierSet {
  let acc = baseModifiers();
  for (const p of parts) acc = mergeModifiers(acc, p);
  return acc;
}

/** Cria um parcial com multiplicadores percentuais (+100% = fator 2). */
export function pct(parts: {
  clickPower?: number; production?: number; goldGain?: number; xpGain?: number;
  critChance?: number; critDamage?: number; petPower?: number; luck?: number;
  autoClickSpeed?: number; prestigeGain?: number; petFind?: number;
  dropChance?: number; eventTokenChance?: number; discounts?: number;
  superCritChance?: number; megaCritChance?: number; ultraCritChance?: number;
  energyPerClick?: number;
}): PartialModifiers {
  const out: PartialModifiers = {};
  if (parts.clickPower !== undefined) out.clickPower = D(1 + parts.clickPower / 100);
  if (parts.production !== undefined) out.production = D(1 + parts.production / 100);
  if (parts.goldGain !== undefined) out.goldGain = D(1 + parts.goldGain / 100);
  if (parts.xpGain !== undefined) out.xpGain = D(1 + parts.xpGain / 100);
  if (parts.critChance !== undefined) out.critChance = D(parts.critChance / 100);
  if (parts.critDamage !== undefined) out.critDamage = D(1 + parts.critDamage / 100);
  if (parts.petPower !== undefined) out.petPower = D(1 + parts.petPower / 100);
  if (parts.luck !== undefined) out.luck = D(1 + parts.luck / 100);
  if (parts.autoClickSpeed !== undefined) out.autoClickSpeed = D(1 + parts.autoClickSpeed / 100);
  if (parts.prestigeGain !== undefined) out.prestigeGain = D(1 + parts.prestigeGain / 100);
  if (parts.petFind !== undefined) out.petFind = D(1 + parts.petFind / 100);
  if (parts.dropChance !== undefined) out.dropChance = D(parts.dropChance / 100);
  if (parts.eventTokenChance !== undefined) out.eventTokenChance = D(parts.eventTokenChance / 100);
  if (parts.discounts !== undefined) out.discounts = D(1 + parts.discounts / 100);
  if (parts.superCritChance !== undefined) out.superCritChance = D(parts.superCritChance / 100);
  if (parts.megaCritChance !== undefined) out.megaCritChance = D(parts.megaCritChance / 100);
  if (parts.ultraCritChance !== undefined) out.ultraCritChance = D(parts.ultraCritChance / 100);
  if (parts.energyPerClick !== undefined) out.energyPerClick = D(parts.energyPerClick);
  return out;
}
