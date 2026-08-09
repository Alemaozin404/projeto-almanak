/**
 * Temporadas — conteúdo data-driven.
 * Cada temporada tem tema, janela, passe próprio (XP por cliques) e recompensas.
 */
import type { EventRewardSpec } from './rewards';

export interface SeasonPassLevel {
  level: number;
  xp: string;
  free?: EventRewardSpec;
  premium?: EventRewardSpec;
}

export interface SeasonDef {
  id: string;
  number: number;
  name: string;
  icon: string;
  theme: string;
  desc: string;
  startAt: number;
  endAt: number;
  gradient: string;
  titleReward: string; // título concedido ao completar
  skinIds: string[];
  pass: SeasonPassLevel[];
}

function at(dateStr: string): number {
  const [date, time = '00:00'] = dateStr.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mi || 0).getTime();
}

export let SEASONS: SeasonDef[] = [
  {
    id: 'season4',
    number: 4,
    name: 'Cyber Genesis',
    icon: '🌐',
    theme: 'Cyberpunk',
    desc: 'O mundo despertou para a rede. Nova temporada, novo passe, novas skins.',
    startAt: at('2026-08-01 00:00'),
    endAt: at('2026-09-15 23:59'),
    gradient: 'linear-gradient(120deg, rgba(176,108,255,0.35), rgba(55,245,255,0.15))',
    titleReward: 'cyber_genesis',
    skinIds: ['cyber_core', 'bg_cyber', 'num_neon'],
    pass: [
      { level: 1, xp: '0', free: { gold: '10000' } },
      { level: 2, xp: '800', free: { gold: '5000' }, premium: { gold: '10000' } },
      { level: 3, xp: '1800', free: { boxes: [{ boxId: 'basic', qty: 2 }] } },
      { level: 4, xp: '3000', free: { gold: '50000' } },
      { level: 5, xp: '4500', free: { skins: ['num_neon'] }, premium: { skins: ['num_neon'], gold: '20000' } },
      { level: 6, xp: '6200', free: { consumables: [{ id: 'pet_food', qty: 3 }] } },
      { level: 7, xp: '8100', free: { boxes: [{ boxId: 'event', qty: 1 }] }, premium: { boxes: [{ boxId: 'event', qty: 2 }] } },
      { level: 8, xp: '10200', free: { gold: '15000' } },
      { level: 9, xp: '12500', free: { gold: '300000' } },
      { level: 10, xp: '15000', free: { skins: ['bg_cyber'] }, premium: { skins: ['cyber_core'], boxes: [{ boxId: 'event', qty: 3 }] } },
    ],
  },
];

export function activeSeason(nowMs: number = Date.now()): SeasonDef | undefined {
  return SEASONS.find((s) => s.startAt <= nowMs && nowMs <= s.endAt);
}

export function seasonById(id: string): SeasonDef | undefined {
  return SEASONS.find((s) => s.id === id);
}

export function seasonStatus(s: SeasonDef, nowMs: number = Date.now()): 'upcoming' | 'live' | 'ended' {
  if (nowMs < s.startAt) return 'upcoming';
  if (nowMs > s.endAt) return 'ended';
  return 'live';
}

export function seasonRemaining(s: SeasonDef, nowMs: number = Date.now()): number {
  return Math.max(0, s.endAt - nowMs);
}

/** ID da temporada atual (a primeira ativa ou a primeira da lista). */
export const SEASON_ID: string = SEASONS[0]?.id ?? 'season4';

/** Temporada ativa no momento (ou a primeira da lista se nenhuma estiver ativa). */
export function currentSeason(nowMs: number = Date.now()): SeasonDef {
  return activeSeason(nowMs) ?? SEASONS[0];
}

/** Hidrata as temporadas com dados do servidor (GET /api/content). */
export function hydrateSeasons(items: SeasonDef[]): void {
  SEASONS = Array.isArray(items)
    ? items.filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string')
    : SEASONS;
}
