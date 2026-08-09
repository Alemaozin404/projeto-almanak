import { D, type Num } from '../core/bignum';
import type { GameState } from '../game/types';

export type QuestSource =
  | 'clicks'
  | 'crits'
  | 'energyProduced'
  | 'goldEarned'
  | 'crystalsEarned'
  | 'upgradesBought'
  | 'generatorsBought'
  | 'boxesOpened'
  | 'petsFound'
  | 'achievements'
  | 'prestigeCount'
  | 'ascensionCount'
  | 'level'
  | 'playTime'
  | 'comboMax'
  | 'questsCompleted'
  | 'energyNow'
  | 'goldNow'
  | 'eventTokens'
  | 'equipmentOwned'
  | 'petLevel'
  | 'skillPointsSpent';

export interface QuestReward {
  gold: string;
  xp: string;
  fragments?: string;
  prestigeCoins?: string;
  ascensionCoins?: string;
  boxes?: Record<string, number>;
  eventTokens?: string;
}

export interface QuestDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  source: QuestSource;
  target: string; // valor Decimal string
  reward: QuestReward;
  category: 'permanente' | 'diaria' | 'semanal' | 'evento';
}

/** Progresso atual de uma missão (derivado do estado). */
export function questProgress(state: GameState, def: QuestDef): ReturnType<typeof D> {
  const stats = state.stats;
  switch (def.source) {
    case 'clicks': return D(stats.clicks ?? '0');
    case 'crits': return D(stats.crits ?? '0');
    case 'energyProduced': return D(stats.energyProduced ?? '0');
    case 'goldEarned': return D(stats.goldEarned ?? '0');
    case 'crystalsEarned': return D(stats.crystalsEarned ?? '0');
    case 'upgradesBought': return D(stats.upgradesBought ?? '0');
    case 'generatorsBought': return D(stats.generatorsBought ?? '0');
    case 'boxesOpened': return D(stats.boxesOpened ?? '0');
    case 'petsFound': return D(stats.petsFound ?? '0');
    case 'achievements': return D(stats.achievementsUnlocked ?? '0');
    case 'prestigeCount': return D(state.prestige.count);
    case 'ascensionCount': return D(state.ascension.count);
    case 'level': return D(state.level);
    case 'playTime': return D(Math.floor(state.playTimeSeconds));
    case 'comboMax': return D(stats.comboMax ?? '0');
    case 'questsCompleted': return D(stats.questsCompleted ?? '0');
    case 'energyNow': return D(state.energy);
    case 'goldNow': return D(state.gold);
    case 'eventTokens': return D(state.eventTokens);
    case 'equipmentOwned': return D(Object.values(state.equipment).reduce((a, b) => a + b, 0));
    case 'petLevel': {
      let best = 0;
      for (const pet of Object.values(state.pets)) best = Math.max(best, pet.level);
      return D(best);
    }
    case 'skillPointsSpent': {
      let spent = 0;
      for (const l of Object.values(state.skills)) spent += l;
      return D(spent);
    }
  }
}

export function questDefsForType(type: 'permanente' | 'diaria' | 'semanal'): QuestDef[] {
  return QUEST_DEFS.filter((q) => q.category === type);
}

const r = (gold: string, xp: string, extra?: Partial<QuestReward>): QuestReward => ({ gold, xp, ...extra });

export const QUEST_DEFS: QuestDef[] = [
  // ── Permanentes ─────────────────────────────────────────
  { id: 'q_p1', name: 'Aquecendo', icon: '🖱️', desc: 'Clique 100 vezes.', source: 'clicks', target: '100', reward: r('1000', '50'), category: 'permanente' },
  { id: 'q_p2', name: 'Clicador', icon: '👆', desc: 'Clique 5.000 vezes.', source: 'clicks', target: '5000', reward: r('25000', '400'), category: 'permanente' },
  { id: 'q_p3', name: 'Máquina de Cliques', icon: '⚙️', desc: 'Clique 100.000 vezes.', source: 'clicks', target: '100000', reward: r('1000000', '2500'), category: 'permanente' },
  { id: 'q_p4', name: 'Implacável', icon: '🔥', desc: 'Clique 10 milhões de vezes.', source: 'clicks', target: '10000000', reward: r('50020000', '15000'), category: 'permanente' },
  { id: 'q_p5', name: 'Crítico Nato', icon: '🎯', desc: 'Acumule 1.000 acertos críticos.', source: 'crits', target: '1000', reward: r('50000', '1000'), category: 'permanente' },
  { id: 'q_p6', name: 'Coletor de Energia', icon: '⚡', desc: 'Produza 1 milhão de energia (total).', source: 'energyProduced', target: '1000000', reward: r('100000', '1500'), category: 'permanente' },
  { id: 'q_p7', name: 'Usina Viva', icon: '🏭', desc: 'Produza 1 bilhão de energia (total).', source: 'energyProduced', target: '1000000000', reward: r('50010000', '10000'), category: 'permanente' },
  { id: 'q_p8', name: 'Força Cósmica', icon: '🌌', desc: 'Produza 1e15 de energia (total).', source: 'energyProduced', target: '1e15', reward: r('1000000050000', '50000'), category: 'permanente' },
  { id: 'q_p9', name: 'Primeiro Ouro', icon: '🪙', desc: 'Acumule 2.500 de ouro ganho.', source: 'goldEarned', target: '2500', reward: r('10000', '250'), category: 'permanente' },
  { id: 'q_p10', name: 'Magnata', icon: '💰', desc: 'Acumule 25 milhões de ouro ganho.', source: 'goldEarned', target: '25000000', reward: r('50010000', '5000'), category: 'permanente' },
  { id: 'q_p11', name: 'Comprador', icon: '🛒', desc: 'Compre 25 upgrades.', source: 'upgradesBought', target: '25', reward: r('20000', '500'), category: 'permanente' },
  { id: 'q_p12', name: 'Investidor', icon: '📈', desc: 'Compre 200 upgrades.', source: 'upgradesBought', target: '200', reward: r('500000', '5000'), category: 'permanente' },
  { id: 'q_p13', name: 'Engenheiro', icon: '🛠️', desc: 'Compre 50 geradores.', source: 'generatorsBought', target: '50', reward: r('250000', '2500'), category: 'permanente' },
  { id: 'q_p14', name: 'Colecionador de Caixas', icon: '📦', desc: 'Abra 100 caixas.', source: 'boxesOpened', target: '100', reward: r('100000', '2500', { boxes: { rare: 1 } }), category: 'permanente' },
  { id: 'q_p15', name: 'Apostador', icon: '🎲', desc: 'Abra 1.000 caixas.', source: 'boxesOpened', target: '1000', reward: r('2000000', '12500', { boxes: { epic: 1 } }), category: 'permanente' },
  { id: 'q_p16', name: 'Amante dos Pets', icon: '🐾', desc: 'Encontre 10 pets diferentes.', source: 'petsFound', target: '10', reward: r('50000', '1000', { boxes: { basic: 2 } }), category: 'permanente' },
  { id: 'q_p17', name: 'Jardim Zoológico', icon: '🦁', desc: 'Encontre 50 pets diferentes.', source: 'petsFound', target: '50', reward: r('1000000', '7500', { boxes: { rare: 2 } }), category: 'permanente' },
  { id: 'q_p18', name: 'Mestre dos Pets', icon: '👑', desc: 'Encontre 150 pets diferentes.', source: 'petsFound', target: '150', reward: r('10030000', '25000'), category: 'permanente' },
  { id: 'q_p19', name: 'Realizador', icon: '🏆', desc: 'Desbloqueie 20 conquistas.', source: 'achievements', target: '20', reward: r('100000', '2500'), category: 'permanente' },
  { id: 'q_p20', name: 'Lenda Viva', icon: '🌟', desc: 'Desbloqueie 60 conquistas.', source: 'achievements', target: '60', reward: r('5015000', '15000'), category: 'permanente' },
  { id: 'q_p21', name: 'Renascido', icon: '🌀', desc: 'Faça 1 prestígio.', source: 'prestigeCount', target: '1', reward: r('100000', '5000', { fragments: '5' }), category: 'permanente' },
  { id: 'q_p22', name: 'Fênix', icon: '🔥', desc: 'Faça 10 prestígios.', source: 'prestigeCount', target: '10', reward: r('5000000', '25000', { prestigeCoins: '10' }), category: 'permanente' },
  { id: 'q_p23', name: 'Ascendente', icon: '👑', desc: 'Faça 1 ascensão.', source: 'ascensionCount', target: '1', reward: r('10000000', '50000', { ascensionCoins: '2' }), category: 'permanente' },
  { id: 'q_p24', name: 'Maratonista', icon: '⏱️', desc: 'Jogue por 1 hora acumulada.', source: 'playTime', target: '3600', reward: r('50000', '1500'), category: 'permanente' },
  { id: 'q_p25', name: 'Veterano', icon: '🕰️', desc: 'Jogue por 24 horas acumuladas.', source: 'playTime', target: '86400', reward: r('5010000', '15000'), category: 'permanente' },
  { id: 'q_p26', name: 'Equilibrista', icon: '⚖️', desc: 'Alcance a energia atual de 1 milhão.', source: 'energyNow', target: '1000000', reward: r('200000', '2500'), category: 'permanente' },
  { id: 'q_p27', name: 'Barão do Ouro', icon: '🏦', desc: 'Alcance 2,5 milhões de ouro atuais.', source: 'goldNow', target: '2500000', reward: r('2000000', '5000'), category: 'permanente' },
  { id: 'q_p28', name: 'Rico', icon: '💵', desc: 'Tenha 250 bilhões de ouro acumulado.', source: 'goldEarned', target: '250000000000', reward: r('100000020000', '50000'), category: 'permanente' },
  { id: 'q_p29', name: 'Equipado', icon: '⚔️', desc: 'Possua 20 equipamentos no total.', source: 'equipmentOwned', target: '20', reward: r('100000', '2000'), category: 'permanente' },
  { id: 'q_p30', name: 'Domador', icon: '🐉', desc: 'Tenha um pet no nível 25.', source: 'petLevel', target: '25', reward: r('500000', '4000', { boxes: { epic: 1 } }), category: 'permanente' },
  { id: 'q_p31', name: 'Estrategista', icon: '♟️', desc: 'Gaste 50 pontos de habilidade.', source: 'skillPointsSpent', target: '50', reward: r('250000', '5000'), category: 'permanente' },

  // ── Diárias ─────────────────────────────────────────────
  { id: 'q_d1', name: 'Cliques do Dia', icon: '🖱️', desc: 'Clique 500 vezes hoje.', source: 'clicks', target: '500', reward: r('26000', '500'), category: 'diaria' },
  { id: 'q_d2', name: 'Cliques do Dia II', icon: '👆', desc: 'Clique 2.000 vezes hoje.', source: 'clicks', target: '2000', reward: r('102000', '1250'), category: 'diaria' },
  { id: 'q_d3', name: 'Energia Diária', icon: '⚡', desc: 'Produza 1 milhão de energia hoje.', source: 'energyProduced', target: '1000000', reward: r('100000', '1000'), category: 'diaria' },
  { id: 'q_d4', name: 'Energia Diária II', icon: '🔋', desc: 'Produza 1 bilhão de energia hoje.', source: 'energyProduced', target: '1000000000', reward: r('50003000', '5000'), category: 'diaria' },
  { id: 'q_d5', name: 'Ouro do Dia', icon: '🪙', desc: 'Ganhe 12.500 de ouro hoje.', source: 'goldEarned', target: '12500', reward: r('50000', '750'), category: 'diaria' },
  { id: 'q_d6', name: 'Ouro do Dia II', icon: '💰', desc: 'Ganhe 1,25 milhão de ouro hoje.', source: 'goldEarned', target: '1250000', reward: r('2502000', '3000'), category: 'diaria' },
  { id: 'q_d7', name: 'Caixas do Dia', icon: '📦', desc: 'Abra 10 caixas hoje.', source: 'boxesOpened', target: '10', reward: r('50000', '750'), category: 'diaria' },
  { id: 'q_d8', name: 'Críticos do Dia', icon: '🎯', desc: 'Acumule 100 críticos hoje.', source: 'crits', target: '100', reward: r('40000', '600'), category: 'diaria' },
  { id: 'q_d9', name: 'Compras do Dia', icon: '🛒', desc: 'Compre 10 upgrades hoje.', source: 'upgradesBought', target: '10', reward: r('60000', '750'), category: 'diaria' },
  { id: 'q_d10', name: 'Geradores do Dia', icon: '⚙️', desc: 'Compre 10 geradores hoje.', source: 'generatorsBought', target: '10', reward: r('80000', '900'), category: 'diaria' },

  // ── Semanais ────────────────────────────────────────────
  { id: 'q_w1', name: 'Semana de Cliques', icon: '🖱️', desc: 'Clique 50.000 vezes na semana.', source: 'clicks', target: '50000', reward: r('2505000', '7500'), category: 'semanal' },
  { id: 'q_w2', name: 'Semana de Energia', icon: '⚡', desc: 'Produza 1e12 de energia na semana.', source: 'energyProduced', target: '1e12', reward: r('100000010000', '25000'), category: 'semanal' },
  { id: 'q_w3', name: 'Semana de Ouro', icon: '🪙', desc: 'Ganhe 250 milhões de ouro na semana.', source: 'goldEarned', target: '250000000', reward: r('500005000', '12500'), category: 'semanal' },
  { id: 'q_w4', name: 'Semana de Caixas', icon: '📦', desc: 'Abra 100 caixas na semana.', source: 'boxesOpened', target: '100', reward: r('1000000', '5000', { boxes: { rare: 1 } }), category: 'semanal' },
  { id: 'q_w5', name: 'Semana de Pets', icon: '🐾', desc: 'Encontre 15 pets na semana.', source: 'petsFound', target: '15', reward: r('1000000', '5000', { boxes: { rare: 2 } }), category: 'semanal' },
  { id: 'q_w6', name: 'Semana de Prestígio', icon: '🌀', desc: 'Faça 2 prestígios na semana.', source: 'prestigeCount', target: '2', reward: r('10000000', '20000', { prestigeCoins: '5' }), category: 'semanal' },
  { id: 'q_w7', name: 'Semana de Conquistas', icon: '🏆', desc: 'Desbloqueie 10 conquistas na semana.', source: 'achievements', target: '10', reward: r('5005000', '10000'), category: 'semanal' },
];

/** Sorteia missões diárias/semanais para a rotação. */
export function rollDailyQuests(count = 3): QuestDef[] {
  const pool = QUEST_DEFS.filter((q) => q.category === 'diaria');
  return shuffle(pool).slice(0, count);
}

export function rollWeeklyQuests(count = 3): QuestDef[] {
  const pool = QUEST_DEFS.filter((q) => q.category === 'semanal');
  return shuffle(pool).slice(0, count);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function questById(id: string): QuestDef | undefined {
  return QUEST_DEFS.find((q) => q.id === id);
}

export function petCountUnlocked(state: GameState): number {
  return Object.keys(state.pets).length;
}

export function isQuestComplete(progress: Num, target: string): boolean {
  return D(progress).gte(D(target));
}

/** Melhor nível de pet para display. */
export function bestPetLevel(state: GameState): number {
  let best = 0;
  for (const p of Object.values(state.pets)) {
    if (p.level > best) best = p.level;
  }
  return best;
}
