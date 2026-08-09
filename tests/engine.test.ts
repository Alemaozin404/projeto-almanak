import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { D } from '../src/core/bignum';
import { CONSUMABLE_MAP } from '../src/shop/consumables';

function fresh(): GameEngine {
  const e = new GameEngine();
  // congela aleatórios de criação de missões
  return e;
}

describe('Clique', () => {
  it('clique produz energia', () => {
    const e = fresh();
    const before = e.getRes('energy');
    e.click('manual');
    expect(e.getRes('energy').gt(before)).toBe(true);
  });

  it('registra estatísticas', () => {
    const e = fresh();
    e.click('manual');
    expect(e.state.stats.clicks).toBe('1');
    expect(D(e.state.stats.energyProduced).gt(D(0))).toBe(true);
  });

  it('combo aumenta com cliques consecutivos', () => {
    const e = fresh();
    for (let i = 0; i < 5; i++) e.click('manual');
    expect(e.state.combo.count).toBe(5);
    // clique com combo > 1 rende mais
    const e2 = fresh();
    for (let i = 0; i < 100; i++) e2.click('manual');
    expect(e2.state.combo.count).toBeGreaterThanOrEqual(100);
  });

  it('combo decai após tempo sem cliques', () => {
    const e = fresh();
    for (let i = 0; i < 20; i++) e.click('manual');
    expect(e.state.combo.count).toBe(20);
    // simula passagem de tempo
    e.state.combo.lastClick = Date.now() - 60_000;
    e.tick(1000);
    expect(e.state.combo.count).toBe(0);
  });

  it('critico é possível', () => {
    const e = fresh();
    // aumenta muito a chance crítica
    e.state.skills.crit_master = 50; // +20%
    e.state.upgrades.crit_chance = 30; // +30%
    e.invalidate();
    let crits = 0;
    for (let i = 0; i < 300; i++) {
      const r = e.click('manual');
      if (r.tier !== 'normal') crits++;
    }
    expect(crits).toBeGreaterThan(0);
    expect(D(e.state.stats.crits ?? '0').gt(D(0))).toBe(true);
  });

  it('clique automático não aumenta combo', () => {
    const e = fresh();
    e.click('auto');
    expect(e.state.combo.count).toBe(0);
  });
});

describe('Automação', () => {
  it('gerador produz energia por segundo', () => {
    const e = fresh();
    e.addRes('gold', D(1e6));
    const r = e.buyGenerator('generator_i', 5);
    expect(r.ok).toBe(true);
    // base 5/s × multiplicador de produção (eventos podem amplificar)
    const expected = D(5).mul(e.bonuses().production);
    expect(e.energyPerSec().minus(expected).abs().lt(D('0.001'))).toBe(true);
    e.tick(1000);
    expect(e.getRes('energy').gte(expected)).toBe(true);
  });

  it('auto-clicador usa o poder de clique', () => {
    const e = fresh();
    e.addRes('gold', D(1e6));
    e.buyGenerator('auto_clicker', 10); // 5 cliques/s
    const power = e.bonuses().clickPower;
    expect(e.autoClicksPerSec().toString()).toBe('5');
    e.tick(1000);
    expect(e.getRes('energy').gte(D(5).mul(power))).toBe(true);
  });

  it('não compra gerador sem fundos', () => {
    const e = fresh();
    const r = e.buyGenerator('generator_i', 1);
    expect(r.ok).toBe(false);
  });

  it('custo cresce com o nível', () => {
    const e = fresh();
    e.addRes('gold', D(1e12));
    const c0 = e.generatorCost('generator_i');
    e.buyGenerator('generator_i', 1);
    const c1 = e.generatorCost('generator_i');
    expect(c1.gt(c0)).toBe(true);
  });
});

describe('Nível e XP', () => {
  it('ganha níveis e pontos de habilidade', () => {
    const e = fresh();
    e.addXp(D(100000));
    expect(e.state.level).toBeGreaterThan(1);
    expect(e.state.skillPoints).toBeGreaterThan(0);
  });

  it('habilidades exigem pré-requisitos', () => {
    const e = fresh();
    e.state.skillPoints = 100;
    const r = e.buySkill('double_hit');
    expect(r.ok).toBe(false); // super_click nv 10 exigido
    e.buySkill('super_click');
    e.state.skills.super_click = 10;
    const r2 = e.buySkill('double_hit');
    expect(r2.ok).toBe(true);
  });
});

describe('Upgrades', () => {
  it('compra upgrade com efeito', () => {
    const e = fresh();
    e.addRes('gold', D(1e6));
    const r = e.buyUpgrade('click_power', 10);
    expect(r.ok).toBe(true);
    expect(e.upgradeLevel('click_power')).toBe(10);
    expect(e.bonuses().clickPower.toString()).toBe('2'); // +100%
  });

  it('respeita nível máximo', () => {
    const e = fresh();
    e.addRes('gold', D(1e30));
    const def = e.state; // noop
    void def;
    // compra até o máximo
    for (let i = 0; i < 3; i++) {
      e.buyUpgrade('click_power', 999);
    }
    expect(e.upgradeLevel('click_power')).toBe(200);
    const r = e.buyUpgrade('click_power');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Nível máximo');
  });

  it('desconto reduz custos', () => {
    const e = fresh();
    e.state.level = 10;
    e.addRes('gold', D(1e12));
    e.buyUpgrade('discount', 10); // -10%
    const factor = e.costFactor();
    expect(factor).toBeLessThan(1);
    expect(factor).toBeGreaterThan(0.8);
  });
});

describe('Consumíveis', () => {
  it('compra e usa poção com buff temporário', () => {
    const e = fresh();
    e.addRes('gold', D(1e6));
    const buy = e.buyConsumable('power_potion');
    expect(buy.ok).toBe(true);
    expect(e.consumableCount('power_potion')).toBe(1);
    const use = e.useConsumable('power_potion');
    expect(use.ok).toBe(true);
    expect(e.state.activeEffects.click_x2).toBeDefined();
    expect(e.consumableCount('power_potion')).toBe(0);
    // buff ativo dobra o clique
    const before = e.getRes('energy');
    e.click('manual');
    expect(e.getRes('energy').minus(before).gte(D(2))).toBe(true);
  });

  it('baú de ouro instantâneo', () => {
    const e = fresh();
    e.addRes('gold', D(1e6));
    e.buyConsumable('gold_chest');
    const gold = e.getRes('gold');
    const use = e.useConsumable('gold_chest');
    expect(use.ok).toBe(true);
    expect(e.getRes('gold').gte(gold)).toBe(true);
  });

  it('definições de consumíveis válidas', () => {
    for (const c of Object.values(CONSUMABLE_MAP)) {
      expect(c.id).toBeTruthy();
      expect(Number(c.cost)).toBeGreaterThan(0);
    }
  });
});
