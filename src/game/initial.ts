import { SAVE_VERSION, defaultSettings, type GameState, type QuestState } from './types';
import { STAT_DEFAULTS } from './stats';
import { QUEST_DEFS, rollDailyQuests, rollWeeklyQuests } from '../quests/quests';
import { todayKey, weekKey } from '../core/utils';
import { SEASON_ID } from '../content/seasons';

function defaultProfile() {
  return {
    status: 'online',
    statusMessage: '',
    avatarIcon: 'av_default',
    avatarFrame: 'fr_none',
    avatarEffect: 'fx_none',
    avatarBadge: 'bd_none',
  };
}

function defaultPremiumPass() {
  return {
    owned: false,
    season: '',
    xp: 0,
    claimedFree: [] as number[],
    claimedPremium: [] as number[],
    purchaseTimestamp: 0,
    orderId: '',
    signature: '',
  };
}

function questStates(defs: { id: string }[]): QuestState[] {
  return defs.map((d) => ({ id: d.id, progress: '0', claimed: false }));
}

export function createInitialState(name = 'Jogador'): GameState {
  const now = Date.now();
  const daily = rollDailyQuests(3);
  const weekly = rollWeeklyQuests(3);
  return {
    schemaVersion: SAVE_VERSION,
    name,
    createdAt: now,
    lastSeen: now,
    playTimeSeconds: 0,

    settings: defaultSettings(),

    profile: defaultProfile(),

    energy: '0',
    gold: '0',
    crystals: '0',
    fragments: '0',
    essence: '0',
    prestigeCoins: '0',
    ascensionCoins: '0',
    eventTokens: '0',
    fichas: '0',
    credits: '0',
    pixOrders: {},

    level: 1,
    xp: '0',
    skillPoints: 0,

    upgrades: {},
    generators: {},
    consumables: {},
    activeEffects: {},

    equipment: {},
    equipped: {},

    pets: {},
    petSlots: [null, null, null, null],

    boxes: { basic: 0 },
    boxHistory: [],

    skills: {},

    quests: {
      daily: questStates(daily),
      weekly: questStates(weekly),
      permanent: questStates(QUEST_DEFS.filter((q) => q.category === 'permanente')),
    },
    questDay: todayKey(),
    questWeek: weekKey(),

    achievements: {},

    titles: [],
    equippedTitle: null,

    prestige: { count: 0, totalFragments: '0', lastGain: '0', energyThisCycle: '0' },
    ascension: { count: 0, worldsUnlocked: 1, lastGain: '0', fragmentsThisCycle: '0' },
    transcendence: { count: 0, lastGain: '0', ascensionCoinsThisCycle: '0' },

    collection: { pets: [], equipment: [], boxes: [], skins: [], titles: [] },

    stats: { ...STAT_DEFAULTS },

    combo: { count: 0, lastClick: 0 },

    events: {},

    log: [],
    flags: {},

    ranking: [],

    skins: { owned: [], favorites: [] },
    lastSeenVersion: '',
    dailyLogin: { lastClaim: 0, count: 0 },
    passTracks: {},
    codes: [],
    premiumPasses: [],
    compensations: [],

    avatarItems: [],
    premiumPass: { ...defaultPremiumPass(), season: SEASON_ID },
  };
}

/** Cria o snapshot de progresso diário/semanal (zero no início). */
export function freshDailySnapshots(daily: { id: string }[]): QuestState[] {
  return questStates(daily);
}
