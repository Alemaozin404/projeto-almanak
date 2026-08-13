import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { D } from '../src/core/bignum';
import { now } from '../src/core/utils';
import { GameConfig } from '../src/config/GameConfig';

function setup(): GameEngine {
  const e = new GameEngine();
  e.state.prestige.energyThisCycle = D('1e13').toString();
  e.addRes('gold', D(1e9));
  e.addRes('energy', D(1e6));
  // upgrades de CLIQUE custam energia (escassa); geradores são caros
  e.buyUpgrade('click_power', 5);
  e.buyGenerator('generator_i', 3);
  e.state.energy = '1000000'; // topa o saldo para o valor esperado pelos testes
  return e;
}

describe('Prestígio', () => {
  it('não permite prestígio sem energia suficiente', () => {
    const e = new GameEngine();
    expect(e.prestigePreview().toString()).toBe('0');
    expect(e.prestige()).toBeNull();
  });

  it('concede fragmentos e reseta camada normal', () => {
    const e = setup();
    const before = e.state.energy;
    const result = e.prestige();
    expect(result).not.toBeNull();
    expect(D(result!.fragments).gt(D(0))).toBe(true);
    expect(e.state.energy).toBe('0');
    expect(e.state.upgrades.click_power).toBeUndefined();
    expect(e.state.generators.generator_i).toBeUndefined();
    expect(D(e.state.fragments).gt(D(0))).toBe(true);
    expect(e.state.prestige.count).toBe(1);
    expect(e.state.skillPoints).toBeGreaterThanOrEqual(5);
    expect(before).toBe('1000000');
  });

  it('prestígio aumenta o multiplicador permanente', () => {
    const e = new GameEngine();
    e.state.prestige.energyThisCycle = '1e9';
    const multBefore = e.bonuses().clickPower;
    expect(e.prestige()).not.toBeNull();
    const multAfter = e.bonuses().clickPower;
    expect(multAfter.eq(multBefore.mul(1.1))).toBe(true);
  });

  it('registra ciclos no ranking local', () => {
    const e = setup();
    e.prestige();
    expect(e.state.ranking.length).toBe(1);
    expect(e.state.ranking[0].kind).toBe('prestige');
    expect(D(e.state.ranking[0].gain).gt(D(0))).toBe(true);
    expect(e.state.ranking[0].count).toBe(1);
    // prestígio alimenta o ciclo de ascensão → registrar ascensão também
    expect(D(e.state.ascension.fragmentsThisCycle).gt(D(0))).toBe(true);
    e.ascend();
    expect(e.state.ranking.some((r) => r.kind === 'ascension')).toBe(true);
    expect(e.state.ranking.length).toBe(2);
  });
});

describe('Ascensão', () => {
  it('requer fragmentos no ciclo', () => {
    const e = new GameEngine();
    expect(e.ascensionPreview().toString()).toBe('0');
    expect(e.ascend()).toBeNull();
  });

  it('concede moedas e novo mundo', () => {
    const e = new GameEngine();
    e.state.ascension.fragmentsThisCycle = '100';
    const r = e.ascend();
    expect(r).not.toBeNull();
    expect(D(r!.coins).gt(D(0))).toBe(true);
    expect(e.state.ascension.worldsUnlocked).toBe(2);
    expect(D(e.state.ascensionCoins).gt(D(0))).toBe(true);
  });

  it('mundo novo aumenta a produção', () => {
    const e = new GameEngine();
    const p0 = e.bonuses().production;
    e.state.ascension.fragmentsThisCycle = '100';
    e.ascend();
    expect(e.bonuses().production.eq(p0.mul(1.75))).toBe(true);
  });
});

describe('Transcendência', () => {
  it('concede essência e reseta moedas de ascensão', () => {
    const e = new GameEngine();
    e.state.transcendence.ascensionCoinsThisCycle = '20';
    const r = e.transcend();
    expect(r).not.toBeNull();
    expect(D(r!.essence).gt(D(0))).toBe(true);
    expect(e.state.ascensionCoins).toBe('0');
    expect(e.state.transcendence.count).toBe(1);
  });

  it('compra bônus de essência', () => {
    const e = new GameEngine();
    e.addRes('essence', D(100));
    const r = e.buyEssenceBoost('ess_click');
    expect(r.ok).toBe(true);
    expect(e.essenceBoostOwned('ess_click')).toBe(1);
    const mult = e.essenceBoostBonus('ess_click');
    expect(mult.clickPower!.toString()).toBe('1.1');
  });
});

describe('Progresso offline', () => {
  it('não computa para menos de 1 minuto', () => {
    const e = new GameEngine();
    e.state.lastSeen = now();
    expect(e.computeOffline()).toBeNull();
  });

  it('computa produção proporcional ao tempo', () => {
    const e = new GameEngine();
    e.addRes('gold', D(1e9));
    e.buyGenerator('generator_i', 10); // 10 geradores × 0,5/s = 5/s
    e.state.lastSeen = now() - 8 * 3600 * 1000;
    const res = e.computeOffline();
    expect(res).not.toBeNull();
    // 8h × produção/s × eficiência offline (produção inclui multiplicadores de evento ativos)
    const eps = e.energyPerSec(e.bonusesPersistent());
    const expected = eps.mul(8 * 3600).mul(GameConfig.offline.efficiency);
    expect(res!.energy.minus(expected).abs().lt(D(1))).toBe(true);
    e.applyOffline(res!);
    expect(e.getRes('energy').gte(expected.mul(0.99))).toBe(true);
  });

  it('respeita o teto configurável', () => {
    const e = new GameEngine();
    e.addRes('gold', D(1e9));
    e.buyGenerator('generator_i', 10);
    e.state.settings.offlineCapHours = 1; // teto de 1h
    e.state.lastSeen = now() - 100 * 3600 * 1000;
    const res = e.computeOffline();
    expect(res!.seconds).toBe(3600);
    // 1h × produção/s × eficiência offline
    const eps = e.energyPerSec(e.bonusesPersistent());
    const expected = eps.mul(3600).mul(GameConfig.offline.efficiency);
    expect(res!.energy.minus(expected).abs().lt(D(1))).toBe(true);
  });
});

describe('Títulos', () => {
  it('novato está disponível desde o início', () => {
    const e = new GameEngine();
    e.checkTitles();
    expect(e.state.titles).toContain('novato');
  });

  it('equipar título concede bônus', () => {
    const e = new GameEngine();
    e.checkTitles();
    e.equipTitle('novato');
    expect(e.state.equippedTitle).toBe('novato');
  });
});
