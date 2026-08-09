/**
 * Eventos — conteúdo data-driven.
 * Para cadastrar um evento futuro basta adicionar uma entrada aqui (ou importar um JSON).
 * Não é preciso tocar no restante do jogo: EventManager calcula status, banners, loja, passe.
 */
import { pct, ADDITIVE_KEYS, type PartialModifiers } from '../core/modifiers';
import { D, ONE, ZERO } from '../core/bignum';
import type { ModifierSet } from '../game/types';
import type { EventRewardSpec } from './rewards';

export type EventStatus = 'upcoming' | 'live' | 'ending_soon' | 'ended' | 'archived';
export type EventTheme =
  | 'natal' | 'halloween' | 'anonovo' | 'pascoa' | 'verao' | 'inverno'
  | 'cyberpunk' | 'espacial' | 'medieval' | 'apocalipse' | 'pirata'
  | 'futurista' | 'magico' | 'tecnologico' | 'lunar';

export interface EventShopItem {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cost: string; // na moeda do evento
  type: 'title' | 'box' | 'consumable' | 'buff' | 'permanent' | 'skin';
  value?: string;
  durationMs?: number;
  buffMult?: number;
}

export interface EventPassLevel {
  level: number;
  xp: string; // XP total necessário para este nível
  free?: EventRewardSpec;
  premium?: EventRewardSpec;
  title?: string; // título concedido (grátis) ao atingir
}

export interface EventChapter {
  id: string;
  title: string;
  text: string;
  banner?: string;
  /** Recompensa única ao ler o capítulo. */
  reward?: EventRewardSpec;
  /** Nível de passe mínimo para desbloquear o capítulo. */
  unlockLevel?: number;
}

export interface EventDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  theme: EventTheme;
  /** Janela absoluta (ms). Eventos sem janela usam `always`. */
  startAt?: number;
  endAt?: number;
  always?: boolean;
  lightning?: boolean; // evento relâmpago (minutos/horas)
  global?: boolean; // evento global (afeta o jogo inteiro)
  currency: { id: string; name: string; icon: string };
  boxId: string;
  shop: EventShopItem[];
  bonus: PartialModifiers;
  bonusText: string;
  /** Rótulos para o calendário (ex.: '05 ago' → '12 ago'). */
  startLabel?: string;
  endLabel?: string;
  pass?: { levels: EventPassLevel[] };
  story?: EventChapter[];
  dailyRewards?: EventRewardSpec[];
  skins: string[];
  tags: string[];
}

/** Converte 'YYYY-MM-DD HH:mm' em timestamp UTC (determinístico em qualquer máquina/fuso —
 *  o server/content.json exportado precisa ser byte-idêntico no CI, no dev e no Vercel). */
function at(dateStr: string): number {
  const [date, time = '00:00'] = dateStr.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mi] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh || 0, mi || 0);
}

const buff = (name: string, icon: string, desc: string, cost: string, buffId: string, mult: number, durationMs: number, type: EventShopItem['type'] = 'buff'): EventShopItem => ({
  id: buffId, name, icon, desc, cost, type, value: buffId, durationMs, buffMult: mult,
});

const skinItem = (skinId: string, name: string, icon: string, desc: string, cost: string): EventShopItem => ({
  id: `skin_${skinId}`, name, icon, desc, cost, type: 'skin', value: skinId,
});

/** Níveis de passe padrão (XP total por nível, recompensas free/premium). */
function defaultPass(prefix: string, skinTop: string): { levels: EventPassLevel[] } {
  const L = (level: number, xp: string, free?: EventRewardSpec, premium?: EventRewardSpec): EventPassLevel => ({ level, xp, free, premium });
  return {
    levels: [
      L(1, '0', { gold: '5000' }),
      L(2, '500', { boxes: [{ boxId: 'basic', qty: 2 }] }),
      L(3, '1200', { gold: '5000' }, { gold: '10000' }),
      L(4, '2000', { gold: '25000' }),
      L(5, '3000', { boxes: [{ boxId: 'basic', qty: 3 }] }, { boxes: [{ boxId: 'event', qty: 1 }] }),
      L(6, '4200', { gold: '10000' }),
      L(7, '5500', { consumables: [{ id: 'pet_food', qty: 3 }] }, { consumables: [{ id: 'pet_food', qty: 6 }] }),
      L(8, '7000', { gold: '150000' }),
      L(9, '8600', { gold: '15000' }, { boxes: [{ boxId: 'event', qty: 2 }] }),
      L(10, '10000', { skins: [skinTop] }, { boxes: [{ boxId: 'event', qty: 3 }], gold: '25000' }),
    ],
  };
}

export let EVENTS: EventDef[] = [
  {
    id: 'cyber',
    name: 'Cyber Overdrive',
    icon: '🤖',
    desc: 'A rede despertou. Produza 2x energia, colete Fragmentos Cyber e desbloqueie skins exclusivas da temporada.',
    theme: 'cyberpunk',
    startAt: at('2026-08-05 12:00'),
    endAt: at('2026-08-12 23:59'),
    startLabel: '05 ago',
    endLabel: '12 ago',
    currency: { id: 'frag_cyber', name: 'Fragmentos Cyber', icon: '⚡' },
    boxId: 'event',
    bonus: { production: ZERO.plus(2) } as PartialModifiers,
    bonusText: '2x produção de energia durante o evento',
    skins: ['cyber_core', 'bg_cyber', 'cursor_cyber', 'num_neon', 'fx_cyber', 'ui_cyber', 'pf_cyber', 'banner_cyber', 'pet_cyber'],
    tags: ['cyberpunk', 'tecnologico', 'live'],
    shop: [
      skinItem('cyber_core', 'Núcleo Cyber', '🤖', 'Skin lendária do Núcleo.', '5000'),
      skinItem('bg_cyber', 'Cidade Digital', '🌆', 'Skin de fundo neon.', '3000'),
      skinItem('cursor_cyber', 'Cursor Neon', '💠', 'Skin de cursor.', '1500'),
      skinItem('num_neon', 'Números Neon', '🟢', 'Estilo dos números flutuantes.', '1200'),
      skinItem('fx_cyber', 'Circuito', '🔌', 'Efeito de partículas.', '1200'),
      skinItem('ui_cyber', 'Interface Neon', '🧪', 'Tema de interface.', '2500'),
      skinItem('pf_cyber', 'Moldura Cyber', '🖥️', 'Moldura de perfil.', '1000'),
      skinItem('banner_cyber', 'Banner Neon', '🎴', 'Banner de perfil.', '800'),
      skinItem('pet_cyber', 'Chips de Pet', '🔩', 'Aura visual dos pets.', '2000'),
      { id: 'cyber_title', name: 'Título: Netrunner', icon: '👨‍💻', desc: 'Título exclusivo do evento.', cost: '2500', type: 'title', value: 'cyber_netrunner' },
      buff('Overclock', '⚡', 'Dobra o clique por 5 minutos.', '600', 'click_x2', 2, 300000),
      buff('Neural Boost', '🧠', 'Dobra a produção por 10 minutos.', '900', 'prod_x2', 2, 600000),
      { id: 'cyber_chest', name: 'Caixa Cyber', icon: '📦', desc: '1 Caixa do Evento.', cost: '2000', type: 'box', value: 'event' },
      { id: 'cyber_perma', name: 'Núcleo de Rede', icon: '🔗', desc: '+10% produção permanente.', cost: '8000', type: 'permanent', value: 'cyber_perma' },
    ],
    pass: defaultPass('cyber', 'num_neon'),
    story: [
      { id: 'c1', title: 'Capítulo 1 — O Sinal', unlockLevel: 1, banner: 'A rede enviou um sinal…', text: 'Um sinal digital atravessa a cidade. O Núcleo começa a pulsar em sincronia com servidores ocultos.' },
      { id: 'c2', title: 'Capítulo 2 — O Núcleo de Rede', unlockLevel: 4, banner: 'Conexão estabelecida', text: 'Você conecta o Núcleo à rede. Fragmentos Cyber fluem como dados purificados.', reward: { gold: '5000' } },
      { id: 'c3', title: 'Capítulo 3 — Sobrecarga', unlockLevel: 8, banner: 'SOBRECARGA IMINENTE', text: 'A sobrecarga final se aproxima. Supere a rede e reivindique a skin lendária.', reward: { gold: '100000' } },
    ],
    dailyRewards: [
      { gold: '10000' },
      { gold: '5000' },
      { boxes: [{ boxId: 'basic', qty: 2 }] },
      { eventTokens: 200 },
      { consumables: [{ id: 'pet_food', qty: 2 }] },
      { boxes: [{ boxId: 'event', qty: 1 }] },
      { skins: ['num_neon'] },
    ],
  },
  {
    id: 'lunar',
    name: 'Festival Lunar',
    icon: '🌙',
    desc: 'A lua cheia traz sorte rara. Colete Fragmentos Lunares e desbloqueie o Núcleo Lunar.',
    theme: 'lunar',
    startAt: at('2026-08-20 12:00'),
    endAt: at('2026-08-27 23:59'),
    startLabel: '20 ago',
    endLabel: '27 ago',
    currency: { id: 'frag_lunar', name: 'Fragmentos Lunares', icon: '🌙' },
    boxId: 'event',
    bonus: pct({ luck: 30 }),
    bonusText: '+30% sorte durante o evento',
    skins: ['lunar_core'],
    tags: ['lunar', 'futuro'],
    shop: [
      skinItem('lunar_core', 'Núcleo Lunar', '🌙', 'Skin celestial limitada.', '5000'),
      { id: 'lunar_title', name: 'Título: Filho da Lua', icon: '🌕', desc: 'Título exclusivo.', cost: '2500', type: 'title', value: 'lunar_filho' },
      buff('Chá de Lua', '🍵', 'Dobra a produção por 10 minutos.', '800', 'prod_x2', 2, 600000),
      { id: 'lunar_chest', name: 'Caixa Lunar', icon: '🌝', desc: '1 Caixa do Evento.', cost: '1800', type: 'box', value: 'event' },
      { id: 'lunar_perma', name: 'Pó Lunar', icon: '🪩', desc: '+10% sorte permanente.', cost: '6000', type: 'permanent', value: 'lunar_perma' },
    ],
    pass: defaultPass('lunar', 'lunar_core'),
    dailyRewards: [
      { gold: '15000' },
      { gold: '5000' },
      { boxes: [{ boxId: 'basic', qty: 2 }] },
      { eventTokens: 250 },
      { consumables: [{ id: 'pet_food', qty: 2 }] },
      { boxes: [{ boxId: 'event', qty: 1 }] },
      { skins: ['lunar_core'] },
    ],
  },
  {
    id: 'verao',
    name: 'Verão Eterno',
    icon: '🏖️',
    desc: 'Sol, praia e muito ouro. Evento encerrado — arquivado no calendário.',
    theme: 'verao',
    startAt: at('2026-01-15 00:00'),
    endAt: at('2026-02-28 23:59'),
    startLabel: '15 jan',
    endLabel: '28 fev',
    currency: { id: 'conchas', name: 'Conchas', icon: '🐚' },
    boxId: 'event',
    bonus: pct({ dropChance: 15 }),
    bonusText: '+15% chance de drops',
    skins: ['bg_beach'],
    tags: ['verao', 'arquivado'],
    shop: [
      { id: 'verao_title', name: 'Título: Rei da Praia', icon: '🕶️', desc: 'Desbloqueia o título.', cost: '300', type: 'title', value: 'verao_rei' },
      buff('Smoothie de Energia', '🥤', 'Dobra o clique por 5 minutos.', '150', 'click_x2', 2, 300000),
      { id: 'verao_chest', name: 'Concha Rara', icon: '🐚', desc: '1 Caixa do Evento.', cost: '100', type: 'box', value: 'event' },
      { id: 'verao_perma', name: 'Sol Permanente', icon: '🌞', desc: '+10% ouro permanente.', cost: '1000', type: 'permanent', value: 'verao_perma' },
    ],
  },
  {
    id: 'halloween',
    name: 'Noite Sombria',
    icon: '🎃',
    desc: 'Criaturas invadem o Núcleo. Doces, caixas assombradas e skins de terror.',
    theme: 'halloween',
    startAt: at('2026-10-20 00:00'),
    endAt: at('2026-10-31 23:59'),
    startLabel: '20 out',
    endLabel: '31 out',
    currency: { id: 'doces', name: 'Doces', icon: '🍬' },
    boxId: 'event',
    bonus: pct({ clickPower: 25 }),
    bonusText: '+25% poder de clique',
    skins: ['fx_snow'],
    tags: ['halloween', 'futuro'],
    shop: [
      { id: 'hall_title', name: 'Título: Mestre das Sombras', icon: '🌑', desc: 'Desbloqueia o título.', cost: '300', type: 'title', value: 'halloween_shadow' },
      buff('Poção Sombria', '🧙', 'Dobra a produção por 10 minutos.', '250', 'prod_x2', 2, 600000),
      { id: 'hall_chest', name: 'Caixa Assombrada', icon: '🧟', desc: '2 Caixas do Evento.', cost: '180', type: 'box', value: 'event' },
      { id: 'hall_perma', name: 'Abóbora Encantada', icon: '🎃', desc: '+10% clique permanente.', cost: '1000', type: 'permanent', value: 'hall_perma' },
    ],
    pass: defaultPass('hall', 'fx_snow'),
  },
  {
    id: 'natal',
    name: 'Natal Estelar',
    icon: '🎄',
    desc: 'O espírito natalino traz presentes raros, flocos de neve e o Núcleo Gélido.',
    theme: 'natal',
    startAt: at('2026-12-01 00:00'),
    endAt: at('2026-12-31 23:59'),
    startLabel: '01 dez',
    endLabel: '31 dez',
    currency: { id: 'flocos', name: 'Flocos', icon: '❄️' },
    boxId: 'event',
    bonus: pct({ goldGain: 25 }),
    bonusText: '+25% ouro durante o evento',
    skins: ['fx_snow'],
    tags: ['natal', 'inverno', 'futuro'],
    shop: [
      { id: 'natal_title', name: 'Título: Papai Noel', icon: '🎅', desc: 'Desbloqueia o título.', cost: '300', type: 'title', value: 'natal_noel' },
      buff('Biscoito de Gengibre', '🍪', 'Dobra o clique por 5 minutos.', '150', 'click_x2', 2, 300000),
      buff('Chocolate Quente', '☕', 'Dobra a produção por 10 minutos.', '250', 'prod_x2', 2, 600000),
      { id: 'natal_chest', name: 'Presente Misterioso', icon: '🎁', desc: '1 Caixa do Evento.', cost: '100', type: 'box', value: 'event' },
      { id: 'natal_perma', name: 'Estrela de Natal', icon: '⭐', desc: '+10% produção permanente.', cost: '1000', type: 'permanent', value: 'natal_perma' },
    ],
    pass: defaultPass('natal', 'fx_snow'),
  },
  {
    id: 'lightning',
    name: 'Relâmpago x5',
    icon: '⚡',
    desc: 'EVENTO RELÂMPAGO — todos os cliques valem 5x por 1 hora. Corra!',
    theme: 'tecnologico',
    startAt: at('2026-08-08 20:00'),
    endAt: at('2026-08-08 21:00'),
    lightning: true,
    startLabel: '08 ago 20:00',
    endLabel: '08 ago 21:00',
    currency: { id: 'brasas', name: 'Brasas', icon: '🔥' },
    boxId: 'event',
    bonus: { clickPower: ZERO.plus(5) } as PartialModifiers,
    bonusText: '5x poder de clique — apenas 1 hora!',
    skins: [],
    tags: ['relampago', 'futuro'],
    shop: [
      buff('Energia Relâmpago', '🌩️', 'Dobra o clique por 5 minutos.', '500', 'click_x2', 2, 300000),
      { id: 'lt_chest', name: 'Caixa Relâmpago', icon: '📦', desc: '1 Caixa do Evento.', cost: '1500', type: 'box', value: 'event' },
    ],
  },
];

/** Evento permanente de demonstração (testes/debug). */
export const DEMO_EVENT: EventDef = {
  id: 'demo',
  name: 'Festival Estelar',
  icon: '🌟',
  desc: 'Evento permanente de demonstração para testar o sistema completo (passe, história, recompensas).',
  theme: 'espacial',
  always: true,
  currency: { id: 'frag_demo', name: 'Fragmentos Estelares', icon: '🌟' },
  boxId: 'event',
  bonus: pct({ luck: 20 }),
  bonusText: '+20% sorte durante o evento',
  skins: [],
  tags: ['demo'],
  shop: [
    { id: 'demo_title', name: 'Título: Estelar', icon: '🌠', desc: 'Desbloqueia o título.', cost: '200', type: 'title', value: 'demo_estelar' },
    buff('Bebida Estelar', '🍹', 'Dobra a produção por 10 minutos.', '200', 'prod_x2', 2, 600000),
    { id: 'demo_chest', name: 'Caixa Estelar', icon: '🎇', desc: '1 Caixa do Evento.', cost: '90', type: 'box', value: 'event' },
  ],
  pass: defaultPass('demo', 'num_gold'),
  story: [
    { id: 'dc1', title: 'Capítulo 1 — Primeiro Contato', unlockLevel: 1, text: 'Uma nave surge no horizonte. O Festival Estelar começa.' },
    { id: 'dc2', title: 'Capítulo 2 — A Dança das Estrelas', unlockLevel: 3, text: 'As estrelas dançam em sincronia com seus cliques.', reward: { gold: '50000' } },
  ],
  dailyRewards: [
    { gold: '20000' },      { gold: '3000' },
      { boxes: [{ boxId: 'basic', qty: 1 }] },
    { eventTokens: 100 },
    { consumables: [{ id: 'pet_food', qty: 1 }] },
    { gold: '50000' },
    { gold: '10000' },
  ],
};

export let EVENTS_ALL: EventDef[] = [...EVENTS, DEMO_EVENT];

/** Overrides do modo debug (testes): eventos forçados ativos. */
export const debugEventOverrides = new Set<string>();

/**
 * Hidrata os eventos com dados do servidor (GET /api/content).
 * O JSON serializa os bônus (Decimal.js) como string — normalizamos de volta
 * para Decimal para que o jogo continue chamando .plus()/.mul() sem quebrar.
 */
export function hydrateEvents(items: EventDef[]): void {
  if (!Array.isArray(items)) return;
  const list = items.filter((e) => e && typeof e.id === 'string' && typeof e.name === 'string');
  EVENTS = list;
  EVENTS_ALL = [...list, DEMO_EVENT];
  for (const e of EVENTS_ALL) {
    if (e.bonus && typeof e.bonus === 'object') {
      const out: PartialModifiers = {};
      for (const k of Object.keys(e.bonus) as (keyof ModifierSet)[]) {
        const v = e.bonus[k];
        if (v === undefined) continue;
        try {
          out[k] = D(v);
        } catch {
          out[k] = v;
        }
      }
      e.bonus = out;
    }
  }
}

function inWindow(def: EventDef, date: Date): boolean {
  if (def.always) return true;
  const now = date.getTime();
  if (def.startAt && now < def.startAt) return false;
  if (def.endAt && now > def.endAt) return false;
  return true;
}

export function activeEvents(date: Date = new Date(), includeDemo = true): EventDef[] {
  const list = includeDemo ? EVENTS_ALL : EVENTS;
  return list.filter((e) => inWindow(e, date) || debugEventOverrides.has(e.id));
}

export function eventById(id: string): EventDef | undefined {
  return EVENTS_ALL.find((e) => e.id === id);
}

/** Status calculado do evento em um instante. */
export function eventStatus(def: EventDef, nowMs: number = Date.now()): EventStatus {
  if (debugEventOverrides.has(def.id)) return 'live';
  if (def.always) return 'live';
  if (!def.startAt || !def.endAt) return 'ended';
  if (nowMs < def.startAt) return 'upcoming';
  if (nowMs > def.endAt) {
    const archivedAfter = 30 * 24 * 3600 * 1000;
    return nowMs > def.endAt + archivedAfter ? 'archived' : 'ended';
  }
  const remaining = def.endAt - nowMs;
  return remaining < 24 * 3600 * 1000 ? 'ending_soon' : 'live';
}

/** Tempo restante até o fim (ms). 0 se encerrado. */
export function eventRemaining(def: EventDef, nowMs: number = Date.now()): number {
  if (!def.endAt) return def.always ? Infinity : 0;
  return Math.max(0, def.endAt - nowMs);
}

/** Tempo até o início (ms). 0 se já começou. */
export function eventUntilStart(def: EventDef, nowMs: number = Date.now()): number {
  if (!def.startAt) return 0;
  return Math.max(0, def.startAt - nowMs);
}

export function upcomingEvents(nowMs: number = Date.now()): EventDef[] {
  return EVENTS.filter((e) => !e.always && e.startAt && e.startAt > nowMs);
}

export function pastEvents(nowMs: number = Date.now()): EventDef[] {
  return EVENTS.filter((e) => !e.always && e.endAt && e.endAt < nowMs);
}

/** Bônus combinado de todos os eventos ativos. */
export function eventsBonus(events: EventDef[]): PartialModifiers {
  const out: PartialModifiers = {};
  for (const e of events) {
    for (const k of Object.keys(e.bonus) as (keyof ModifierSet)[]) {
      const v = e.bonus[k];
      if (v === undefined) continue;
      const prev = out[k];
      if (ADDITIVE_KEYS.has(k)) {
        out[k] = (prev ?? ZERO).plus(v);
      } else {
        out[k] = (prev ?? ONE).mul(v);
      }
    }
  }
  return out;
}

/** Bônus combinado de eventos ativos em um instante. */
export function activeEventsBonus(nowMs: number = Date.now()): PartialModifiers {
  return eventsBonus(activeEvents(new Date(nowMs), true));
}

