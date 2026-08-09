import { describe, expect, it } from 'vitest';
import { D, isFiniteDecimal } from '../src/core/bignum';
import { formatNumber, formatFull, formatDuration } from '../src/core/notation';

describe('BigNumber', () => {
  it('converte valores básicos', () => {
    expect(D(0).toString()).toBe('0');
    expect(D('123').toString()).toBe('123');
    expect(D(-5).toString()).toBe('-5');
  });

  it('suporta números gigantes', () => {
    const big = D('1e100');
    expect(big.e).toBe(100);
    const huge = D('1e1000');
    expect(huge.e).toBe(1000);
    expect(D('9.9e999').gt(D('1e999'))).toBe(true);
  });

  it('operações de precisão', () => {
    const a = D('12345678901234567890');
    expect(a.plus(D('1')).toString()).toBe('12345678901234567891');
    // 1.2345...e19 × 1e30 → expoente 49
    expect(a.mul(D('1e30')).e).toBe(49);
  });

  it('isFiniteDecimal detecta inválidos', () => {
    expect(isFiniteDecimal('123')).toBe(true);
    expect(isFiniteDecimal('NaN')).toBe(false);
    expect(isFiniteDecimal('abc')).toBe(false);
    expect(isFiniteDecimal(undefined)).toBe(false);
  });
});

describe('Notação', () => {
  it('formata pequenos números com separadores', () => {
    expect(formatNumber(1000000, 'standard')).toBe('1.000.000');
    expect(formatNumber(1234, 'standard')).toBe('1.234');
  });

  it('formata curto (K/M/B/T...)', () => {
    expect(formatNumber(1500, 'short')).toBe('1.5K');
    expect(formatNumber(2500000, 'short')).toBe('2.5M');
    expect(formatNumber(1e12, 'short')).toBe('1T');
    expect(formatNumber(123456789, 'short', { digits: 1 })).toBe('123.5M');
  });

  it('formata científica', () => {
    expect(formatNumber('1e30', 'scientific')).toBe('1e30');
    expect(formatNumber('2.5e15', 'scientific')).toBe('2.5e15');
  });

  it('formata expoentes além da lista de sufixos', () => {
    // 1e400 está além dos sufixos disponíveis → cai em notação científica
    const out = formatNumber('1e400', 'short');
    expect(out).toContain('e400');
  });

  it('formato completo para tooltips', () => {
    expect(formatFull('1234567')).toBe('1.234.567');
    expect(formatFull('1e40')).toContain('10^');
  });

  it('duração legível', () => {
    expect(formatDuration(30605)).toBe('8h 30m 5s');
    expect(formatDuration(90)).toBe('1m 30s');
  });
});
