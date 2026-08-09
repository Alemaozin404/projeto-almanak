import { D } from '../core/bignum';
import type { GameState } from '../game/types';
import { PET_MAP } from '../pets/pets';

export interface AchievementDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  secret?: boolean;
  reward: {
    gold?: string;
    fragments?: string;
    ascensionCoins?: string;
    essence?: string;
    boxes?: Record<string, number>;
    skillPoints?: number;
    title?: string;
  };
  stat?: string;
  target?: string;
  check?: (state: GameState) => boolean;
}

function statGte(state: GameState, key: string, target: string): boolean {
  return D(state.stats[key] ?? '0').gte(D(target));
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'a_click1', name: 'Primeiro Clique', icon: '🖱️', desc: 'Clique pela primeira vez.', reward: {}, stat: 'clicks', target: '1' },
  { id: 'a_click100', name: '100 Cliques', icon: '👆', desc: 'Clique 100 vezes.', reward: {}, stat: 'clicks', target: '100' },
  { id: 'a_click10k', name: '10.000 Cliques', icon: '⚡', desc: 'Clique 10.000 vezes.', reward: {}, stat: 'clicks', target: '10000' },
  { id: 'a_click1m', name: '1 Milhão de Cliques', icon: '🔥', desc: 'Clique 1 milhão de vezes.', reward: {}, stat: 'clicks', target: '1000000' },
  { id: 'a_click100m', name: '100 Milhões de Cliques', icon: '💫', desc: 'Clique 100 milhões de vezes.', reward: {}, stat: 'clicks', target: '100000000' },
  { id: 'a_click1b', name: 'Bilionário de Cliques', icon: '🌌', desc: 'Clique 1 bilhão de vezes.', reward: { title: 'Sem Limites' }, stat: 'clicks', target: '1000000000' },
  { id: 'a_crit1', name: 'Primeiro Crítico', icon: '🎯', desc: 'Acerta um acerto crítico.', reward: {}, stat: 'crits', target: '1' },
  { id: 'a_crit1k', name: 'Crítico em Série', icon: '💥', desc: 'Acumule 1.000 críticos.', reward: {}, stat: 'crits', target: '1000' },
  { id: 'a_energy1k', name: 'Centelha', icon: '⚡', desc: 'Produza 1.000 de energia.', reward: {}, stat: 'energyProduced', target: '1000' },
  { id: 'a_energy1m', name: 'Milionário de Energia', icon: '🔋', desc: 'Produza 1 milhão de energia.', reward: {}, stat: 'energyProduced', target: '1000000' },
  { id: 'a_energy1b', name: 'Bilionário de Energia', icon: '🏭', desc: 'Produza 1 bilhão de energia.', reward: {}, stat: 'energyProduced', target: '1000000000' },
  { id: 'a_energy1t', name: 'Trilionário de Energia', icon: '🪐', desc: 'Produza 1 trilhão de energia.', reward: { title: 'Lenda' }, stat: 'energyProduced', target: '1e12' },
  { id: 'a_gold100', name: 'Primeiras Moedas', icon: '🪙', desc: 'Ganhe 25 de ouro.', reward: {}, stat: 'goldEarned', target: '25' },
  { id: 'a_gold1m', name: 'Milionário', icon: '💰', desc: 'Ganhe 250 mil de ouro.', reward: {}, stat: 'goldEarned', target: '250000' },
  { id: 'a_gold1b', name: 'Bilionário', icon: '💵', desc: 'Ganhe 250 milhões de ouro.', reward: {}, stat: 'goldEarned', target: '250000000' },
  { id: 'a_gold1t', name: 'Magnata', icon: '👑', desc: 'Ganhe 250 bilhões de ouro.', reward: { title: 'Magnata' }, stat: 'goldEarned', target: '250000000000' },
  { id: 'a_upgrades1', name: 'Primeiro Upgrade', icon: '⬆️', desc: 'Compre seu primeiro upgrade.', reward: {}, stat: 'upgradesBought', target: '1' },
  { id: 'a_upgrades50', name: 'Melhorador', icon: '📈', desc: 'Compre 50 upgrades.', reward: {}, stat: 'upgradesBought', target: '50' },
  { id: 'a_upgrades500', name: 'Fábrica de Melhorias', icon: '🏗️', desc: 'Compre 500 upgrades.', reward: {}, stat: 'upgradesBought', target: '500' },
  { id: 'a_gen10', name: 'Engenheiro', icon: '🛠️', desc: 'Compre 10 geradores.', reward: {}, stat: 'generatorsBought', target: '10' },
  { id: 'a_gen100', name: 'Industrial', icon: '🏭', desc: 'Compre 100 geradores.', reward: {}, stat: 'generatorsBought', target: '100' },
  { id: 'a_box1', name: 'Primeira Caixa', icon: '📦', desc: 'Abra sua primeira caixa.', reward: {}, stat: 'boxesOpened', target: '1' },
  { id: 'a_box25', name: 'Apostador', icon: '🎲', desc: 'Abra 25 caixas.', reward: {}, stat: 'boxesOpened', target: '25' },
  { id: 'a_box250', name: 'Colecionador de Caixas', icon: '🗃️', desc: 'Abra 250 caixas.', reward: {}, stat: 'boxesOpened', target: '250' },
  { id: 'a_pet1', name: 'Primeiro Pet', icon: '🐾', desc: 'Encontre seu primeiro pet.', reward: {}, stat: 'petsFound', target: '1' },
  { id: 'a_pet10', name: 'Amante dos Pets', icon: '🐕', desc: 'Encontre 10 pets diferentes.', reward: {}, stat: 'petsFound', target: '10' },
  { id: 'a_pet50', name: 'Mestre dos Pets', icon: '🐉', desc: 'Encontre 50 pets diferentes.', reward: {}, stat: 'petsFound', target: '50' },
  { id: 'a_pet150', name: 'Jardim Zoológico', icon: '🦁', desc: 'Encontre 150 pets diferentes.', reward: { title: 'Caçador de Pets' }, stat: 'petsFound', target: '150' },
  { id: 'a_petlvl10', name: 'Criador', icon: '🌱', desc: 'Suba um pet ao nível 10.', check: (s) => Object.values(s.pets).some((p) => p.level >= 10), reward: {} },
  { id: 'a_petlvl50', name: 'Criador Mestre', icon: '🌟', desc: 'Suba um pet ao nível 50.', check: (s) => Object.values(s.pets).some((p) => p.level >= 50), reward: {} },
  { id: 'a_equip1', name: 'Primeiro Equipamento', icon: '⚔️', desc: 'Obtenha um equipamento.', check: (s) => Object.keys(s.equipment).length >= 1, reward: {} },
  { id: 'a_equip10', name: 'Equipado', icon: '🛡️', desc: 'Possua 10 equipamentos.', check: (s) => Object.values(s.equipment).reduce((a, b) => a + b, 0) >= 10, reward: {} },
  { id: 'a_equip50', name: 'Arsenal', icon: '🗡️', desc: 'Possua 50 equipamentos.', check: (s) => Object.values(s.equipment).reduce((a, b) => a + b, 0) >= 50, reward: {} },
  { id: 'a_prestige1', name: 'Primeiro Prestígio', icon: '🌀', desc: 'Realize seu primeiro prestígio.', reward: { gold: '10000', fragments: '5' }, stat: 'prestigeCount', target: '1' },
  { id: 'a_prestige10', name: 'Fênix', icon: '🔥', desc: 'Prestigie 10 vezes.', reward: { gold: '1000000', fragments: '25' }, stat: 'prestigeCount', target: '10' },
  { id: 'a_prestige50', name: 'Imortal', icon: '💀', desc: 'Prestigie 50 vezes.', reward: { gold: '10000000', fragments: '100' }, stat: 'prestigeCount', target: '50' },
  { id: 'a_ascend1', name: 'Primeira Ascensão', icon: '👑', desc: 'Realize sua primeira ascensão.', reward: { gold: '5000000', ascensionCoins: '5' }, stat: 'ascensionCount', target: '1' },
  { id: 'a_ascend10', name: 'Ascendente', icon: '🌌', desc: 'Ascenda 10 vezes.', reward: { gold: '25000000', ascensionCoins: '25' }, stat: 'ascensionCount', target: '10' },
  { id: 'a_transcend1', name: 'Transcendente', icon: '✨', desc: 'Transcenda pela primeira vez.', reward: { gold: '50000000', essence: '10' }, stat: 'transcendenceCount', target: '1' },
  { id: 'a_level5', name: 'Nível 5', icon: '🆙', desc: 'Alcance o nível 5.', reward: {}, stat: 'level', target: '5' },
  { id: 'a_level20', name: 'Nível 20', icon: '🎖️', desc: 'Alcance o nível 20.', reward: {}, stat: 'level', target: '20' },
  { id: 'a_level50', name: 'Nível 50', icon: '🏅', desc: 'Alcance o nível 50.', reward: {}, stat: 'level', target: '50' },
  { id: 'a_skill10', name: 'Estudioso', icon: '📚', desc: 'Gaste 10 pontos de habilidade.', stat: 'skillPointsSpent', target: '10', reward: {} },
  { id: 'a_skill100', name: 'Estrategista', icon: '♟️', desc: 'Gaste 100 pontos de habilidade.', stat: 'skillPointsSpent', target: '100', reward: {} },
  { id: 'a_ach20', name: 'Colecionador', icon: '🏆', desc: 'Desbloqueie 20 conquistas.', stat: 'achievementsUnlocked', target: '20', reward: {} },
  { id: 'a_ach60', name: 'Lenda das Conquistas', icon: '👑', desc: 'Desbloqueie 60 conquistas.', stat: 'achievementsUnlocked', target: '60', reward: { title: 'Colecionador' } },
  { id: 'a_combo10', name: 'Combo 10', icon: '🔥', desc: 'Alcance combo x10.', stat: 'comboMax', target: '10', reward: {} },
  { id: 'a_combo50', name: 'Combo 50', icon: '🌋', desc: 'Alcance combo x50.', stat: 'comboMax', target: '50', reward: {} },
  { id: 'a_combo200', name: 'Combo 200', icon: '☄️', desc: 'Alcance combo x200.', stat: 'comboMax', target: '200', reward: {} },
  { id: 'a_time1h', name: 'Dedicado', icon: '⏱️', desc: 'Jogue por 1 hora.', stat: 'playTime', target: '3600', reward: {} },
  { id: 'a_time24h', name: 'Veterano', icon: '🕰️', desc: 'Jogue por 24 horas.', stat: 'playTime', target: '86400', reward: {} },
  { id: 'a_time100h', name: 'Maratonista', icon: '🏃', desc: 'Jogue por 100 horas.', stat: 'playTime', target: '360000', reward: { title: 'Veterano' } },
  { id: 'a_title1', name: 'Titulado', icon: '🎖️', desc: 'Desbloqueie seu primeiro título.', stat: 'titles', target: '1', reward: {} },
  { id: 'a_event1', name: 'Participante', icon: '🎊', desc: 'Ganhe 100 tokens de evento.', stat: 'eventTokens', target: '100', reward: {} },

  // ── Secretas ────────────────────────────────────────────
  { id: 'a_secret1', name: 'Precisão Absoluta', icon: '🕵️', desc: 'Clique exatamente 1 vez... e só.', secret: true, check: (s) => D(s.stats.clicks ?? '0').eq(1), reward: {} },
  { id: 'a_secret2', name: 'Número da Sorte', icon: '🎰', desc: 'Faça exatamente 7 prestígios.', secret: true, check: (s) => s.prestige.count === 7, reward: { gold: '200000', fragments: '10' } },
  { id: 'a_secret3', name: 'Equilibrista de Combos', icon: '🤹', desc: 'Alcance exatamente combo x69.', secret: true, check: (s) => D(s.stats.comboMax ?? '0').eq(69), reward: {} },
  { id: 'a_secret4', name: 'Maníaco por Caixas', icon: '📚', desc: 'Abra 1.337 caixas.', secret: true, check: (s) => D(s.stats.boxesOpened ?? '0').eq(1337), reward: { boxes: { epic: 1 } } },
  { id: 'a_secret5', name: 'O Silêncio', icon: '🤫', desc: 'Tenha energia atual 0 após prestigiar.', secret: true, check: (s) => D(s.energy).eq(0) && s.prestige.count >= 1, reward: {} },
  { id: 'a_secret6', name: 'Dono do Núcleo', icon: '💎', desc: 'Equipe um equipamento em todos os 7 slots.', secret: true, check: (s) => Object.keys(s.equipped).length >= 7, reward: {} },
  { id: 'a_secret7', name: 'Boa Sorte', icon: '🍀', desc: 'Encontre um pet celestial ou transcendente.', secret: true, check: (s) => Object.keys(s.pets).some((id) => { const def = PET_MAP[id]; return def && (def.rarity === 'celestial' || def.rarity === 'transcendent'); }), reward: { boxes: { legendary: 1 } } },
];

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Checa se uma conquista está desbloqueada conforme o estado. */
export function isAchievementUnlocked(state: GameState, def: AchievementDef): boolean {
  if (state.achievements[def.id] !== undefined) return true;
  if (def.check) return def.check(state);
  if (def.stat && def.target) return statGte(state, def.stat, def.target);
  return false;
}
