import { SAVE_VERSION, type GameState } from '../game/types';

type Migration = (s: any) => void;

/**
 * Migrações por versão de schema.
 * Save v1 → v2 → v3 ... — novas versões adicionam uma entrada aqui.
 */
const MIGRATIONS: Record<number, Migration> = {
  1: (s) => {
    // v1 → v2: adiciona contadores de ciclo de prestígio/ascensão
    s.prestige = s.prestige ?? { count: 0, totalFragments: '0', lastGain: '0', energyThisCycle: '0' };
    s.ascension = s.ascension ?? { count: 0, worldsUnlocked: 1, lastGain: '0', fragmentsThisCycle: '0' };
    s.transcendence = s.transcendence ?? { count: 0, lastGain: '0', ascensionCoinsThisCycle: '0' };
    s.events = s.events ?? {};
    s.log = s.log ?? [];
    s.flags = s.flags ?? {};
  },
  2: (s) => {
    // v2 → v3: adiciona coleção e títulos
    s.collection = s.collection ?? { pets: [], equipment: [], boxes: [], skins: [], titles: [] };
    s.titles = s.titles ?? [];
    s.equippedTitle = s.equippedTitle ?? null;
    // preenche coleção a partir do inventário existente
    if (s.pets && s.collection.pets.length === 0) s.collection.pets = Object.keys(s.pets);
    if (s.equipment && s.collection.equipment.length === 0) s.collection.equipment = Object.keys(s.equipment);
  },
  3: (s) => {
    // v3 → v4: adiciona ranking local (histórico de ciclos)
    s.ranking = s.ranking ?? [];
  },
  4: (s) => {
    // v4 → v5: LiveOps 2.0 — skins, passes, códigos, login diário, compensações
    s.skins = s.skins ?? { owned: [], favorites: [] };
    s.lastSeenVersion = s.lastSeenVersion ?? '';
    s.dailyLogin = s.dailyLogin ?? { lastClaim: 0, count: 0 };
    s.passTracks = s.passTracks ?? {};
    s.codes = s.codes ?? [];
    s.premiumPasses = s.premiumPasses ?? [];
    s.compensations = s.compensations ?? [];
    // eventos ganham dailyClaimed
    const evs = s.events ?? {};
    for (const k of Object.keys(evs)) {
      evs[k] = { tokens: '0', progress: {}, quests: [], questDay: '', dailyClaimed: [], ...evs[k] };
    }
    // skins antigas da coleção viram posse real
    if (Array.isArray(s.collection?.skins) && s.collection.skins.length > 0) {
      s.skins.owned = [...new Set([...(s.skins.owned ?? []), ...s.collection.skins])];
    }
  },
  5: (s) => {
    // v5 → v6: Update 3.0 — perfil (status/avatar), passe premium global, itens de avatar
    s.profile = s.profile ?? {
      status: 'online',
      statusMessage: '',
      avatarIcon: 'av_default',
      avatarFrame: 'fr_none',
      avatarEffect: 'fx_none',
      avatarBadge: 'bd_none',
    };
    s.premiumPass = s.premiumPass ?? {
      owned: false,
      season: '',
      xp: 0,
      claimedFree: [],
      claimedPremium: [],
      purchaseTimestamp: 0,
      orderId: '',
      signature: '',
    };
    s.avatarItems = s.avatarItems ?? [];
    // converte as settings de áudio antigas (planas) para o novo formato de canais
    if (s.settings && typeof s.settings === 'object' && !s.settings.audio) {
      const flat = s.settings as Record<string, unknown>;
      const audio: Record<string, { enabled?: boolean; volume?: number }> = {};
      if (typeof flat.musicEnabled === 'boolean' || typeof flat.musicVolume === 'number') {
        audio.music = { enabled: flat.musicEnabled as boolean, volume: flat.musicVolume as number };
      }
      if (typeof flat.sfxEnabled === 'boolean' || typeof flat.sfxVolume === 'number') {
        audio.sfx = { enabled: flat.sfxEnabled as boolean, volume: flat.sfxVolume as number };
      }
      if (Object.keys(audio).length > 0) s.settings.audio = audio;
      delete s.settings.musicEnabled;
      delete s.settings.musicVolume;
      delete s.settings.sfxEnabled;
      delete s.settings.sfxVolume;
    }
  },
  6: (s) => {
    // v6 → v7: Carteira — fichas 🎰 (compra via Pix) e créditos 💳 (convertidos em diamantes)
    s.fichas = s.fichas ?? '0';
    s.credits = s.credits ?? '0';
    // limpa o bloco antigo de saque (1.2.3 preliminar) — a carteira não saca dinheiro
    delete s.wallet;
  },
  7: (s) => {
    // v7 → v8: pedidos Pix pendentes (retomar polling após reiniciar o jogo)
    s.pixOrders = s.pixOrders ?? {};
  },
};

/** Aplica migrações até a versão atual. Retorna o estado migrado. */
export function migrateSave(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object') throw new Error('Save inválido');
  const s = raw as any;
  let version = typeof s.schemaVersion === 'number' ? s.schemaVersion : 1;
  if (version < 1) version = 1;

  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (step) step(s);
    version += 1;
    s.schemaVersion = version;
  }
  return s as GameState;
}
