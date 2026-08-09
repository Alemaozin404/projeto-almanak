import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { UPGRADE_MAP } from '../src/shop/upgrades';
import { D } from '../src/core/bignum';

describe('Demanda de diamantes (loja)', () => {
  it('existem upgrades premium que custam diamantes (com custos atingíveis em todos os tiers)', () => {
    const crystalUpgrades = Object.values(UPGRADE_MAP).filter((u) => u.currency === 'crystals');
    expect(crystalUpgrades.length).toBeGreaterThanOrEqual(6);
    for (const u of crystalUpgrades) {
      const isBase = !/_t\d+$/.test(u.id);
      // preços caros: base exige 1-3 pacotes; tiers altos exigem pacotes maiores (induz gasto)
      if (isBase) expect(D(u.baseCost).lte(6000)).toBe(true);
      expect(D(u.baseCost).lte(150000)).toBe(true);
      expect(D(u.baseCost).gt(0)).toBe(true);
    }
  });

  it('compra upgrade premium gasta diamantes (não ouro)', () => {
    const e = new GameEngine();
    e.state.level = 20;
    e.addRes('crystals', D(5000));
    const id = 'diamond_power';
    expect(e.upgradeLevel(id)).toBe(0);
    const cost = e.upgradeCost(id);
    expect(D(cost).gt(0)).toBe(true);
    const r = e.buyUpgrade(id, 1);
    expect(r.ok).toBe(true);
    expect(e.upgradeLevel(id)).toBe(1);
    expect(D(e.state.crystals).eq(D(5000).sub(cost))).toBe(true);
  });

  it('sem diamantes, upgrade premium não pode ser comprado', () => {
    const e = new GameEngine();
    e.state.level = 20;
    const r = e.buyUpgrade('diamond_power', 1);
    expect(r.ok).toBe(false);
    expect(e.upgradeLevel('diamond_power')).toBe(0);
  });

  it('compra consumível premium gasta diamantes (preço caro de 400)', () => {
    const e = new GameEngine();
    e.state.level = 15;
    e.addRes('crystals', D(1000));
    const r = e.buyConsumable('diamond_click', 1);
    expect(r.ok).toBe(true);
    expect(e.consumableCount('diamond_click')).toBe(1);
    expect(D(e.state.crystals).eq(600)).toBe(true);
  });

  it('ultra crítico continua em diamantes com preço caro (6.000 💎)', () => {
    expect(UPGRADE_MAP.ultra_crit.currency).toBe('crystals');
    expect(D(UPGRADE_MAP.ultra_crit.baseCost).eq(6000)).toBe(true);
    // tier máximo com multiplicador gentil (×5) — 150.000 💎
    expect(UPGRADE_MAP.ultra_crit_t3.baseCost).toBe('150000');
  });
});
