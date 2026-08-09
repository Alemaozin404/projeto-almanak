import { describe, expect, it } from 'vitest';
import {
  upgradeCost, bulkCost, dynamicPrice, xpForLevel, petXpForLevel,
  prestigeFragments, prestigeCoinsGain, ascensionCoins, transcendenceEssence, levelFromXp,
} from '../src/economy/formulas';
import { D } from '../src/core/bignum';

describe('Fórmulas de custo', () => {
  it('custo exponencial: 100 × 1.5^n', () => {
    expect(upgradeCost(100, 1.5, 0).toString()).toBe('100');
    expect(upgradeCost(100, 1.5, 1).toString()).toBe('150');
    expect(upgradeCost(100, 1.5, 2).toString()).toBe('225');
    expect(upgradeCost(100, 1.5, 3).toString()).toBe('337.5');
  });

  it('custo em lote (série geométrica)', () => {
    // 100 + 150 + 225 = 475
    expect(bulkCost(100, 1.5, 0, 3).toString()).toBe('475');
  });

  it('preço dinâmico', () => {
    expect(dynamicPrice(10, 0).toString()).toBe('10');
    expect(dynamicPrice(10, 1).toString()).toBe('15');
    expect(dynamicPrice(10, 2).toString()).toBe('22.5');
  });
});

describe('Curva de XP', () => {
  it('cresce progressivamente', () => {
    const l1 = xpForLevel(1);
    const l10 = xpForLevel(10);
    const l50 = xpForLevel(50);
    expect(l10.gt(l1)).toBe(true);
    expect(l50.gt(l10)).toBe(true);
  });

  it('nível a partir do XP total', () => {
    const { level } = levelFromXp(0);
    expect(level).toBe(1);
    const need2 = xpForLevel(1);
    const lvl2 = levelFromXp(need2.plus(1));
    expect(lvl2.level).toBe(2);
    expect(lvl2.xpInto.toString()).toBe('1');
  });

  it('XP de pets cresce', () => {
    expect(petXpForLevel(10).gt(petXpForLevel(1))).toBe(true);
  });
});

describe('Prestígio / Ascensão / Transcendência', () => {
  it('não concede fragmentos abaixo do mínimo', () => {
    expect(prestigeFragments(100, 0).toString()).toBe('0');
  });

  it('concede fragmentos escalados pela energia', () => {
    const f = prestigeFragments('1e9', 0);
    expect(f.gt(D(0))).toBe(true);
    const more = prestigeFragments('1e12', 0);
    expect(more.gt(f)).toBe(true);
  });

  it('prestígios anteriores aumentam o ganho', () => {
    const f0 = prestigeFragments('1e9', 0);
    const f5 = prestigeFragments('1e9', 5);
    expect(f5.gt(f0)).toBe(true);
  });

  it('moedas de prestígio derivam dos fragmentos', () => {
    const f = D(120);
    expect(prestigeCoinsGain(f, 0).gt(D(0))).toBe(true);
  });

  it('ascensão exige fragmentos no ciclo', () => {
    expect(ascensionCoins(10, 0).toString()).toBe('0');
    expect(ascensionCoins(100, 0).gt(D(0))).toBe(true);
  });

  it('transcendência exige moedas no ciclo', () => {
    expect(transcendenceEssence(1, 0).toString()).toBe('0');
    expect(transcendenceEssence(10, 0).gt(D(0))).toBe(true);
  });
});
