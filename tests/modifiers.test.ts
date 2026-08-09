import { describe, expect, it } from 'vitest';
import { baseModifiers, mergeModifiers, pct, scaleModifiers, ADDITIVE_KEYS } from '../src/core/modifiers';
import { D } from '../src/core/bignum';

describe('Motor de modificadores', () => {
  it('multiplicativo: clique e produção multiplicam', () => {
    let b = baseModifiers();
    b = mergeModifiers(b, pct({ clickPower: 100 }));
    b = mergeModifiers(b, pct({ clickPower: 50 }));
    expect(b.clickPower.toString()).toBe('3'); // 1 × 2 × 1.5
  });

  it('aditivo: chance crítica soma', () => {
    let b = baseModifiers();
    expect(b.critChance.toString()).toBe('0.05');
    b = mergeModifiers(b, pct({ critChance: 10 })); // +10% = 0.1
    expect(b.critChance.toString()).toBe('0.15');
    b = mergeModifiers(b, pct({ critChance: 5 }));
    expect(b.critChance.toString()).toBe('0.2');
  });

  it('aditivo: duração e limite de combo somam', () => {
    let b = baseModifiers();
    b = mergeModifiers(b, { comboDuration: D(2) });
    expect(b.comboDuration.toString()).toBe('5');
    b = mergeModifiers(b, { comboCap: D(5) });
    expect(b.comboCap.toString()).toBe('105');
  });

  it('escala por nível (pets/equipamentos)', () => {
    const base = pct({ clickPower: 60, critChance: 3 });
    const scaled = scaleModifiers(base, 3);
    expect(scaled.clickPower!.toString()).toBe('2.8'); // 1 + (1.6-1)*3
    expect(scaled.critChance!.toString()).toBe('0.09'); // 0.03*3
  });

  it('chaves aditivas definidas corretamente', () => {
    expect(ADDITIVE_KEYS.has('critChance')).toBe(true);
    expect(ADDITIVE_KEYS.has('comboDuration')).toBe(true);
    expect(ADDITIVE_KEYS.has('clickPower')).toBe(false);
  });
});
