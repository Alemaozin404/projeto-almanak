import Decimal from 'decimal.js';

/**
 * Sistema BigNumber — suporta números arbitrariamente grandes (1e1000+).
 * Baseado em decimal.js. Todos os valores de recurso do jogo passam por aqui.
 */
Decimal.set({
  precision: 80,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 21,
});

export type Num = Decimal.Value;

/** Converte qualquer valor em Decimal. Nunca lança: valores inválidos viram 0. */
export function D(v: Num = 0): Decimal {
  try {
    return new Decimal(v);
  } catch {
    return new Decimal(0);
  }
}

export const ZERO = D(0);
export const ONE = D(1);
export const TWO = D(2);
export const TEN = D(10);
export const HUNDRED = D(100);

export function isFiniteDecimal(v: Num): boolean {
  try {
    const d = new Decimal(v);
    return d.isFinite() && !d.isNaN();
  } catch {
    return false;
  }
}

/** Número inteiro como Decimal (floor). */
export function floorInt(d: Decimal): Decimal {
  return d.floor();
}

export function clampNum(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function strOr(v: unknown, fallback = '0'): string {
  if (typeof v === 'string' && isFiniteDecimal(v)) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return fallback;
}

export function decToString(d: Decimal): string {
  // string canônica sem expoente e sem zeros à direita (quando inteiro)
  if (d.isInteger()) return d.toFixed(0);
  return d.toFixed(4).replace(/\.?0+$/, '');
}
