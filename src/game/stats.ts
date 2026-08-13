import { D } from '../core/bignum';
import type { GameState } from './types';

/** Chaves padrão de estatísticas (todas armazenadas como Decimal string). */
export const STAT_DEFAULTS: Record<string, string> = {
  clicks: '0',
  clicksAuto: '0',
  energyProduced: '0',
  goldEarned: '0',
  crystalsEarned: '0',
  xpEarned: '0',
  biggestClick: '0',
  biggestCrit: '0',
  crits: '0',
  superCrits: '0',
  megaCrits: '0',
  ultraCrits: '0',
  boxesOpened: '0',
  petsFound: '0',
  equipmentFound: '0',
  questsCompleted: '0',
  achievementsUnlocked: '0',
  upgradesBought: '0',
  generatorsBought: '0',
  prestigeCount: '0',
  ascensionCount: '0',
  transcendenceCount: '0',
  comboMax: '0',
  playTime: '0',
  skillPointsSpent: '0',
  titles: '0',
  eventTokens: '0',
  goldDrops: '0',
  energyPerSecMax: '0',
  fichasBought: '0',
  creditsBought: '0',
  creditsConverted: '0',
  creditsEarned: '0',
  diamondsFromCredits: '0',
};

export function getStat(state: GameState, key: string): ReturnType<typeof D> {
  return D(state.stats[key] ?? STAT_DEFAULTS[key] ?? '0');
}

export function incStat(state: GameState, key: string, amount: ReturnType<typeof D>): void {
  state.stats[key] = D(state.stats[key] ?? STAT_DEFAULTS[key] ?? '0').plus(amount).toString();
}

export function setStatMax(state: GameState, key: string, value: ReturnType<typeof D>): void {
  const cur = getStat(state, key);
  if (value.gt(cur)) state.stats[key] = value.toString();
}

export function statLabel(key: string): string {
  const labels: Record<string, string> = {
    clicks: 'Cliques totais',
    clicksAuto: 'Cliques automáticos',
    energyProduced: 'Energia produzida',
    goldEarned: 'Moedas ganhas',
    crystalsEarned: 'Diamantes ganhos',
    xpEarned: 'XP ganho',
    biggestClick: 'Maior clique',
    biggestCrit: 'Maior crítico',
    crits: 'Críticos',
    superCrits: 'Super críticos',
    megaCrits: 'Mega críticos',
    ultraCrits: 'Ultra críticos',
    boxesOpened: 'Caixas abertas',
    petsFound: 'Pets encontrados',
    equipmentFound: 'Equipamentos obtidos',
    questsCompleted: 'Missões concluídas',
    achievementsUnlocked: 'Conquistas desbloqueadas',
    upgradesBought: 'Upgrades comprados',
    generatorsBought: 'Geradores comprados',
    prestigeCount: 'Prestígios',
    ascensionCount: 'Ascensões',
    transcendenceCount: 'Transcendências',
    comboMax: 'Combo máximo',
    playTime: 'Tempo jogado',
    skillPointsSpent: 'Pontos de habilidade gastos',
    titles: 'Títulos desbloqueados',
    eventTokens: 'Tokens de evento ganhos',
    goldDrops: 'Drops de ouro',
    energyPerSecMax: 'Pico de energia/s',
    fichasBought: 'Fichas compradas',
    creditsBought: 'Créditos comprados',
    creditsConverted: 'Créditos convertidos',
    diamondsFromCredits: 'Diamantes comprados com créditos',
  };
  return labels[key] ?? key;
}
