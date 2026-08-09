/** Tipos centrais do jogo. */

export const SAVE_VERSION = 8;

export type RarityId =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'mythic'
  | 'divine'
  | 'celestial'
  | 'transcendent';

export type NotationMode = 'short' | 'standard' | 'scientific';

export type ThemeId = 'default' | 'neon';

export type PrivacyScope = 'public' | 'private' | 'local';

export type AudioChannel = 'music' | 'sfx' | 'ui' | 'events' | 'notifications' | 'ambient';

export interface NotificationPrefs {
  achievements: boolean;
  newSkin: boolean;
  newPet: boolean;
  newQuest: boolean;
  eventStarted: boolean;
  eventEnding: boolean;
  update: boolean;
  dailyReward: boolean;
  pass: boolean;
  offers: boolean;
}

export interface PrivacyPrefs {
  profile: PrivacyScope;
  stats: PrivacyScope;
  achievements: PrivacyScope;
  title: PrivacyScope;
  collection: PrivacyScope;
  pass: PrivacyScope;
  status: PrivacyScope;
}

export interface GameplayPrefs {
  autoCollect: boolean; // coleta automática de geradores (respeita desbloqueios)
  autoOpenBoxes: boolean; // abre caixas automaticamente quando disponível
  pauseIdle: boolean; // pausa produção passiva quando a janela fica oculta
  confirmPurchases: boolean;
  confirmPrestige: boolean;
  confirmAscension: boolean;
  showTutorials: boolean;
  showTips: boolean;
}

export interface InterfacePrefs {
  uiScale: number; // 0.8..1.3
  fontScale: number; // 0.85..1.25
  transparency: number; // 0..1 (opacidade do painel)
  animations: boolean;
  transitions: boolean;
  glowEffects: boolean;
  blur: number; // 0..1 intensidade de desfoque
}

export interface Settings {
  notation: NotationMode;
  region: string;
  numberFormat: 'pt-BR' | 'en-US';
  theme: ThemeId;
  audio: Record<AudioChannel, { enabled: boolean; volume: number }>;
  interface: InterfacePrefs;
  gameplay: GameplayPrefs;
  notifications: NotificationPrefs;
  privacy: PrivacyPrefs;
  showFloatingNumbers: boolean;
  showParticles: boolean;
  reducedMotion: boolean;
  autoSaveEnabled: boolean;
  autoSaveMinutes: number;
  showPopups: boolean;
  showNews: boolean;
  offlineCapHours: number;
  colorblindMode: boolean;
  debugMode: boolean;
  revealPremiumRewards: boolean;
}

export function defaultNotificationPrefs(): NotificationPrefs {
  return {
    achievements: true,
    newSkin: true,
    newPet: true,
    newQuest: true,
    eventStarted: true,
    eventEnding: true,
    update: true,
    dailyReward: true,
    pass: true,
    offers: false,
  };
}

export function defaultPrivacyPrefs(): PrivacyPrefs {
  return {
    profile: 'local',
    stats: 'local',
    achievements: 'local',
    title: 'local',
    collection: 'local',
    pass: 'local',
    status: 'local',
  };
}

export function defaultSettings(): Settings {
  return {
    notation: 'short',
    region: 'BR',
    numberFormat: 'pt-BR',
    theme: 'default',
    audio: {
      music: { enabled: true, volume: 0.4 },
      sfx: { enabled: true, volume: 0.7 },
      ui: { enabled: true, volume: 0.6 },
      events: { enabled: true, volume: 0.6 },
      notifications: { enabled: true, volume: 0.5 },
      ambient: { enabled: true, volume: 0.3 },
    },
    interface: {
      uiScale: 1,
      fontScale: 1,
      transparency: 0.96,
      animations: true,
      transitions: true,
      glowEffects: true,
      blur: 0.35,
    },
    gameplay: {
      autoCollect: false,
      autoOpenBoxes: false,
      pauseIdle: false,
      confirmPurchases: true,
      confirmPrestige: true,
      confirmAscension: true,
      showTutorials: true,
      showTips: true,
    },
    notifications: defaultNotificationPrefs(),
    privacy: defaultPrivacyPrefs(),
    showFloatingNumbers: true,
    showParticles: true,
    reducedMotion: false,
    autoSaveEnabled: true,
    autoSaveMinutes: 1,
    showPopups: true,
    showNews: true,
    offlineCapHours: 12,
    colorblindMode: false,
    debugMode: false,
    revealPremiumRewards: false,
  };
}

/** Estado do perfil do jogador (Update 3.0). */
export interface ProfileState {
  status: string; // StatusPreset
  statusMessage: string; // mensagem curta (limite em GameConfig)
  avatarIcon: string;
  avatarFrame: string;
  avatarEffect: string;
  avatarBadge: string;
}

/** Passe Premium global (Update 3.0). */
export interface PremiumPassState {
  owned: boolean;
  season: string; // temporada atual no momento da compra
  xp: number; // XP acumulada da temporada
  claimedFree: number[];
  claimedPremium: number[];
  purchaseTimestamp: number;
  /** Nº do pedido emitido pela processadora (recibo). */
  orderId: string;
  /** Assinatura do recibo — posse só é válida com assinatura que confere. */
  signature: string;
}

export interface PetInstance {
  id: string;
  level: number;
  xp: string; // Decimal string
  evolves: number;
}

export interface ActiveEffect {
  until: number; // timestamp ms
  stacks: number;
}

export interface QuestState {
  id: string;
  progress: string; // Decimal string
  claimed: boolean;
  expiresAt?: number;
}

export interface BoxHistoryEntry {
  boxId: string;
  label: string;
  rarity: RarityId;
  at: number;
}

/** Entrada do ranking local — um ciclo de prestígio/ascensão/transcendência concluído. */
export interface RunRecord {
  kind: 'prestige' | 'ascension' | 'transcendence';
  gain: string; // Decimal string — moeda da camada
  count: number; // nº do ciclo naquele momento
  at: number; // timestamp ms
}

export interface GameState {
  schemaVersion: number;
  name: string;
  createdAt: number;
  lastSeen: number; // timestamp ms do último tick/save
  playTimeSeconds: number;

  // configurações
  settings: Settings;

  // perfil (status, avatar, privacidade)
  profile: ProfileState;

  // passe premium global
  premiumPass: PremiumPassState;

  // recursos
  energy: string;
  gold: string;
  crystals: string;
  fragments: string;
  essence: string;
  prestigeCoins: string;
  ascensionCoins: string;
  eventTokens: string;
  /** Fichas 🎰 — compradas com dinheiro real via Pix (moeda da carteira). */
  fichas: string;
  /** Créditos 💳 — convertidos de fichas (1 ficha = 1 crédito) e gastos em Diamantes 💎. */
  credits: string;
  /** Pedidos Pix pendentes/confirmados — permitem retomar o polling após reiniciar o jogo. */
  pixOrders: Record<
    string,
    {
      packId: string;
      /** Nome legível do pacote (para exibir na retomada sem olhar catálogo). */
      label?: string;
      /** Conteúdo a conceder quando aprovado: moedas (string Decimal). */
      gold?: string;
      /** Conteúdo a conceder quando aprovado: diamantes. */
      diamonds?: number;
      /** Conteúdo a conceder quando aprovado: fichas. */
      fichas?: number;
      status: 'pending' | 'done';
      at: number;
      pixCode?: string;
      amountBRL?: number;
    }
  >;

  // nível
  level: number;
  xp: string;
  skillPoints: number;

  // compras permanentes
  upgrades: Record<string, number>;
  generators: Record<string, number>;
  consumables: Record<string, number>;
  activeEffects: Record<string, ActiveEffect>;

  // equipamento
  equipment: Record<string, number>; // itemId -> quantidade
  equipped: Record<string, string>; // slot -> itemId

  // pets
  pets: Record<string, PetInstance>;
  petSlots: (string | null)[];

  // caixas
  boxes: Record<string, number>;
  boxHistory: BoxHistoryEntry[];

  // árvore de habilidades
  skills: Record<string, number>;

  // missões
  quests: { daily: QuestState[]; weekly: QuestState[]; permanent: QuestState[] };
  questDay: string; // 'YYYY-MM-DD'
  questWeek: string; // 'YYYY-Www'

  // conquistas
  achievements: Record<string, number>; // id -> timestamp de desbloqueio

  // títulos
  titles: string[];
  equippedTitle: string | null;

  // prestígio / ascensão / transcendência
  prestige: { count: number; totalFragments: string; lastGain: string; energyThisCycle: string };
  ascension: { count: number; worldsUnlocked: number; lastGain: string; fragmentsThisCycle: string };
  transcendence: { count: number; lastGain: string; ascensionCoinsThisCycle: string };

  // coleção
  collection: {
    pets: string[];
    equipment: string[];
    boxes: string[];
    skins: string[];
    titles: string[];
  };

  // estatísticas (contadores de longa duração, sempre Decimal string)
  stats: Record<string, string>;

  // combo
  combo: { count: number; lastClick: number };

  // eventos
  events: Record<
    string,
    { tokens: string; progress: Record<string, string>; quests: QuestState[]; questDay: string; dailyClaimed: string[] }
  >;

  // log anti-cheat interno
  log: { at: number; code: string; msg: string }[];

  flags: Record<string, number>;

  // ranking local (histórico de ciclos de prestígio/ascensão/transcendência)
  ranking: RunRecord[];

  // ── LiveOps (Update 2.0) ─────────────────────────────────
  /** Skins possuídas e favoritas (cosméticos). */
  skins: { owned: string[]; favorites: string[] };
  /** Última versão vista pelo jogador (popup de atualização uma vez por versão). */
  lastSeenVersion: string;
  /** Login diário (7 dias): lastClaim = timestamp do último resgate, count = total. */
  dailyLogin: { lastClaim: number; count: number };
  /** Progresso de passes (eventos/temporadas): trackId → xp + níveis reivindicados. */
  passTracks: Record<string, { xp: string; claimedFree: number[]; claimedPremium: number[] }>;
  /** Códigos já resgatados. */
  codes: string[];
  /** Trilhas (evento/temporada) com passe premium liberado. */
  premiumPasses: string[];
  /** Compensações já recebidas. */
  compensations: string[];

  // ── Perfil / Passe Premium (Update 3.0) ─────────────────
  /** Avatares/molduras/efeitos/badges obtidos (além dos desbloqueios de progresso). */
  avatarItems: string[];
  /** Título 'pass_premium' / 'pass_omega' etc. são concedidos via passe. */
}

export type Bonuses = ModifierSet;

export interface ModifierSet {
  clickPower: DecimalValue;
  critChance: DecimalValue;
  critDamage: DecimalValue;
  superCritChance: DecimalValue;
  megaCritChance: DecimalValue;
  ultraCritChance: DecimalValue;
  production: DecimalValue;
  goldGain: DecimalValue;
  xpGain: DecimalValue;
  petPower: DecimalValue;
  luck: DecimalValue;
  comboDuration: DecimalValue;
  comboCap: DecimalValue;
  prestigeGain: DecimalValue;
  dropChance: DecimalValue;
  petFind: DecimalValue;
  autoClickSpeed: DecimalValue;
  energyPerClick: DecimalValue;
  discounts: DecimalValue;
  eventTokenChance: DecimalValue;
}

/** Tipo usado por valores decimais no runtime. */
export type DecimalValue = import('decimal.js').Decimal;
