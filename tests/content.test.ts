import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { D } from '../src/core/bignum';
import { PET_MAP, PET_DEFS } from '../src/pets/pets';
import { BOX_DEFS, rollBoxType, boxOddsText } from '../src/shop/boxes';
import { RARITIES } from '../src/core/rarities';
import { QUEST_DEFS, rollDailyQuests, questProgress } from '../src/quests/quests';
import { ACHIEVEMENTS, isAchievementUnlocked } from '../src/achievements/achievements';
import { SKILL_NODES } from '../src/progression/skillTree';
import { UPGRADE_DEFS } from '../src/shop/upgrades';
import { EQUIPMENT_DEFS } from '../src/shop/equipment';
import { activeEvents, debugEventOverrides, eventById } from '../src/events/events';
import { TITLES } from '../src/progression/titles';

describe('Conteúdo', () => {
  it('mais de 100 upgrades', () => {
    expect(UPGRADE_DEFS.length).toBeGreaterThan(100);
  });

  it('dezenas de pets em todas as raridades', () => {
    expect(PET_DEFS.length).toBeGreaterThan(50);
    for (const r of Object.keys(RARITIES)) {
      expect(PET_DEFS.some((p) => p.rarity === r)).toBe(true);
    }
    // ícones e nomes válidos
    for (const p of PET_DEFS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.icon.length).toBeGreaterThan(0);
    }
  });

  it('equipamentos em todos os slots e raridades', () => {
    expect(Object.keys(EQUIPMENT_DEFS).length).toBe(7 * 9);
  });

  it('caixas têm probabilidades que somam 100%', () => {
    for (const box of BOX_DEFS) {
      const total = Object.values(box.rarityWeights).reduce((a, b) => a + b, 0);
      expect(total).toBeGreaterThan(0);
      expect(boxOddsText(box).length).toBeGreaterThan(0);
      const types = Object.values(box.typeWeights).reduce((a, b) => a + b, 0);
      expect(types).toBe(100);
    }
  });

  it('abrir caixa concede itens', () => {
    const e = new GameEngine();
    e.state.boxes.basic = 5;
    const results = e.openBox('basic', 5);
    expect(results).not.toBeNull();
    expect(results!.length).toBe(5);
    expect(e.boxCount('basic')).toBe(0);
    expect(D(e.state.stats.boxesOpened).eq(5)).toBe(true);
  });

  it('abrir caixa com pet novo registra coleção', () => {
    const e = new GameEngine();
    e.state.boxes.basic = 50;
    e.openBox('basic', 50);
    expect(e.state.collection.pets.length).toBeGreaterThan(0);
  });

  it('duplicata de pet vira XP', () => {
    const e = new GameEngine();
    const pet = PET_DEFS[0];
    e.grantPet(pet.id);
    const lvl = e.state.pets[pet.id].level;
    e.grantPet(pet.id);
    expect(e.state.pets[pet.id].level).toBeGreaterThanOrEqual(lvl);
    expect(D(e.state.pets[pet.id].xp).gt(D(0))).toBe(true);
  });

  it('pet evolui e vende', () => {
    const e = new GameEngine();
    const pet = PET_DEFS.find((p) => p.evolves)!;
    e.grantPet(pet.id);
    e.state.pets[pet.id].level = 20;
    e.addRes('gold', D(1e9));
    const r = e.evolvePet(pet.id);
    expect(r.ok).toBe(true);
    expect(e.state.pets[pet.id].evolves).toBe(1);
    const sell = e.sellPet(pet.id);
    expect(sell.ok).toBe(true);
    expect(e.state.pets[pet.id]).toBeUndefined();
  });
});

describe('Missões', () => {
  it('permanentes cobrem todas as categorias', () => {
    const perm = QUEST_DEFS.filter((q) => q.category === 'permanente');
    expect(perm.length).toBeGreaterThan(20);
  });

  it('progresso deriva das estatísticas', () => {
    const e = new GameEngine();
    e.click('manual');
    const def = QUEST_DEFS.find((q) => q.source === 'clicks')!;
    expect(questProgress(e.state, def).toString()).toBe('1');
  });

  it('reivindicar missão completa concede recompensa', () => {
    const e = new GameEngine();
    // força uma missão diária completa: usa snapshot antigo
    e.state.quests.daily = [];
    const def = QUEST_DEFS.find((q) => q.source === 'clicks' && q.category === 'diaria')!;
    e.state.quests.daily.push({ id: def.id, progress: '-1000', claimed: false });
    const goldBefore = e.getRes('gold');
    const r = e.claimQuest('daily', 0);
    expect(r.ok).toBe(true);
    expect(e.getRes('gold').gt(goldBefore)).toBe(true);
  });

  it('não reivindica missão incompleta', () => {
    const e = new GameEngine();
    const r = e.claimQuest('permanent', 0);
    expect(r.ok).toBe(false);
  });
});

describe('Conquistas', () => {
  it('primeiro clique desbloqueia conquista', () => {
    const e = new GameEngine();
    e.click('manual');
    e.checkAchievements();
    expect(e.state.achievements.a_click1).toBeDefined();
    expect(D(e.state.stats.achievementsUnlocked).gt(D(0))).toBe(true);
  });

  it('conquistas secretas existem', () => {
    const secrets = ACHIEVEMENTS.filter((a) => a.secret);
    expect(secrets.length).toBeGreaterThan(3);
  });

  it('condições são verificáveis', () => {
    const e = new GameEngine();
    expect(isAchievementUnlocked(e.state, ACHIEVEMENTS[0])).toBe(false);
  });
});

describe('Habilidades', () => {
  it('todos os nós têm custo e efeito', () => {
    expect(SKILL_NODES.length).toBeGreaterThan(15);
    for (const n of SKILL_NODES) {
      expect(n.cost(0)).toBeGreaterThan(0);
      expect(n.effectDesc(1)).toBeTruthy();
    }
  });
});

describe('Eventos', () => {
  it('demo sempre ativo', () => {
    const actives = activeEvents(new Date(2026, 5, 15), true);
    expect(actives.some((e) => e.id === 'demo')).toBe(true);
  });

  it('natal ativo em dezembro', () => {
    const actives = activeEvents(new Date(2026, 11, 25), true);
    expect(actives.some((e) => e.id === 'natal')).toBe(true);
    const off = activeEvents(new Date(2026, 5, 15), true);
    expect(off.some((e) => e.id === 'natal')).toBe(false);
  });

  it('debug override ativa evento fora da janela', () => {
    debugEventOverrides.add('halloween');
    const actives = activeEvents(new Date(2026, 5, 15), true);
    expect(actives.some((e) => e.id === 'halloween')).toBe(true);
    debugEventOverrides.clear();
  });

  it('comprar item de evento usa a moeda do evento', () => {
    const e = new GameEngine();
    const ev = eventById('demo')!;
    const st = e.eventState(ev);
    st.tokens = '1000';
    const item = ev.shop[0];
    const r = e.buyEventItem('demo', item.id);
    expect(r.ok).toBe(true);
    expect(st.tokens).toBe((1000 - Number(item.cost)).toString());
  });

  it('recusa compra sem moeda do evento', () => {
    const e = new GameEngine();
    const r = e.buyEventItem('demo', 'demo_title');
    expect(r.ok).toBe(false);
  });
});

describe('Títulos', () => {
  it('títulos têm condições válidas', () => {
    expect(TITLES.length).toBeGreaterThan(10);
    for (const t of TITLES) {
      expect(typeof t.check).toBe('function');
    }
  });
});
