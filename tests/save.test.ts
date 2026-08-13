import { describe, expect, it } from 'vitest';
import { SaveManager } from '../src/save/saveManager';
import { GameEngine } from '../src/game/engine';
import { migrateSave } from '../src/save/migrations';
import { validateState } from '../src/save/validation';
import { SAVE_VERSION, type GameState } from '../src/game/types';
import { createInitialState } from '../src/game/initial';
import { D } from '../src/core/bignum';

describe('Save: roundtrip', () => {
  it('encode → decode preserva o estado', async () => {
    const e = new GameEngine();
    e.addRes('gold', D('12345678901234567890'));
    e.click('manual');
    e.state.name = 'Testador';
    const mgr = new SaveManager();
    const text = mgr.exportText(e);
    expect(text.startsWith('NC1.')).toBe(true);
    // reintegra via import
    const r = await mgr.importText('slot1', text);
    expect(r.ok).toBe(true);
  });
});

describe('Save: corrupção', () => {
  it('rejeita formato inválido', async () => {
    const mgr = new SaveManager();
    const r = await mgr.importText('slot1', 'lixo');
    expect(r.ok).toBe(false);
  });

  it('rejeita checksum adulterado', async () => {
    const e = new GameEngine();
    const mgr = new SaveManager();
    const text = mgr.exportText(e);
    // altera um caractere do conteúdo (fora do checksum)
    const altered = text.slice(0, -2) + (text.endsWith('AA') ? 'BB' : 'AA');
    const r = await mgr.importText('slot1', altered);
    expect(r.ok).toBe(false);
  });
});

describe('Save: isolamento por conta', () => {
  it('cada conta tem seu próprio mundo — trocar de conta não mistura nem reseta', async () => {
    const guest = new SaveManager();
    // mundo guest (sem conta)
    const g = new GameEngine();
    g.state.name = 'Guest';
    await guest.save(g);

    // conta Willzinn
    const willzinn = new SaveManager();
    willzinn.setAccountScope('Willzinn');
    const w = new GameEngine();
    w.state.name = 'Willzinn';
    w.addRes('gold', D('999999'));
    await willzinn.save(w);

    // conta CEO — deve começar ZERADA, sem nada do Willzinn
    const ceo = new SaveManager();
    ceo.setAccountScope('CEO');
    const c = await ceo.load('slot1');
    expect(c).toBeNull(); // mundo zerado (nunca jogou)
    const c2 = new GameEngine();
    c2.state.name = 'CEO';
    await ceo.save(c2);

    // voltando para Willzinn — o mundo DELE volta intacto
    const willzinnBack = new SaveManager();
    willzinnBack.setAccountScope('Willzinn');
    const wBack = await willzinnBack.load('slot1');
    expect(wBack).not.toBeNull();
    expect(wBack!.engine.state.name).toBe('Willzinn');
    expect(String(wBack!.engine.state.gold)).toBe('999999');

    // e o guest continua intacto também
    const guestBack = new SaveManager();
    const gBack = await guestBack.load('slot1');
    expect(gBack).not.toBeNull();
    expect(gBack!.engine.state.name).toBe('Guest');
  });
});

describe('Save: migração', () => {
  it('migra save v1 para a versão atual', () => {
    const v1: any = {
      schemaVersion: 1,
      name: 'Antigo',
      createdAt: Date.now(),
      lastSeen: Date.now(),
      playTimeSeconds: 100,
      energy: '1000',
      gold: '500',
      crystals: '10',
      fragments: '0',
      essence: '0',
      prestigeCoins: '0',
      ascensionCoins: '0',
      eventTokens: '0',
      level: 3,
      xp: '10',
      skillPoints: 2,
      upgrades: { click_power: 4 },
      generators: {},
      consumables: {},
      activeEffects: {},
      equipment: { eq_weapon_common: 1 },
      equipped: {},
      pets: { pet_fox: { level: 3, xp: '10', evolves: 0 } },
      petSlots: [null, null, null, null],
      boxes: { basic: 1 },
      boxHistory: [],
      skills: {},
      quests: { daily: [], weekly: [], permanent: [] },
      questDay: '2024-01-01',
      questWeek: '2024-W1',
      achievements: {},
      combo: { count: 0, lastClick: 0 },
      stats: {},
      flags: {},
    };
    const migrated = migrateSave(v1);
    expect(migrated.schemaVersion).toBe(SAVE_VERSION);
    expect(migrated.prestige).toBeDefined();
    expect(migrated.collection).toBeDefined();
    expect(migrated.collection.pets).toContain('pet_fox');
    expect(migrated.collection.equipment).toContain('eq_weapon_common');
    const { state } = validateState(migrated);
    expect(state.settings.notation).toBe('short');
    expect(state.upgrades.click_power).toBe(4);
  });
});

describe('Save: validação anti-corrupção', () => {
  it('corrige recursos inválidos', () => {
    const raw: any = createInitialState();
    raw.energy = 'NaN';
    raw.gold = '-50';
    raw.level = -5;
    raw.upgrades = { click_power: 99999, inexistente: 3 };
    raw.pets = { inexistente: { level: 1, xp: '0', evolves: 0 } };
    const { state, result } = validateState(raw);
    expect(state.energy).toBe('0');
    expect(state.gold).toBe('0');
    expect(state.level).toBe(1);
    expect(state.upgrades.click_power).toBe(200);
    expect(state.upgrades.inexistente).toBeUndefined();
    expect(state.pets.inexistente).toBeUndefined();
    expect(result.fixed.length).toBeGreaterThan(0);
  });

  it('rejeita estado não-objeto', () => {
    expect(() => validateState(null)).toThrow();
    expect(() => validateState('x')).toThrow();
  });

  it('preserva estado válido', () => {
    const e = new GameEngine();
    e.state.name = 'OK';
    const { state, result } = validateState(e.state);
    expect(state.name).toBe('OK');
    expect(result.fixed.length).toBe(0);
  });
});
