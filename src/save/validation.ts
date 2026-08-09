import { SAVE_VERSION, type GameState, defaultSettings, type AudioChannel } from '../game/types';
import { D, isFiniteDecimal } from '../core/bignum';
import { verifyPassReceipt } from '../security/passReceipt';
import { STAT_DEFAULTS } from '../game/stats';
import { UPGRADE_MAP } from '../shop/upgrades';
import { GENERATOR_MAP } from '../automation/generators';
import { SKILL_MAP } from '../progression/skillTree';
import { PET_MAP } from '../pets/pets';
import { EQUIPMENT_DEFS } from '../shop/equipment';
import { BOX_MAP } from '../shop/boxes';
import { QUEST_DEFS } from '../quests/quests';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  fixed: string[];
}

const RESOURCE_KEYS = ['energy', 'gold', 'crystals', 'fragments', 'essence', 'prestigeCoins', 'ascensionCoins', 'eventTokens', 'fichas', 'credits'] as const;

/**
 * Valida e corrige um save. Nunca bloqueia o jogador de forma irreversível:
 * valores impossíveis são corrigidos para valores seguros e registrados.
 */
export function validateState(raw: unknown): { state: GameState; result: ValidationResult } {
  const errors: string[] = [];
  const fixed: string[] = [];

  if (!raw || typeof raw !== 'object') {
    throw new Error('Save corrompido: estrutura inválida.');
  }
  const state = JSON.parse(JSON.stringify(raw)) as GameState;

  const fixRes = (key: string) => {
    const v = state[key as keyof GameState] as unknown;
    if (!isFiniteDecimal(v as never)) {
      state[key as keyof GameState] = '0' as never;
      fixed.push(`recurso ${key} inválido corrigido para 0`);
    } else if (D(v as never).isNegative()) {
      state[key as keyof GameState] = '0' as never;
      fixed.push(`recurso ${key} negativo corrigido para 0`);
    }
  };
  for (const k of RESOURCE_KEYS) fixRes(k);

  // stats: números válidos e não negativos
  for (const key of Object.keys(STAT_DEFAULTS)) {
    const v = state.stats?.[key] as never;
    if (!isFiniteDecimal(v)) {
      if (state.stats === undefined) state.stats = { ...STAT_DEFAULTS };
      state.stats[key] = '0';
      fixed.push(`stat ${key} inválido corrigido`);
    } else if (D(v).isNegative()) {
      state.stats[key] = '0';
      fixed.push(`stat ${key} negativo corrigido`);
    }
  }

  // contadores inteiros
  const intKeys: (keyof GameState)[] = ['level', 'skillPoints'];
  for (const k of intKeys) {
    const v = state[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      state[k] = 1 as never;
      fixed.push(`${k} inválido corrigido`);
    } else if (v < 0) {
      state[k] = 0 as never;
      fixed.push(`${k} negativo corrigido`);
    }
  }
  if (state.level < 1) { state.level = 1; fixed.push('nível mínimo 1'); }

  // upgrades: níveis não negativos, respeitando máximos
  if (state.upgrades && typeof state.upgrades === 'object') {
    for (const [id, lvl] of Object.entries(state.upgrades)) {
      const def = UPGRADE_MAP[id];
      if (!def) {
        delete state.upgrades[id];
        fixed.push(`upgrade ${id} inexistente removido`);
        continue;
      }
      const max = def.maxLevel;
      if (typeof lvl !== 'number' || !Number.isFinite(lvl)) {
        delete state.upgrades[id];
        fixed.push(`upgrade ${id} inválido removido`);
      } else if (lvl < 0) {
        state.upgrades[id] = 0;
        fixed.push(`upgrade ${id} negativo corrigido`);
      } else if (lvl > max + 10) {
        state.upgrades[id] = max;
        fixed.push(`upgrade ${id} acima do máximo corrigido`);
      }
    }
  }
  if (state.generators && typeof state.generators === 'object') {
    for (const [id, lvl] of Object.entries(state.generators)) {
      if (typeof lvl !== 'number' || !Number.isFinite(lvl) || lvl < 0) {
        if (!GENERATOR_MAP[id]) {
          delete state.generators[id];
        } else {
          state.generators[id] = 0;
        }
        fixed.push(`gerador ${id} corrigido`);
      }
    }
  }
  if (state.skills && typeof state.skills === 'object') {
    for (const [id, lvl] of Object.entries(state.skills)) {
      const max = SKILL_MAP[id]?.maxLevel ?? 50;
      if (typeof lvl !== 'number' || !Number.isFinite(lvl) || lvl < 0) {
        state.skills[id] = 0;
        fixed.push(`habilidade ${id} corrigida`);
      } else if (lvl > max) {
        state.skills[id] = max;
        fixed.push(`habilidade ${id} acima do máximo corrigida`);
      }
    }
  }

  // pets: estrutura válida
  if (state.pets && typeof state.pets === 'object') {
    for (const [id, pet] of Object.entries(state.pets) as [string, { level?: unknown; xp?: unknown; evolves?: unknown }][]) {
      if (!PET_MAP[id] || !pet || typeof pet !== 'object') {
        delete state.pets[id];
        fixed.push(`pet ${id} inexistente removido`);
        continue;
      }
      if (typeof pet.level !== 'number' || !Number.isFinite(pet.level) || pet.level < 1) pet.level = 1;
      if (!isFiniteDecimal(pet.xp as never) || D(pet.xp as never).isNegative()) pet.xp = '0';
      if (typeof pet.evolves !== 'number' || !Number.isFinite(pet.evolves)) pet.evolves = 0;
    }
  }
  if (!Array.isArray(state.petSlots) || state.petSlots.length !== 4) state.petSlots = [null, null, null, null];

  // equipamentos
  if (state.equipment && typeof state.equipment === 'object') {
    for (const [id, cnt] of Object.entries(state.equipment)) {
      if (!EQUIPMENT_DEFS[id] || typeof cnt !== 'number' || !Number.isFinite(cnt) || cnt < 0) {
        delete state.equipment[id];
        fixed.push(`equipamento ${id} corrigido`);
      }
    }
  }
  if (state.equipped && typeof state.equipped === 'object') {
    for (const [slot, id] of Object.entries(state.equipped)) {
      if (typeof id !== 'string' || !EQUIPMENT_DEFS[id]) {
        delete state.equipped[slot];
        fixed.push(`slot equipado ${slot} corrigido`);
      }
    }
  }

  // caixas
  if (state.boxes && typeof state.boxes === 'object') {
    for (const [id, cnt] of Object.entries(state.boxes)) {
      if (!BOX_MAP[id] && id !== 'basic') {
        delete state.boxes[id];
      } else if (typeof cnt !== 'number' || !Number.isFinite(cnt) || cnt < 0) {
        state.boxes[id] = 0;
        fixed.push(`caixa ${id} corrigida`);
      }
    }
  }

  // combo
  if (!state.combo || typeof state.combo !== 'object') {
    state.combo = { count: 0, lastClick: 0 };
    fixed.push('combo reiniciado');
  }

  // estruturas obrigatórias
  if (!state.quests || !Array.isArray(state.quests.daily) || !Array.isArray(state.quests.weekly) || !Array.isArray(state.quests.permanent)) {
    state.quests = { daily: [], weekly: [], permanent: [] };
    fixed.push('missões reinicializadas');
  }
  // garante que as missões permanentes existem (backfill para saves antigos)
  const permDefs = QUEST_DEFS.filter((q) => q.category === 'permanente');
  const havePerm = new Set(state.quests.permanent.map((q: { id: string }) => q.id));
  for (const d of permDefs) {
    if (!havePerm.has(d.id)) {
      state.quests.permanent.push({ id: d.id, progress: '0', claimed: false });
      fixed.push(`missão permanente ${d.id} adicionada`);
    }
  }
  if (!state.prestige || typeof state.prestige !== 'object') {
    state.prestige = { count: 0, totalFragments: '0', lastGain: '0', energyThisCycle: '0' };
    fixed.push('prestígio reinicializado');
  }
  if (!state.ascension || typeof state.ascension !== 'object') {
    state.ascension = { count: 0, worldsUnlocked: 1, lastGain: '0', fragmentsThisCycle: '0' };
  }
  if (!state.transcendence || typeof state.transcendence !== 'object') {
    state.transcendence = { count: 0, lastGain: '0', ascensionCoinsThisCycle: '0' };
  }
  if (!state.collection || typeof state.collection !== 'object') {
    state.collection = { pets: [], equipment: [], boxes: [], skins: [], titles: [] };
  }
  if (!state.events || typeof state.events !== 'object') state.events = {};
  if (!state.log || !Array.isArray(state.log)) state.log = [];
  if (!state.flags || typeof state.flags !== 'object') state.flags = {};
  // ── LiveOps 2.0 ──
  if (!state.skins || typeof state.skins !== 'object') {
    state.skins = { owned: [], favorites: [] };
    fixed.push('skins reinicializadas');
  } else {
    if (!Array.isArray(state.skins.owned)) state.skins.owned = [];
    if (!Array.isArray(state.skins.favorites)) state.skins.favorites = [];
    state.skins.owned = state.skins.owned.filter((x) => typeof x === 'string');
    state.skins.favorites = state.skins.favorites.filter((x) => typeof x === 'string');
  }
  if (typeof state.lastSeenVersion !== 'string') state.lastSeenVersion = '';
  if (!state.dailyLogin || typeof state.dailyLogin !== 'object') {
    state.dailyLogin = { lastClaim: 0, count: 0 };
  } else {
    if (typeof state.dailyLogin.lastClaim !== 'number' || !Number.isFinite(state.dailyLogin.lastClaim)) state.dailyLogin.lastClaim = 0;
    if (typeof state.dailyLogin.count !== 'number' || !Number.isFinite(state.dailyLogin.count) || state.dailyLogin.count < 0) state.dailyLogin.count = 0;
  }
  if (!state.passTracks || typeof state.passTracks !== 'object') {
    state.passTracks = {};
  } else {
    for (const [trackId, t] of Object.entries(state.passTracks)) {
      if (!t || typeof t !== 'object' || !isFiniteDecimal((t as { xp?: unknown }).xp as never)) {
        delete state.passTracks[trackId];
        continue;
      }
      if (D((t as { xp?: unknown }).xp as never).isNegative()) (t as { xp: string }).xp = '0';
      if (!Array.isArray(t.claimedFree)) t.claimedFree = [];
      if (!Array.isArray(t.claimedPremium)) t.claimedPremium = [];
      t.claimedFree = t.claimedFree.filter((n) => typeof n === 'number' && Number.isFinite(n));
      t.claimedPremium = t.claimedPremium.filter((n) => typeof n === 'number' && Number.isFinite(n));
    }
  }
  if (!Array.isArray(state.codes)) state.codes = [];
  else state.codes = state.codes.filter((x) => typeof x === 'string');
  if (!Array.isArray(state.premiumPasses)) state.premiumPasses = [];
  else state.premiumPasses = state.premiumPasses.filter((x) => typeof x === 'string');
  if (!Array.isArray(state.compensations)) state.compensations = [];
  else state.compensations = state.compensations.filter((x) => typeof x === 'string');
  if (!state.events || typeof state.events !== 'object') state.events = {};
  for (const [evId, st] of Object.entries(state.events)) {
    if (!st || typeof st !== 'object') {
      delete state.events[evId];
      continue;
    }
    if (!isFiniteDecimal(st.tokens as never) || D(st.tokens as never).isNegative()) st.tokens = '0';
    if (!Array.isArray(st.dailyClaimed)) st.dailyClaimed = [];
    st.dailyClaimed = st.dailyClaimed.filter((d) => typeof d === 'string');
  }

  // ranking local: mantém apenas entradas bem-formadas
  if (!Array.isArray(state.ranking)) {
    state.ranking = [];
  } else {
    const clean = state.ranking.filter(
      (r) =>
        r &&
        typeof r === 'object' &&
        ['prestige', 'ascension', 'transcendence'].includes(r.kind as string) &&
        isFiniteDecimal(r.gain as never) &&
        !D(r.gain as never).isNegative() &&
        typeof r.count === 'number' &&
        Number.isFinite(r.count) &&
        typeof r.at === 'number' &&
        Number.isFinite(r.at),
    );
    if (clean.length !== state.ranking.length) {
      state.ranking = clean;
      fixed.push('ranking com entradas inválidas corrigido');
    }
  }
  // carteira: remove o bloco antigo de saque (1.2.3 preliminar) — créditos não são sacáveis
  if ('wallet' in state) {
    delete (state as unknown as Record<string, unknown>).wallet;
    fixed.push('carteira de saque antiga removida');
  }
  // pedidos Pix: estrutura válida e limitada
  if (!state.pixOrders || typeof state.pixOrders !== 'object') {
    state.pixOrders = {};
  } else {
    for (const [id, o] of Object.entries(state.pixOrders)) {
      if (!o || typeof o !== 'object' || typeof o.packId !== 'string' || (o.status !== 'pending' && o.status !== 'done') || typeof o.at !== 'number' || !Number.isFinite(o.at)) {
        delete state.pixOrders[id];
        fixed.push(`pedido Pix ${id} inválido removido`);
      } else {
        if (typeof o.pixCode !== 'string') o.pixCode = undefined;
        if (typeof o.amountBRL !== 'number' || !Number.isFinite(o.amountBRL)) o.amountBRL = undefined;
      }
    }
    const pixKeys = Object.keys(state.pixOrders);
    if (pixKeys.length > 50) {
      // mantém os mais recentes (feito → pendente, preservando pendentes primeiro é melhor: filtrar antigos done)
      const sorted = pixKeys
        .map((k) => ({ k, o: state.pixOrders[k] }))
        .sort((a, b) => (a.o.status === 'pending' ? 0 : 1) - (b.o.status === 'pending' ? 0 : 1) || b.o.at - a.o.at);
      for (const { k } of sorted.slice(50)) delete state.pixOrders[k];
      fixed.push('pedidos Pix antigos limpos');
    }
  }
  if (typeof state.name !== 'string' || state.name.length === 0) state.name = 'Jogador';
  if (typeof state.schemaVersion !== 'number') state.schemaVersion = SAVE_VERSION;

  // ── Update 3.0: perfil, passe premium, avatarItems ──
  if (!state.profile || typeof state.profile !== 'object') {
    state.profile = { status: 'online', statusMessage: '', avatarIcon: 'av_default', avatarFrame: 'fr_none', avatarEffect: 'fx_none', avatarBadge: 'bd_none' };
    fixed.push('perfil reinicializado');
  } else {
    if (typeof state.profile.status !== 'string') state.profile.status = 'online';
    if (typeof state.profile.statusMessage !== 'string' || state.profile.statusMessage.length > 60) state.profile.statusMessage = state.profile.statusMessage.slice(0, 60);
    for (const k of ['avatarIcon', 'avatarFrame', 'avatarEffect', 'avatarBadge'] as const) {
      if (typeof state.profile[k] !== 'string') state.profile[k] = 'none';
    }
  }
  if (!state.premiumPass || typeof state.premiumPass !== 'object') {
    state.premiumPass = { owned: false, season: '', xp: 0, claimedFree: [], claimedPremium: [], purchaseTimestamp: 0, orderId: '', signature: '' };
    fixed.push('passe premium reinicializado');
  } else {
    if (typeof state.premiumPass.owned !== 'boolean') state.premiumPass.owned = false;
    if (typeof state.premiumPass.season !== 'string') state.premiumPass.season = '';
    if (typeof state.premiumPass.xp !== 'number' || !Number.isFinite(state.premiumPass.xp) || state.premiumPass.xp < 0) state.premiumPass.xp = 0;
    if (!Array.isArray(state.premiumPass.claimedFree)) state.premiumPass.claimedFree = [];
    if (!Array.isArray(state.premiumPass.claimedPremium)) state.premiumPass.claimedPremium = [];
    state.premiumPass.claimedFree = state.premiumPass.claimedFree.filter((n) => typeof n === 'number' && Number.isFinite(n));
    state.premiumPass.claimedPremium = state.premiumPass.claimedPremium.filter((n) => typeof n === 'number' && Number.isFinite(n));
    if (typeof state.premiumPass.purchaseTimestamp !== 'number' || !Number.isFinite(state.premiumPass.purchaseTimestamp)) state.premiumPass.purchaseTimestamp = 0;
    if (typeof state.premiumPass.orderId !== 'string') state.premiumPass.orderId = '';
    if (typeof state.premiumPass.signature !== 'string') state.premiumPass.signature = '';
    // integridade: posse exige recibo assinado que confere com os campos do save
    // (editar o save para `owned: true` sem compra real é revertido aqui)
    if (state.premiumPass.owned) {
      const playerId = typeof state.createdAt === 'number' && Number.isFinite(state.createdAt) ? state.createdAt : 0;
      const valid = verifyPassReceipt(state.premiumPass.signature, {
        orderId: state.premiumPass.orderId,
        timestamp: state.premiumPass.purchaseTimestamp,
        playerId,
      });
      if (!valid) {
        state.premiumPass.owned = false;
        state.premiumPass.orderId = '';
        state.premiumPass.signature = '';
        state.premiumPass.purchaseTimestamp = 0;
        state.premiumPass.claimedPremium = [];
        // rollback dos itens exclusivos concedidos na compra (consistência)
        for (const id of ['av_cyber', 'av_star', 'fr_premium', 'fx_premium', 'bd_premium']) {
          state.avatarItems = state.avatarItems.filter((x) => x !== id);
        }
        if (state.titles) {
          state.titles = state.titles.filter((t) => t !== 'pass_premium');
          if (state.equippedTitle === 'pass_premium') state.equippedTitle = null;
        }
        fixed.push('passe premium com recibo inválido — posse revogada');
      }
    }
  }
  if (!Array.isArray(state.avatarItems)) state.avatarItems = [];
  else state.avatarItems = state.avatarItems.filter((x) => typeof x === 'string');

  // settings: mescla com padrões (campos novos são preenchidos automaticamente)
  const def = defaultSettings();
  const merged = { ...def, ...(state.settings ?? {}) } as Record<string, unknown>;
  // deep-merge dos blocos aninhados
  for (const block of ['interface', 'gameplay', 'notifications', 'privacy'] as const) {
    const base = def[block] as unknown as Record<string, unknown>;
    const cur = (merged[block] ?? {}) as Record<string, unknown>;
    merged[block] = { ...base, ...cur };
  }
  // audio: merge POR CANAL — nunca perde canais ausentes em saves parciais
  {
    const base = def.audio as Record<string, unknown>;
    const cur = (merged.audio ?? {}) as Record<string, unknown>;
    const audio: Record<string, unknown> = {};
    for (const ch of Object.keys(base)) {
      audio[ch] = { ...(base[ch] as object), ...((cur[ch] ?? {}) as object) };
    }
    merged.audio = audio;
  }
  state.settings = merged as unknown as GameState['settings'];
  // sanidade de números em settings
  const set = state.settings;
  for (const ch of Object.keys(set.audio) as AudioChannel[]) {
    const a = set.audio[ch];
    if (!a || typeof a !== 'object') set.audio[ch] = { enabled: true, volume: 0.5 };
    else {
      if (typeof a.enabled !== 'boolean') a.enabled = true;
      if (typeof a.volume !== 'number' || !Number.isFinite(a.volume)) a.volume = 0.5;
      else a.volume = Math.min(1, Math.max(0, a.volume));
    }
  }
  set.theme = set.theme === 'neon' ? 'neon' : 'default';
  set.interface.uiScale = Math.min(1.3, Math.max(0.8, Number(set.interface.uiScale) || 1));
  set.interface.fontScale = Math.min(1.25, Math.max(0.85, Number(set.interface.fontScale) || 1));
  set.interface.transparency = Math.min(1, Math.max(0.5, Number(set.interface.transparency) || 0.96));
  set.interface.blur = Math.min(1, Math.max(0, Number(set.interface.blur) || 0));
  set.autoSaveMinutes = Math.min(60, Math.max(0.1, Number(set.autoSaveMinutes) || 1));
  set.offlineCapHours = Math.min(168, Math.max(1, Number(set.offlineCapHours) || 12));

  const ok = errors.length === 0;
  return { state, result: { ok, errors, fixed } };
}

/** Log interno anti-cheat (auditoria leve). */
export function appendLog(state: GameState, code: string, msg: string): void {
  state.log.push({ at: Date.now(), code, msg });
  if (state.log.length > 200) state.log.splice(0, state.log.length - 200);
}
