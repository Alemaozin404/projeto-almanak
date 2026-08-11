import {
  D, ONE, ZERO, type Num,
} from '../core/bignum';
import { baseModifiers, mergeModifiers, pct, scaleModifiers, type PartialModifiers } from '../core/modifiers';
import { bus } from '../core/events';
import { now, todayKey, weekKey, chance, randInt, pick, pickWeighted, addMs } from '../core/utils';
import type { Bonuses, GameState, QuestState, Settings } from './types';
import { createInitialState } from './initial';
import { incStat, setStatMax } from './stats';
import { appendLog } from '../save/validation';
import { xpForLevel, petXpForLevel, prestigeFragments, prestigeCoinsGain, ascensionCoins, transcendenceEssence, bulkCost, dynamicPrice } from '../economy/formulas';
import { UPGRADE_MAP } from '../shop/upgrades';
import { GENERATOR_DEFS, GENERATOR_MAP } from '../automation/generators';
import { CONSUMABLE_MAP } from '../shop/consumables';
import { EQUIPMENT_DEFS, EQUIPMENT_LIST, equipmentStatMultiplier, type EquipmentDef } from '../shop/equipment';
import { BOX_MAP, rollBoxRarity, rollBoxType, boxCostWithDiscount, type BoxDef, type BoxResult } from '../shop/boxes';
import { PET_MAP, PET_DEFS, petLevelMult, petEvolveMult } from '../pets/pets';
import { SKILL_MAP, canUnlock } from '../progression/skillTree';
import { questById, questProgress, rollDailyQuests, rollWeeklyQuests, isQuestComplete, type QuestDef } from '../quests/quests';
import { ACHIEVEMENTS, isAchievementUnlocked } from '../achievements/achievements';
import { TITLES, TITLE_MAP, titleBonusOf } from '../progression/titles';
import { activeEvents, eventById, eventsBonus, type EventDef } from '../content/events';
import { rarityOf } from '../core/rarities';
import { SKINS, SKIN_MAP, equippedSkin, isSkinOwned as skinOwnedCheck } from '../content/skins';
import { activeSeason, SEASON_ID } from '../content/seasons';
import { CODES } from '../content/codes';
import type { EventRewardSpec } from '../content/rewards';
import { GAME_VERSION, updateByVersion } from '../content/updates';
import { GameConfig } from '../config/GameConfig';
import { GAME_PASS_LEVELS, passLevelFromXp, passNextLevel } from '../pass/GamePass';
import { PASS_PRODUCT_ID, signPassReceipt, verifyPassReceipt } from '../security/passReceipt';
import { packById } from '../shop/packs';
import { fichaPackById, fichasToCredits, creditsToDiamonds, type PixOrderStatus } from '../wallet/pix';

/** Pacote comprável via Pix — o gateway online só valida o preço (packId) no servidor. */
export interface PixPackLike {
  id: string;
  name: string;
  priceBRL: number;
  fichas?: number;
  gold?: string;
  diamonds?: number;
}
import { resolvePixGateway } from '../wallet/mp';
import { STATUS_PRESETS, type StatusPreset } from '../profile/status';
import { AVATAR_CATALOG, avatarItemUnlocked, type AvatarItem } from '../profile/avatars';
import type { AudioChannel, PrivacyScope } from './types';

export type CritTier = 'normal' | 'crit' | 'super' | 'mega' | 'ultra';

export const CRIT_LABELS: Record<CritTier, string> = {
  normal: '',
  crit: 'CRÍTICO!',
  super: 'SUPER CRÍTICO!',
  mega: 'MEGA CRÍTICO!',
  ultra: 'ULTRA CRÍTICO!',
};

export interface ClickResult {
  gain: ReturnType<typeof D>;
  tier: CritTier;
  combo: number;
  comboMult: ReturnType<typeof D>;
}

export interface OfflineResult {
  seconds: number;
  energy: ReturnType<typeof D>;
  gold: ReturnType<typeof D>;
}

type ResourceKey = 'energy' | 'gold' | 'crystals' | 'fragments' | 'essence' | 'prestigeCoins' | 'ascensionCoins' | 'eventTokens' | 'fichas' | 'credits';

const RESOURCE_KEYS: ResourceKey[] = ['energy', 'gold', 'crystals', 'fragments', 'essence', 'prestigeCoins', 'ascensionCoins', 'eventTokens', 'fichas', 'credits'];

/** Recompensas do login diário (7 dias, ciclicas). */
const DAILY_LOGIN_REWARDS: EventRewardSpec[] = [
  { gold: '2500' },
  { gold: '2000' },
  { boxes: [{ boxId: 'basic', qty: 1 }] },
  { gold: '10000' },
  { gold: '5000' },
  { boxes: [{ boxId: 'basic', qty: 2 }] },
  { boxes: [{ boxId: 'event', qty: 1 }] },
];

/** Compensações administrativas (conteúdo local). */
const COMPENSATIONS: { id: string; name: string; icon: string; desc: string; reward: EventRewardSpec }[] = [
  {
    id: 'update20',
    name: 'Compensação 2.0',
    icon: '🎁',
    desc: 'Ajustes da atualização 2.0 — obrigado pela paciência.',
    reward: { gold: '10000000', boxes: [{ boxId: 'event', qty: 1 }], skins: ['cursor_bolt'] },
  },
];

export class GameEngine {
  state: GameState;
  version = 0;
  private _bonuses: Bonuses | null = null;
  private petSkillTimers: Record<string, number> = {};
  private passTickTimer = 0;
  private achTimer = 0;
  private listeners = new Set<() => void>();

  constructor(state?: GameState) {
    this.state = state ?? createInitialState();
  }

  // ── assinatura de UI ─────────────────────────────────────
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify(reason = 'tick'): void {
    this.version += 1;
    bus.emit('stateChange', { reason });
    this.listeners.forEach((f) => f());
  }

  updateSettings(patch: Partial<Settings>): void {
    this.state.settings = { ...this.state.settings, ...patch };
    this.notify('settings');
  }

  /** Atualiza um canal de áudio (volume/mudo) de forma segura. */
  setAudioChannel(channel: AudioChannel, patch: Partial<{ enabled: boolean; volume: number }>): void {
    const cur = this.state.settings.audio[channel] ?? { enabled: true, volume: 0.5 };
    const volume = patch.volume !== undefined ? Math.min(1, Math.max(0, patch.volume)) : cur.volume;
    this.state.settings.audio[channel] = {
      enabled: patch.enabled ?? cur.enabled,
      volume,
    };
    this.notify('settings');
  }

  /** Atualiza um bloco aninhado das configurações (interface/gameplay/notificações/privacidade). */
  updateSettingsBlock<K extends 'interface' | 'gameplay' | 'notifications' | 'privacy'>(
    block: K,
    patch: Partial<Settings[K]>,
  ): void {
    this.state.settings[block] = { ...this.state.settings[block], ...patch } as Settings[K];
    this.notify('settings');
  }

  /** Escopo de privacidade de uma seção (padrão: 'local' — só o jogador vê). */
  privacyOf(key: keyof Settings['privacy']): PrivacyScope {
    return this.state.settings.privacy[key] ?? 'local';
  }

  invalidate(): void {
    this._bonuses = null;
  }

  // ── recursos ─────────────────────────────────────────────
  getRes(key: ResourceKey): ReturnType<typeof D> {
    return D(this.state[key]);
  }

  setRes(key: ResourceKey, v: ReturnType<typeof D>): void {
    this.state[key] = v.toString();
  }

  addRes(key: ResourceKey, amount: ReturnType<typeof D>): void {
    if (amount.lte(ZERO)) return;
    this.setRes(key, this.getRes(key).plus(amount));
  }

  spend(key: ResourceKey, amount: ReturnType<typeof D>): boolean {
    if (amount.lte(ZERO)) return true;
    const cur = this.getRes(key);
    if (cur.lt(amount)) return false;
    this.setRes(key, cur.minus(amount));
    return true;
  }

  canAfford(key: ResourceKey, amount: ReturnType<typeof D>): boolean {
    return this.getRes(key).gte(amount);
  }

  // ── bônus centrais ───────────────────────────────────────
  bonuses(): Bonuses {
    if (!this._bonuses) this._bonuses = this.computeBonuses(true);
    return this._bonuses;
  }

  /** Bônus sem efeitos temporários (buffs/pets skills) — usado no offline. */
  bonusesPersistent(): Bonuses {
    return this.computeBonuses(false);
  }

  private computeBonuses(includeTimed: boolean): Bonuses {
    const s = this.state;
    let b = baseModifiers();

    // upgrades
    for (const [id, lvl] of Object.entries(s.upgrades)) {
      if (lvl <= 0) continue;
      const def = UPGRADE_MAP[id];
      if (def) b = mergeModifiers(b, def.effect(lvl));
    }

    // equipamentos equipados
    for (const itemId of Object.values(s.equipped)) {
      const def = EQUIPMENT_DEFS[itemId];
      if (!def) continue;
      const count = s.equipment[itemId] ?? 1;
      if (count <= 0) continue;
      b = mergeModifiers(b, this.equipStats(def, count));
    }

    // pets equipados
    for (const petId of s.petSlots) {
      if (!petId) continue;
      const inst = s.pets[petId];
      const def = PET_MAP[petId];
      if (!inst || !def) continue;
      const mult = petLevelMult(inst.level) * petEvolveMult(inst.evolves);
      b = mergeModifiers(b, scaleModifiers(def.bonus, mult));
    }

    // habilidades
    for (const [id, lvl] of Object.entries(s.skills)) {
      if (lvl <= 0) continue;
      const def = SKILL_MAP[id];
      if (def) b = mergeModifiers(b, def.effect(lvl));
    }

    // títulos
    b = mergeModifiers(b, titleBonusOf(s));

    // eventos
    const evts = activeEvents(new Date(), true);
    if (evts.length > 0) {
      b = mergeModifiers(b, eventsBonus(evts));
      for (const e of evts) {
        for (const it of e.shop) {
          if (it.type === 'permanent' && it.value && s.flags[it.value]) {
            if (it.value === 'natal_perma') b = mergeModifiers(b, pct({ production: 10 }));
            if (it.value === 'hall_perma') b = mergeModifiers(b, pct({ clickPower: 10 }));
            if (it.value === 'verao_perma') b = mergeModifiers(b, pct({ goldGain: 10 }));
            if (it.value === 'cyber_perma') b = mergeModifiers(b, pct({ production: 10 }));
            if (it.value === 'lunar_perma') b = mergeModifiers(b, pct({ luck: 10 }));
          }
        }
      }
    }

    // prestígio / ascensão / transcendência (camadas permanentes)
    const prestigeMult = 1 + s.prestige.count * 0.25;
    const ascMult = 1 + (s.ascension.worldsUnlocked - 1);
    const transMult = 1 + (s.flags.essenceSpentTotal ?? 0) * 0.05;
    const layers = D(prestigeMult).mul(ascMult).mul(transMult);
    b = mergeModifiers(b, {
      clickPower: layers,
      production: layers,
    });

    // skin equipada — bônus pequeno e opcional (cosmético por padrão)
    const skinBonus = equippedSkin(s).bonus;
    if (skinBonus) b = mergeModifiers(b, skinBonus);

    // efeitos temporários (buffs e skills de pets)
    if (includeTimed) {
      for (const [buffId, eff] of Object.entries(s.activeEffects)) {
        if (eff.until <= now()) continue;
        if (buffId.startsWith('pet_skill_')) {
          const def = PET_MAP[buffId.slice('pet_skill_'.length)];
          if (def?.skill) {
            if (def.skill.type === 'production') b = mergeModifiers(b, { production: D(def.skill.mult) });
            else b = mergeModifiers(b, { clickPower: D(def.skill.mult) });
          }
        } else {
          switch (buffId) {
            case 'click_x2': b = mergeModifiers(b, { clickPower: D(eff.stacks) }); break;
            case 'prod_x2': b = mergeModifiers(b, { production: D(eff.stacks) }); break;
            case 'gold_x2': b = mergeModifiers(b, { goldGain: D(eff.stacks) }); break;
          }
        }
      }
    }

    return b;
  }

  private equipStats(def: EquipmentDef, count: number): PartialModifiers {
    return scaleModifiers(def.stats, equipmentStatMultiplier(count));
  }

  critBoost(): number {
    const eff = this.state.activeEffects.crit_boost;
    return eff && eff.until > now() ? 0.25 : 0;
  }

  // ── produção ─────────────────────────────────────────────
  energyPerSec(b?: Bonuses): ReturnType<typeof D> {
    const bb = b ?? this.bonuses();
    let total = ZERO;
    for (const g of GENERATOR_DEFS) {
      if (g.type !== 'energy') continue;
      const lvl = this.state.generators[g.id] ?? 0;
      if (lvl > 0) total = total.plus(D(g.baseProduction).mul(lvl));
    }
    return total.mul(bb.production);
  }

  goldPerSec(b?: Bonuses): ReturnType<typeof D> {
    const bb = b ?? this.bonuses();
    let total = ZERO;
    for (const g of GENERATOR_DEFS) {
      if (g.type !== 'gold') continue;
      const lvl = this.state.generators[g.id] ?? 0;
      if (lvl > 0) total = total.plus(D(g.baseProduction).mul(lvl));
    }
    return total.mul(bb.goldGain);
  }

  autoClicksPerSec(b?: Bonuses): ReturnType<typeof D> {
    const bb = b ?? this.bonuses();
    const lvl = this.state.generators.auto_clicker ?? 0;
    return D(0.5).mul(lvl).mul(bb.autoClickSpeed);
  }

  /** Custo com desconto aplicado. */
  costFactor(): number {
    const disc = this.bonuses().discounts.minus(1).toNumber();
    return 1 - Math.min(0.9, Math.max(0, disc));
  }

  /** Fator global de recompensas em moedas 🪙 (economia endurecida — todas as fontes pagam menos). */
  private goldReward(amount: Num): ReturnType<typeof D> {
    return D(amount).mul(GameConfig.economy.goldRewardScale).floor();
  }

  // ── clique ───────────────────────────────────────────────
  click(source: 'manual' | 'key' | 'auto' = 'manual'): ClickResult {
    const s = this.state;
    const b = this.bonuses();
    const isManual = source !== 'auto';
    const nowMs = now();

    let comboMult = ONE;
    if (isManual) {
      const cap = Math.max(1, Math.floor(b.comboCap.toNumber()));
      s.combo.count = Math.min(cap, s.combo.count + 1);
      s.combo.lastClick = nowMs;
      setStatMax(s, 'comboMax', D(s.combo.count));
      comboMult = D(1).plus(D(s.combo.count).mul(0.01));
    }

    let tier: CritTier = 'normal';
    let mult = ONE;
    const critChance = b.critChance.toNumber() + this.critBoost();
    const r = Math.random();
    const ultra = b.ultraCritChance.toNumber();
    const mega = b.megaCritChance.toNumber();
    const sup = b.superCritChance.toNumber();
    if (r < ultra) { tier = 'ultra'; mult = b.critDamage.mul(1000); }
    else if (r < ultra + mega) { tier = 'mega'; mult = b.critDamage.mul(100); }
    else if (r < ultra + mega + sup) { tier = 'super'; mult = b.critDamage.mul(10); }
    else if (r < ultra + mega + sup + critChance) { tier = 'crit'; mult = b.critDamage; }

    const gain = D(1).plus(b.energyPerClick).mul(b.clickPower).mul(comboMult).mul(mult);

    this.addRes('energy', gain);
    incStat(s, 'energyProduced', gain);
    setStatMax(s, 'biggestClick', gain);

    if (tier !== 'normal') {
      incStat(s, 'crits', D(1));
      setStatMax(s, 'biggestCrit', gain);
      if (tier === 'super') incStat(s, 'superCrits', D(1));
      if (tier === 'mega') incStat(s, 'megaCrits', D(1));
      if (tier === 'ultra') incStat(s, 'ultraCrits', D(1));
    }

    if (isManual) {
      incStat(s, 'clicks', D(1));
      this.addXp(D(0.05).mul(b.xpGain));
      // XP do Passe Premium global (tetado diariamente)
      this.addPassXp(GameConfig.pass.xpPerClick);
      // drop de ouro
      if (chance(b.dropChance.toNumber())) {
        const gold = gain.mul(0.05).mul(b.goldGain).mul(GameConfig.economy.goldRewardScale);
        if (gold.gt(ZERO)) {
          this.addRes('gold', gold);
          incStat(s, 'goldEarned', gold);
          incStat(s, 'goldDrops', D(1));
        }
      }
      // moeda e XP de evento (garantidos em cada clique manual)
      const evts = activeEvents(new Date(), true);
      const luckB = Math.max(0, b.luck.toNumber());
      if (evts.length > 0) {
        for (const e of evts) {
          const st = this.eventState(e);
          const cur = D(1).plus(D(luckB));
          st.tokens = D(st.tokens).plus(cur).toString();
          this.trackXp(`ev_${e.id}`, D(1).plus(D(luckB).div(2)));
          incStat(s, 'eventTokens', cur);
        }
        // tokens de evento globais (drops raros)
        if (chance(b.eventTokenChance.toNumber())) {
          const n = randInt(1, 3);
          this.addRes('eventTokens', D(n));
          incStat(s, 'eventTokens', D(n));
        }
      }
      // XP de temporada ativa
      const season = activeSeason();
      if (season) this.trackXp(`season_${season.id}`, D(1).plus(D(luckB).div(2)));
    } else {
      incStat(s, 'clicksAuto', D(1));
    }

    this.checkAchievements();
    this.checkQuests();
    this.checkTitles();
    this.notify('click');
    bus.emit('floating', { amount: gain.toFixed(0), x: 0, y: 0, crit: tier !== 'normal', label: CRIT_LABELS[tier] });
    return { gain, tier, combo: s.combo.count, comboMult };
  }

  // ── XP / nível ───────────────────────────────────────────
  addXp(amount: ReturnType<typeof D>): void {
    if (amount.lte(ZERO)) return;
    const s = this.state;
    s.xp = D(s.xp).plus(amount).toString();
    incStat(s, 'xpEarned', amount);
    let ups = 0;
    while (D(s.xp).gte(xpForLevel(s.level)) && ups < 500) {
      s.xp = D(s.xp).minus(xpForLevel(s.level)).toString();
      s.level += 1;
      s.skillPoints += 1;
      ups += 1;
    }
    if (ups > 0) {
      bus.emit('levelUp', { level: s.level });
      bus.emit('notify', { kind: 'level', title: `Nível ${s.level}!`, desc: `+1 ponto de habilidade` });
      this.invalidate();
    }
  }

  // ── upgrades / geradores ─────────────────────────────────
  upgradeLevel(id: string): number {
    return this.state.upgrades[id] ?? 0;
  }

  upgradeCost(id: string): ReturnType<typeof D> {
    const def = UPGRADE_MAP[id];
    if (!def) return ZERO;
    const lvl = this.upgradeLevel(id);
    if (lvl >= def.maxLevel) return D(-1);
    return bulkCost(def.baseCost, def.costMult, lvl, 1).mul(this.costFactor());
  }

  buyUpgrade(id: string, qty = 1): { ok: boolean; reason?: string } {
    const s = this.state;
    const def = UPGRADE_MAP[id];
    if (!def) return { ok: false, reason: 'Upgrade inexistente' };
    if (s.level < def.unlockLevel) return { ok: false, reason: `Requer nível ${def.unlockLevel}` };
    const lvl = this.upgradeLevel(id);
    if (lvl >= def.maxLevel) return { ok: false, reason: 'Nível máximo' };
    const qtyMax = Math.min(qty, def.maxLevel - lvl);
    const cost = bulkCost(def.baseCost, def.costMult, lvl, qtyMax).mul(this.costFactor());
    if (!this.spend(def.currency, cost)) return { ok: false, reason: 'Fundos insuficientes' };
    s.upgrades[id] = lvl + qtyMax;
    incStat(s, 'upgradesBought', D(qtyMax));
    this.addXp(D(5).mul(qtyMax));
    this.invalidate();
    this.checkAchievements();
    this.notify('buy');
    return { ok: true };
  }

  generatorLevel(id: string): number {
    return this.state.generators[id] ?? 0;
  }

  generatorCost(id: string): ReturnType<typeof D> {
    const def = GENERATOR_MAP[id];
    if (!def) return ZERO;
    return bulkCost(def.baseCost, def.costMult, this.generatorLevel(id), 1).mul(this.costFactor());
  }

  buyGenerator(id: string, qty = 1): { ok: boolean; reason?: string } {
    const s = this.state;
    const def = GENERATOR_MAP[id];
    if (!def) return { ok: false, reason: 'Gerador inexistente' };
    if (s.level < def.unlockLevel) return { ok: false, reason: `Requer nível ${def.unlockLevel}` };
    const cost = bulkCost(def.baseCost, def.costMult, this.generatorLevel(id), qty).mul(this.costFactor());
    if (!this.spend(def.currency, cost)) return { ok: false, reason: 'Fundos insuficientes' };
    s.generators[id] = (s.generators[id] ?? 0) + qty;
    incStat(s, 'generatorsBought', D(qty));
    this.addXp(D(10).mul(qty));
    this.invalidate();
    this.checkAchievements();
    this.notify('buy');
    return { ok: true };
  }

  // ── consumíveis ──────────────────────────────────────────
  consumableCount(id: string): number {
    return this.state.consumables[id] ?? 0;
  }

  buyConsumable(id: string, qty = 1): { ok: boolean; reason?: string } {
    const def = CONSUMABLE_MAP[id];
    if (!def) return { ok: false, reason: 'Item inexistente' };
    const cost = D(def.cost).mul(qty).mul(this.costFactor());
    if (!this.spend(def.currency, cost)) return { ok: false, reason: 'Fundos insuficientes' };
    this.state.consumables[id] = (this.state.consumables[id] ?? 0) + qty;
    this.notify('buy');
    return { ok: true };
  }

  useConsumable(id: string): { ok: boolean; reason?: string } {
    const s = this.state;
    const def = CONSUMABLE_MAP[id];
    if (!def) return { ok: false, reason: 'Item inexistente' };
    const count = this.consumableCount(id);
    if (count <= 0) return { ok: false, reason: 'Sem itens' };

    if (def.durationMs > 0 && def.buffId) {
      s.activeEffects[def.buffId] = { until: addMs(def.durationMs), stacks: def.buffMult ?? 2 };
      this.invalidate();
      bus.emit('notify', { kind: 'buff', title: `${def.name} ativo!`, desc: def.desc });
    } else if (def.instant === 'gold') {
      const perSec = this.goldPerSec();
      const amt = perSec.mul(3600).mul(def.instantAmountHours ?? 1);
      const final = amt.gt(ZERO) ? amt : D(1000).mul(GameConfig.economy.goldRewardScale).mul(def.instantAmountHours ?? 1);
      this.addRes('gold', final);
      incStat(s, 'goldEarned', final);
    } else if (def.instant === 'energy') {
      const perSec = this.energyPerSec();
      const amt = perSec.mul(1800).mul(def.instantAmountHours ?? 0.5);
      const final = amt.gt(ZERO) ? amt : D(1000).mul(def.instantAmountHours ?? 0.5);
      this.addRes('energy', final);
      incStat(s, 'energyProduced', final);
    } else if (def.instant === 'petxp') {
      const petId = s.petSlots.find((p) => p && s.pets[p]) ?? undefined;
      if (!petId) return { ok: false, reason: 'Equipe um pet primeiro' };
      const pet = s.pets[petId];
      const defP = PET_MAP[petId];
      const xp = D(150).mul(rarityOf(defP.rarity).mult).mul(pet.level);
      pet.xp = D(pet.xp).plus(xp).toString();
      this.petLevelUp(petId);
    } else if (def.instant === 'box') {
      s.boxes.basic = (s.boxes.basic ?? 0) + 1;
    }
    s.consumables[id] = count - 1;
    this.checkAchievements();
    this.notify('use');
    return { ok: true };
  }

  // ── equipamentos ─────────────────────────────────────────
  equipmentCost(itemId: string): ReturnType<typeof D> {
    const def = EQUIPMENT_DEFS[itemId];
    if (!def) return ZERO;
    const owned = this.state.equipment[itemId] ?? 0;
    return D(def.baseValue).mul(D(1.6).pow(owned)).mul(this.costFactor());
  }

  buyEquipment(itemId: string): { ok: boolean; reason?: string } {
    const s = this.state;
    const def = EQUIPMENT_DEFS[itemId];
    if (!def) return { ok: false, reason: 'Item inexistente' };
    if (s.level < def.unlockLevel) return { ok: false, reason: `Requer nível ${def.unlockLevel}` };
    const cost = this.equipmentCost(itemId);
    if (!this.spend('gold', cost)) return { ok: false, reason: 'Moedas insuficientes' };
    this.obtainEquipment(itemId, 1);
    this.notify('buy');
    return { ok: true };
  }

  obtainEquipment(itemId: string, count = 1): void {
    const def = EQUIPMENT_DEFS[itemId];
    if (!def) return;
    const s = this.state;
    s.equipment[itemId] = (s.equipment[itemId] ?? 0) + count;
    if (!s.collection.equipment.includes(itemId)) s.collection.equipment.push(itemId);
    incStat(s, 'equipmentFound', D(count));
    this.invalidate();
  }

  equipItem(itemId: string): void {
    const def = EQUIPMENT_DEFS[itemId];
    if (!def) return;
    if ((this.state.equipment[itemId] ?? 0) <= 0) return;
    this.state.equipped[def.slot] = itemId;
    this.invalidate();
    this.notify('equip');
  }

  unequipSlot(slot: string): void {
    delete this.state.equipped[slot];
    this.invalidate();
    this.notify('equip');
  }

  sellPreview(itemId: string): ReturnType<typeof D> {
    const def = EQUIPMENT_DEFS[itemId];
    const count = this.state.equipment[itemId] ?? 0;
    if (!def || count <= 0) return ZERO;
    return D(def.baseValue).mul(0.5).mul(equipmentStatMultiplier(count)).mul(GameConfig.economy.goldRewardScale);
  }

  sellEquipment(itemId: string): { ok: boolean; reason?: string } {
    const s = this.state;
    const def = EQUIPMENT_DEFS[itemId];
    const count = s.equipment[itemId] ?? 0;
    if (!def || count <= 0) return { ok: false, reason: 'Nada para vender' };
    const price = D(def.baseValue).mul(0.5).mul(equipmentStatMultiplier(count)).mul(GameConfig.economy.goldRewardScale);
    this.addRes('gold', price);
    incStat(s, 'goldEarned', price);
    if (count === 1) {
      delete s.equipment[itemId];
      if (s.equipped[def.slot] === itemId) delete s.equipped[def.slot];
    } else {
      s.equipment[itemId] = count - 1;
    }
    this.invalidate();
    this.notify('sell');
    return { ok: true };
  }

  // ── pets ─────────────────────────────────────────────────
  grantPet(petId: string): 'new' | 'duplicate' {
    const s = this.state;
    const def = PET_MAP[petId];
    if (!def) return 'new';
    const existing = s.pets[petId];
    if (existing) {
      const xp = D(150).mul(rarityOf(def.rarity).mult).mul(existing.level);
      existing.xp = D(existing.xp).plus(xp).toString();
      this.petLevelUp(petId);
      return 'duplicate';
    }
    s.pets[petId] = { id: petId, level: 1, xp: '0', evolves: 0 };
    if (!s.collection.pets.includes(petId)) s.collection.pets.push(petId);
    incStat(s, 'petsFound', D(1));
    this.invalidate();
    return 'new';
  }

  petLevelUp(petId: string): void {
    const pet = this.state.pets[petId];
    if (!pet) return;
    let ups = 0;
    while (D(pet.xp).gte(petXpForLevel(pet.level)) && ups < 100) {
      pet.xp = D(pet.xp).minus(petXpForLevel(pet.level)).toString();
      pet.level += 1;
      ups += 1;
    }
    if (ups > 0) this.invalidate();
  }

  equipPet(petId: string): void {
    const s = this.state;
    if (!s.pets[petId]) return;
    if (s.petSlots.includes(petId)) return;
    const idx = s.petSlots.indexOf(null);
    if (idx === -1) return;
    s.petSlots[idx] = petId;
    this.invalidate();
    this.notify('pet');
  }

  unequipPet(petId: string): void {
    const s = this.state;
    const idx = s.petSlots.indexOf(petId);
    if (idx !== -1) s.petSlots[idx] = null;
    this.invalidate();
    this.notify('pet');
  }

  evolvePet(petId: string): { ok: boolean; reason?: string } {
    const s = this.state;
    const pet = s.pets[petId];
    const def = PET_MAP[petId];
    if (!pet || !def) return { ok: false, reason: 'Pet inexistente' };
    if (!def.evolves) return { ok: false, reason: 'Este pet não pode evoluir' };
    const cost = D(1000).mul(rarityOf(def.rarity).mult).mul(pet.level);
    if (!this.spend('gold', cost)) return { ok: false, reason: 'Moedas insuficientes' };
    pet.evolves += 1;
    this.invalidate();
    this.notify('pet');
    bus.emit('notify', { kind: 'pet', title: `${def.name} evoluiu!`, desc: `Evolução ${pet.evolves} — bônus dobrado` });
    return { ok: true };
  }

  sellPet(petId: string): { ok: boolean; reason?: string } {
    const s = this.state;
    const pet = s.pets[petId];
    const def = PET_MAP[petId];
    if (!pet || !def) return { ok: false, reason: 'Pet inexistente' };
    const gold = D(100).mul(rarityOf(def.rarity).mult).mul(pet.level).mul(GameConfig.economy.goldRewardScale);
    this.addRes('gold', gold);
    incStat(s, 'goldEarned', gold);
    if (rarityOf(def.rarity).order >= 4) {
      const frags = D(pet.level).div(10).floor();
      if (frags.gt(ZERO)) this.addRes('fragments', frags);
    }
    delete s.pets[petId];
    this.unequipPet(petId);
    this.notify('pet');
    return { ok: true };
  }

  feedPet(petId: string): void {
    const def = CONSUMABLE_MAP.pet_food;
    const count = this.consumableCount('pet_food');
    if (!def || count <= 0) return;
    const pet = this.state.pets[petId];
    if (!pet) return;
    const defP = PET_MAP[petId];
    const xp = D(150).mul(rarityOf(defP.rarity).mult).mul(pet.level);
    pet.xp = D(pet.xp).plus(xp).toString();
    this.petLevelUp(petId);
    this.state.consumables.pet_food = count - 1;
    this.notify('pet');
  }

  // ── caixas ───────────────────────────────────────────────
  boxCount(boxId: string): number {
    return this.state.boxes[boxId] ?? 0;
  }

  boxBuyCost(boxId: string): ReturnType<typeof D> {
    const box = BOX_MAP[boxId];
    if (!box) return ZERO;
    const discPct = this.bonuses().discounts.minus(1).mul(100).toNumber();
    return D(boxCostWithDiscount(box, discPct));
  }

  buyBox(boxId: string, qty = 1): { ok: boolean; reason?: string } {
    const s = this.state;
    const box = BOX_MAP[boxId];
    if (!box) return { ok: false, reason: 'Caixa inexistente' };
    if (s.level < box.unlockLevel) return { ok: false, reason: `Requer nível ${box.unlockLevel}` };
    const price = this.boxBuyCost(boxId).mul(qty);
    if (!this.spend(box.currency, price)) return { ok: false, reason: 'Fundos insuficientes' };
    s.boxes[boxId] = (s.boxes[boxId] ?? 0) + qty;
    this.notify('buy');
    return { ok: true };
  }

  openBox(boxId: string, count: number): BoxResult[] | null {
    const s = this.state;
    const box = BOX_MAP[boxId];
    if (!box) return null;
    const owned = s.boxes[boxId] ?? 0;
    const n = Math.min(count, owned);
    if (n <= 0) return null;
    s.boxes[boxId] = owned - n;

    const luck = this.bonuses().luck.toNumber();
    const results: BoxResult[] = [];
    for (let i = 0; i < n; i++) {
      const res = this.rollLoot(box, luck);
      this.applyLoot(res);
      results.push(res);
      s.boxHistory.push({ boxId, label: res.label, rarity: res.rarity, at: now() });
      if (s.boxHistory.length > 100) s.boxHistory.shift();
    }
    if (!s.collection.boxes.includes(boxId)) s.collection.boxes.push(boxId);
    incStat(s, 'boxesOpened', D(n));
    this.checkAchievements();
    this.checkQuests();
    this.notify('box');
    bus.emit('boxOpened', { boxId, results });
    return results;
  }

  private worldGate(order: number): boolean {
    return order <= this.state.ascension.worldsUnlocked + 4;
  }

  private rollLoot(box: BoxDef, luckMult: number): BoxResult {
    const type = rollBoxType(box);
    const rarity = rollBoxRarity(box, luckMult);

    if (type === 'pet') {
      let pool = PET_DEFS.filter((p) => p.rarity === rarity && this.worldGate(rarityOf(p.rarity).order));
      if (pool.length === 0) pool = PET_DEFS.filter((p) => this.worldGate(rarityOf(p.rarity).order));
      if (pool.length === 0) pool = PET_DEFS;
      const petFind = this.bonuses().petFind.toNumber();
      const entries = pool.map((p): [typeof p, number] => [p, this.state.pets[p.id] ? 1 : Math.max(1, 3 * petFind)]);
      const pet = pickWeighted(entries);
      return { kind: 'pet', itemId: pet.id, label: pet.name, rarity: pet.rarity, amount: '1' };
    }

    if (type === 'equipment') {
      let pool = EQUIPMENT_LIST.filter((e) => e.rarity === rarity && this.worldGate(rarityOf(e.rarity).order));
      if (pool.length === 0) pool = EQUIPMENT_LIST.filter((e) => this.worldGate(rarityOf(e.rarity).order));
      if (pool.length === 0) pool = EQUIPMENT_LIST;
      const eq = pick(pool);
      return { kind: 'equipment', itemId: eq.id, label: eq.name, rarity: eq.rarity, amount: '1' };
    }

    if (type === 'resource') {
      const order = rarityOf(rarity).order;
      const goldAmt = D(1000).mul(D(25).pow(order)).mul(GameConfig.economy.goldRewardScale);
      if (Math.random() < 0.35) {
        // bônus raro: dobro de moedas (diamantes viraram moeda exclusivamente paga)
        return { kind: 'resource', itemId: 'gold', label: 'Moedas', rarity, amount: goldAmt.mul(2).toFixed(0) };
      }
      return { kind: 'resource', itemId: 'gold', label: 'Moedas', rarity, amount: goldAmt.toFixed(0) };
    }

    if (type === 'consumable') {
      const c = pick(Object.values(CONSUMABLE_MAP));
      return { kind: 'consumable', itemId: c.id, label: c.name, rarity, amount: String(randInt(1, 3)) };
    }

    return { kind: 'ticket', itemId: 'box_ticket', label: 'Ticket de Caixa', rarity, amount: '1' };
  }

  private applyLoot(res: BoxResult): void {
    if (res.kind === 'pet') {
      const kind = this.grantPet(res.itemId);
      const def = PET_MAP[res.itemId];
      bus.emit('petFound', { id: res.itemId, name: def.name, rarity: def.rarity });
      if (kind === 'new') {
        bus.emit('notify', { kind: 'pet', title: `Novo pet: ${def.name}!`, desc: def.desc });
      } else {
        bus.emit('notify', { kind: 'pet', title: `${def.name} ganhou XP!`, desc: 'Duplicata combinada automaticamente.' });
      }
    } else if (res.kind === 'equipment') {
      this.obtainEquipment(res.itemId, 1);
    } else if (res.kind === 'resource') {
      this.addRes('gold', D(res.amount));
      incStat(this.state, 'goldEarned', D(res.amount));
    } else if (res.kind === 'consumable') {
      this.state.consumables[res.itemId] = (this.state.consumables[res.itemId] ?? 0) + Number(res.amount);
    } else {
      this.state.consumables.box_ticket = (this.state.consumables.box_ticket ?? 0) + 1;
    }
  }

  // ── habilidades ──────────────────────────────────────────
  skillLevel(id: string): number {
    return this.state.skills[id] ?? 0;
  }

  buySkill(id: string): { ok: boolean; reason?: string } {
    const s = this.state;
    const def = SKILL_MAP[id];
    if (!def) return { ok: false, reason: 'Habilidade inexistente' };
    const lvl = this.skillLevel(id);
    if (lvl >= def.maxLevel) return { ok: false, reason: 'Nível máximo' };
    const prereq = canUnlock(def, s.skills);
    if (!prereq.ok) return { ok: false, reason: prereq.reason };
    const cost = def.cost(lvl);
    if (s.skillPoints < cost) return { ok: false, reason: 'Pontos insuficientes' };
    s.skillPoints -= cost;
    s.skills[id] = lvl + 1;
    incStat(s, 'skillPointsSpent', D(cost));
    this.invalidate();
    this.checkAchievements();
    this.notify('skill');
    return { ok: true };
  }

  // ── missões ──────────────────────────────────────────────
  eventState(e: EventDef): { tokens: string; progress: Record<string, string>; quests: QuestState[]; questDay: string; dailyClaimed: string[] } {
    const s = this.state;
    if (!s.events[e.id]) {
      s.events[e.id] = { tokens: '0', progress: {}, quests: [], questDay: '', dailyClaimed: [] };
    }
    if (!Array.isArray(s.events[e.id].dailyClaimed)) s.events[e.id].dailyClaimed = [];
    return s.events[e.id];
  }

  liveQuestProgress(def: QuestDef, qs: QuestState): ReturnType<typeof D> {
    const cur = questProgress(this.state, def);
    if (def.category === 'permanente') return cur;
    const delta = cur.minus(D(qs.progress));
    return delta.gt(ZERO) ? delta : ZERO;
  }

  private rollQuestStates(defs: QuestDef[]): QuestState[] {
    const s = this.state;
    return defs.map((d) => ({
      id: d.id,
      progress: questProgress(s, d).toString(),
      claimed: false,
    }));
  }

  refreshDaily(): void {
    const s = this.state;
    s.questDay = todayKey();
    s.quests.daily = this.rollQuestStates(rollDailyQuests(3));
    this.notify('quests');
  }

  refreshWeekly(): void {
    const s = this.state;
    s.questWeek = weekKey();
    s.quests.weekly = this.rollQuestStates(rollWeeklyQuests(3));
    this.notify('quests');
  }

  checkQuests(): void {
    // nada automático — conclusão verificada na hora de reivindicar
  }

  claimQuest(type: 'daily' | 'weekly' | 'permanent', index: number): { ok: boolean; reason?: string } {
    const s = this.state;
    const list = s.quests[type];
    const qs = list[index];
    if (!qs) return { ok: false, reason: 'Missão inexistente' };
    if (qs.claimed) return { ok: false, reason: 'Já reivindicada' };
    const def = questById(qs.id);
    if (!def) return { ok: false, reason: 'Missão inválida' };
    const progress = this.liveQuestProgress(def, qs);
    if (!isQuestComplete(progress, def.target)) return { ok: false, reason: 'Missão incompleta' };
    qs.claimed = true;
    this.grantQuestReward(def);
    incStat(s, 'questsCompleted', D(1));
    // XP do Passe Premium por missão concluída
    const passXp = type === 'daily' ? GameConfig.pass.xpPerDailyQuest : type === 'weekly' ? GameConfig.pass.xpPerWeeklyQuest : GameConfig.pass.xpPerQuest;
    this.addPassXp(passXp);
    this.checkAchievements();
    this.notify('quest');
    bus.emit('questDone', { id: def.id, name: def.name });
    return { ok: true };
  }

  private grantQuestReward(def: QuestDef): void {
    const s = this.state;
    const g = this.goldReward(def.reward.gold);
    this.addRes('gold', g);
    incStat(s, 'goldEarned', g);
    this.addXp(D(def.reward.xp));
    if (def.reward.fragments) this.addRes('fragments', D(def.reward.fragments));
    if (def.reward.prestigeCoins) this.addRes('prestigeCoins', D(def.reward.prestigeCoins));
    if (def.reward.ascensionCoins) this.addRes('ascensionCoins', D(def.reward.ascensionCoins));
    if (def.reward.eventTokens) this.addRes('eventTokens', D(def.reward.eventTokens));
    if (def.reward.boxes) {
      for (const [boxId, n] of Object.entries(def.reward.boxes)) {
        s.boxes[boxId] = (s.boxes[boxId] ?? 0) + n;
      }
    }
  }

  // ── conquistas e títulos ─────────────────────────────────
  checkAchievements(): void {
    const s = this.state;
    for (const def of ACHIEVEMENTS) {
      if (s.achievements[def.id] !== undefined) continue;
      if (!isAchievementUnlocked(s, def)) continue;
      s.achievements[def.id] = now();
      incStat(s, 'achievementsUnlocked', D(1));
      const reward = def.reward;
      if (reward.gold) {
        const g = this.goldReward(reward.gold);
        this.addRes('gold', g);
        incStat(s, 'goldEarned', g);
      }
      if (reward.fragments) this.addRes('fragments', D(reward.fragments));
      if (reward.ascensionCoins) this.addRes('ascensionCoins', D(reward.ascensionCoins));
      if (reward.essence) this.addRes('essence', D(reward.essence));
      if (reward.boxes) {
        for (const [boxId, n] of Object.entries(reward.boxes)) {
          s.boxes[boxId] = (s.boxes[boxId] ?? 0) + n;
        }
      }
      if (reward.skillPoints) s.skillPoints += reward.skillPoints;
      if (reward.title && TITLE_MAP[reward.title]) {
        this.unlockTitle(reward.title);
      }
      bus.emit('achievement', { id: def.id, name: def.name });
      bus.emit('notify', {
        kind: 'ach',
        title: `${def.secret ? '🤫 ' : '🏆 '}Conquista ${def.secret ? 'secreta ' : ''}desbloqueada!`,
        desc: `"${def.name}"`,
      });
    }
  }

  /** Skin equipada (resolvida por índice numérico para evitar strings soltas no save). */
  equippedSkinId(): string {
    return SKINS[this.state.flags.skinIdx ?? 0]?.id ?? 'classic';
  }

  private unlockTitle(titleId: string): void {
    const s = this.state;
    const def = TITLE_MAP[titleId];
    if (!def || s.titles.includes(titleId)) return;
    s.titles.push(titleId);
    if (!s.collection.titles.includes(titleId)) s.collection.titles.push(titleId);
    incStat(s, 'titles', D(1));
    this.invalidate();
  }

  checkTitles(): void {
    const s = this.state;
    for (const t of TITLES) {
      if (s.titles.includes(t.id)) continue;
      if (!t.check(s)) continue;
      this.unlockTitle(t.id);
      bus.emit('notify', { kind: 'title', title: `Novo título: ${t.name}!`, desc: t.desc });
    }
  }

  equipTitle(titleId: string | null): void {
    this.state.equippedTitle = titleId;
    this.invalidate();
    this.notify('title');
  }

  // ── prestígio / ascensão / transcendência ────────────────
  /** Registra um ciclo concluído no ranking local (usado pela tela de Ranking). */
  private recordRun(kind: 'prestige' | 'ascension' | 'transcendence', gain: ReturnType<typeof D>, count: number): void {
    this.state.ranking.push({ kind, gain: gain.toString(), count, at: now() });
    if (this.state.ranking.length > 200) this.state.ranking.splice(0, this.state.ranking.length - 200);
  }

  prestigePreview(): ReturnType<typeof D> {
    return prestigeFragments(this.state.prestige.energyThisCycle, this.state.prestige.count).mul(this.bonuses().prestigeGain).floor();
  }

  prestige(): { fragments: string; coins: string } | null {
    const s = this.state;
    const frags = this.prestigePreview();
    if (frags.lt(1)) return null;
    const coins = prestigeCoinsGain(frags, s.prestige.count);

    s.fragments = D(s.fragments).plus(frags).toString();
    s.prestigeCoins = D(s.prestigeCoins).plus(coins).toString();
    s.prestige.count += 1;
    s.prestige.totalFragments = D(s.prestige.totalFragments).plus(frags).toString();
    s.prestige.lastGain = frags.toString();
    s.prestige.energyThisCycle = '0';
    s.ascension.fragmentsThisCycle = D(s.ascension.fragmentsThisCycle).plus(frags).toString();
    s.skillPoints += 5;

    // reset da camada normal
    s.energy = '0';
    s.gold = '0';
    s.upgrades = {};
    s.generators = {};
    s.consumables = {};
    s.activeEffects = {};
    s.combo = { count: 0, lastClick: 0 };
    this.petSkillTimers = {};

    this.addXp(D(500).mul(1 + s.prestige.count * 0.1));
    incStat(s, 'prestigeCount', D(1));
    this.invalidate();
    this.checkAchievements();
    this.notify('prestige');
    this.recordRun('prestige', frags, s.prestige.count);
    appendLog(s, 'prestige', `Prestígio #${s.prestige.count}: +${frags.toString()} fragmentos`);
    bus.emit('prestige', { fragments: frags.toString() });
    bus.emit('notify', { kind: 'prestige', title: 'PRESTÍGIO!', desc: `+${frags.toString()} fragmentos e ${coins.toString()} moedas de prestígio` });
    return { fragments: frags.toString(), coins: coins.toString() };
  }

  ascensionPreview(): ReturnType<typeof D> {
    return ascensionCoins(this.state.ascension.fragmentsThisCycle, this.state.ascension.count);
  }

  ascend(): { coins: string } | null {
    const s = this.state;
    const coins = this.ascensionPreview();
    if (coins.lt(1)) return null;

    s.ascensionCoins = D(s.ascensionCoins).plus(coins).toString();
    s.ascension.count += 1;
    s.ascension.worldsUnlocked += 1;
    s.ascension.lastGain = coins.toString();
    s.ascension.fragmentsThisCycle = '0';
    s.transcendence.ascensionCoinsThisCycle = D(s.transcendence.ascensionCoinsThisCycle).plus(coins).toString();
    s.skillPoints += 10;

    // reset da camada de prestígio
    s.fragments = '0';
    s.prestigeCoins = '0';
    s.energy = '0';
    s.gold = '0';
    s.upgrades = {};
    s.generators = {};
    s.consumables = {};
    s.activeEffects = {};
    s.combo = { count: 0, lastClick: 0 };

    this.addXp(D(5000).mul(1 + s.ascension.count * 0.1));
    incStat(s, 'ascensionCount', D(1));
    this.invalidate();
    this.checkAchievements();
    this.notify('ascension');
    this.recordRun('ascension', coins, s.ascension.count);
    appendLog(s, 'ascension', `Ascensão #${s.ascension.count}: +${coins.toString()} moedas, mundo ${s.ascension.worldsUnlocked}`);
    bus.emit('ascension', { coins: coins.toString() });
    bus.emit('notify', { kind: 'ascension', title: `ASCENSÃO! Mundo ${s.ascension.worldsUnlocked}`, desc: `+${coins.toString()} moedas de ascensão e novo mundo desbloqueado` });
    return { coins: coins.toString() };
  }

  transcendencePreview(): ReturnType<typeof D> {
    return transcendenceEssence(this.state.transcendence.ascensionCoinsThisCycle, this.state.transcendence.count);
  }

  transcend(): { essence: string } | null {
    const s = this.state;
    const ess = this.transcendencePreview();
    if (ess.lt(1)) return null;

    s.essence = D(s.essence).plus(ess).toString();
    s.transcendence.count += 1;
    s.transcendence.lastGain = ess.toString();
    s.transcendence.ascensionCoinsThisCycle = '0';
    s.skillPoints += 20;

    // reset da camada de ascensão
    s.ascensionCoins = '0';
    s.fragments = '0';
    s.prestigeCoins = '0';
    s.energy = '0';
    s.gold = '0';
    s.upgrades = {};
    s.generators = {};
    s.consumables = {};
    s.activeEffects = {};
    s.combo = { count: 0, lastClick: 0 };

    this.addXp(D(50000).mul(1 + s.transcendence.count * 0.1));
    incStat(s, 'transcendenceCount', D(1));
    this.invalidate();
    this.checkAchievements();
    this.notify('transcendence');
    this.recordRun('transcendence', ess, s.transcendence.count);
    appendLog(s, 'transcendence', `Transcendência #${s.transcendence.count}: +${ess.toString()} essência`);
    bus.emit('transcendence', { essence: ess.toString() });
    bus.emit('notify', { kind: 'transcendence', title: 'TRANSCENDÊNCIA!', desc: `+${ess.toString()} essência — bônus permanente multiplicado` });
    return { essence: ess.toString() };
  }

  /** Itens permanentes de essência (fim de jogo). */
  essenceBoosts(): { id: string; name: string; icon: string; desc: string; cost: (owned: number) => string }[] {
    return [
      { id: 'ess_click', name: 'Toque Eterno', icon: '⚡', desc: '+10% clique permanente.', cost: (n) => dynamicPrice(10, n, 2).toFixed(0) },
      { id: 'ess_prod', name: 'Fluxo Eterno', icon: '⚙️', desc: '+10% produção permanente.', cost: (n) => dynamicPrice(10, n, 2).toFixed(0) },
      { id: 'ess_gold', name: 'Riqueza Eterna', icon: '🪙', desc: '+10% ouro permanente.', cost: (n) => dynamicPrice(10, n, 2).toFixed(0) },
      { id: 'ess_crit', name: 'Visão Eterna', icon: '🎯', desc: '+1% chance crítica permanente.', cost: (n) => dynamicPrice(25, n, 2).toFixed(0) },
    ];
  }

  buyEssenceBoost(id: string): { ok: boolean; reason?: string } {
    const s = this.state;
    const boost = this.essenceBoosts().find((b) => b.id === id);
    if (!boost) return { ok: false, reason: 'Item inexistente' };
    const owned = s.flags[`${id}_owned`] ?? 0;
    const cost = D(boost.cost(owned));
    if (!this.spend('essence', cost)) return { ok: false, reason: 'Essência insuficiente' };
    s.flags[`${id}_owned`] = owned + 1;
    s.flags.essenceSpentTotal = (s.flags.essenceSpentTotal ?? 0) + 1;
    this.invalidate();
    this.notify('essence');
    bus.emit('notify', { kind: 'essence', title: boost.name, desc: boost.desc });
    return { ok: true };
  }

  essenceBoostBonus(id: string): PartialModifiers {
    const owned = this.state.flags[`${id}_owned`] ?? 0;
    if (owned <= 0) return {};
    switch (id) {
      case 'ess_click': return pct({ clickPower: 10 * owned });
      case 'ess_prod': return pct({ production: 10 * owned });
      case 'ess_gold': return pct({ goldGain: 10 * owned });
      case 'ess_crit': return pct({ critChance: owned });
      default: return {};
    }
  }

  essenceBoostOwned(id: string): number {
    return this.state.flags[`${id}_owned`] ?? 0;
  }

  // ── loja de eventos ──────────────────────────────────────
  isEventActive(eventId: string): boolean {
    return activeEvents(new Date(), true).some((e) => e.id === eventId);
  }

  buyEventItem(eventId: string, itemId: string): { ok: boolean; reason?: string } {
    const s = this.state;
    const ev = eventById(eventId);
    if (!ev) return { ok: false, reason: 'Evento inexistente' };
    if (!this.isEventActive(eventId)) return { ok: false, reason: 'Evento inativo' };
    const item = ev.shop.find((i) => i.id === itemId);
    if (!item) return { ok: false, reason: 'Item inexistente' };
    const cost = D(item.cost);
    const st = this.eventState(ev);
    if (D(st.tokens).lt(cost)) return { ok: false, reason: `${ev.currency.icon} ${ev.currency.name} insuficientes` };
    st.tokens = D(st.tokens).minus(cost).toString();

    // participação real em evento (desbloqueia a skin Gélido)
    s.flags.event_participations = (s.flags.event_participations ?? 0) + 1;

    switch (item.type) {
      case 'title':
        if (item.value) this.unlockTitle(item.value);
        break;
      case 'skin':
        if (item.value) this.grantSkin(item.value);
        break;
      case 'box': {
        const boxId = item.value ?? 'event';
        s.boxes[boxId] = (s.boxes[boxId] ?? 0) + 1;
        break;
      }
      case 'consumable':
        if (item.value) s.consumables[item.value] = (s.consumables[item.value] ?? 0) + 1;
        break;
      case 'buff':
        if (item.value && item.durationMs) {
          s.activeEffects[item.value] = { until: addMs(item.durationMs), stacks: item.buffMult ?? 2 };
          this.invalidate();
        }
        break;
      case 'permanent':
        if (item.value) {
          s.flags[item.value] = 1;
          this.invalidate();
        }
        break;
    }
    this.notify('event');
    bus.emit('notify', { kind: 'event', title: item.name, desc: item.desc });
    return { ok: true };
  }

  // ── skins (LiveOps) ──────────────────────────────────────
  isSkinOwned(id: string): boolean {
    return skinOwnedCheck(this.state, id);
  }

  grantSkin(id: string): boolean {
    const def = SKIN_MAP[id];
    if (!def) return false;
    const s = this.state;
    if (!s.skins.owned.includes(id)) {
      s.skins.owned.push(id);
      if (!s.collection.skins.includes(id)) s.collection.skins.push(id);
      this.invalidate();
      bus.emit('notify', { kind: 'skin', title: `Skin desbloqueada: ${def.name}!`, desc: def.desc });
    }
    return true;
  }

  toggleSkinFavorite(id: string): void {
    const s = this.state;
    const fav = s.skins.favorites;
    const idx = fav.indexOf(id);
    if (idx === -1) fav.push(id);
    else fav.splice(idx, 1);
    this.notify('skin');
  }

  isSkinFavorite(id: string): boolean {
    return this.state.skins.favorites.includes(id);
  }

  equipSkin(skinId: string): void {
    const idx = SKINS.findIndex((sk) => sk.id === skinId);
    if (idx < 0) return;
    const s = this.state;
    s.flags.skinIdx = idx;
    if (!s.skins.owned.includes(skinId)) s.skins.owned.push(skinId);
    if (!s.collection.skins.includes(skinId)) s.collection.skins.push(skinId);
    this.invalidate();
    this.notify('skin');
  }

  // ── recompensas (sistema central) ─────────────────────────
  grantRewards(spec: EventRewardSpec): void {
    const s = this.state;
    if (spec.gold) {
      const g = this.goldReward(spec.gold);
      this.addRes('gold', g);
      incStat(s, 'goldEarned', g);
    }
    if (spec.energy) { this.addRes('energy', D(spec.energy)); incStat(s, 'energyProduced', D(spec.energy)); }
    if (spec.crystals) { this.addRes('crystals', D(spec.crystals)); incStat(s, 'crystalsEarned', D(spec.crystals)); }
    if (spec.fragments) this.addRes('fragments', D(spec.fragments));
    if (spec.essence) this.addRes('essence', D(spec.essence));
    if (spec.prestigeCoins) this.addRes('prestigeCoins', D(spec.prestigeCoins));
    if (spec.ascensionCoins) this.addRes('ascensionCoins', D(spec.ascensionCoins));
    if (spec.eventTokens) this.addRes('eventTokens', D(spec.eventTokens));
    if (spec.xp) this.addXp(D(spec.xp));
    if (spec.skillPoints) s.skillPoints += spec.skillPoints;
    if (spec.boxes) for (const bx of spec.boxes) s.boxes[bx.boxId] = (s.boxes[bx.boxId] ?? 0) + bx.qty;
    if (spec.skins) for (const sk of spec.skins) this.grantSkin(sk);
    if (spec.pets) for (const p of spec.pets) this.grantPet(p);
    if (spec.titles) for (const t of spec.titles) this.unlockTitle(t);
    if (spec.consumables) for (const c of spec.consumables) s.consumables[c.id] = (s.consumables[c.id] ?? 0) + c.qty;
    if (spec.premiumPasses) for (const p of spec.premiumPasses) if (!s.premiumPasses.includes(p)) s.premiumPasses.push(p);
    if (spec.avatarItems) for (const a of spec.avatarItems) this.grantAvatarItem(a);
    if (spec.flags) for (const [k, v] of Object.entries(spec.flags)) s.flags[k] = v;
    this.invalidate();
  }

  // ── passes (eventos e temporadas) ─────────────────────────
  trackXp(trackId: string, amount: ReturnType<typeof D>): void {
    if (amount.lte(ZERO)) return;
    const s = this.state;
    const t = (s.passTracks[trackId] ??= { xp: '0', claimedFree: [], claimedPremium: [] });
    t.xp = D(t.xp).plus(amount).toString();
  }

  passXp(trackId: string): ReturnType<typeof D> {
    const t = this.state.passTracks[trackId];
    return t ? D(t.xp) : ZERO;
  }

  passLevel(trackId: string, levels: { level: number; xp: string }[]): number {
    const t = this.state.passTracks[trackId];
    if (!t) return 0;
    const xp = parseFloat(t.xp);
    let level = 0;
    for (const l of levels) {
      if (xp >= parseFloat(l.xp)) level = l.level;
      else break;
    }
    return level;
  }

  hasPremiumPass(trackId: string): boolean {
    return this.state.premiumPasses.includes(trackId);
  }

  claimPassReward(trackId: string, levels: { level: number; xp: string; free?: EventRewardSpec; premium?: EventRewardSpec; title?: string }[], level: number, which: 'free' | 'premium'): { ok: boolean; reason?: string } {
    const s = this.state;
    const lv = levels.find((l) => l.level === level);
    if (!lv) return { ok: false, reason: 'Nível inexistente' };
    const spec = which === 'free' ? lv.free : lv.premium;
    if (!spec) return { ok: false, reason: 'Sem recompensa nesta trilha' };
    const t = (s.passTracks[trackId] ??= { xp: '0', claimedFree: [], claimedPremium: [] });
    const claimed = which === 'free' ? t.claimedFree : t.claimedPremium;
    if (claimed.includes(level)) return { ok: false, reason: 'Já reivindicado' };
    if (which === 'premium' && !s.premiumPasses.includes(trackId)) return { ok: false, reason: 'Passe premium não adquirido' };
    if (this.passLevel(trackId, levels) < level) return { ok: false, reason: 'Nível não alcançado' };
    claimed.push(level);
    this.grantRewards(spec);
    if (lv.title) this.unlockTitle(lv.title);
    this.notify('pass');
    bus.emit('notify', { kind: 'level', title: `Passe nível ${level} reivindicado!`, desc: which === 'premium' ? 'Recompensa premium' : 'Recompensa grátis' });
    return { ok: true };
  }

  // ── login diário ──────────────────────────────────────────
  dailyLoginDay(): number {
    return this.state.dailyLogin.count % 7;
  }

  dailyLoginAvailable(): boolean {
    return now() - this.state.dailyLogin.lastClaim >= 20 * 3600 * 1000;
  }

  claimDailyLogin(): { ok: boolean; reason?: string; day: number; reward: EventRewardSpec } {
    const s = this.state;
    const day = this.dailyLoginDay();
    const reward = DAILY_LOGIN_REWARDS[day];
    if (!this.dailyLoginAvailable()) return { ok: false, reason: 'Recompensa já coletada hoje', day, reward };

    this.grantRewards(reward);
    s.dailyLogin.lastClaim = now();
    s.dailyLogin.count += 1;
    this.notify('daily');
    bus.emit('notify', { kind: 'level', title: `Login diário — Dia ${day + 1}!`, desc: 'Recompensa coletada' });
    return { ok: true, day, reward };
  }

  // ── perfil (status, avatar) — Update 3.0 ─────────────────
  setStatus(status: StatusPreset): void {
    if (!STATUS_PRESETS.some((p) => p.id === status)) return;
    this.state.profile.status = status;
    this.notify('profile');
  }

  setStatusMessage(msg: string): void {
    this.state.profile.statusMessage = msg.slice(0, GameConfig.status.maxMessageLength);
    this.notify('profile');
  }

  /** Verifica se um item de avatar está liberado (progresso OU obtido via passe). */
  avatarItemAvailable(cat: AvatarItem[], id: string): boolean {
    const item = cat.find((i) => i.id === id);
    if (!item) return false;
    if (this.state.avatarItems.includes(id)) return true;
    if (item.premium) return this.state.premiumPass.owned; // premium liberado com o passe
    return avatarItemUnlocked(cat, id, this.progressProfile());
  }

  private progressProfile(): { prestige: number; ascension: number; levels: number; pets: number } {
    const s = this.state;
    return { prestige: s.prestige.count, ascension: s.ascension.count, levels: s.level, pets: Object.keys(s.pets).length };
  }

  grantAvatarItem(id: string): void {
    if (!this.state.avatarItems.includes(id)) this.state.avatarItems.push(id);
    this.notify('profile');
  }

  setAvatarIcon(id: string): void {
    if (this.avatarItemAvailable(AVATAR_CATALOG.icons, id)) {
      this.state.profile.avatarIcon = id;
      this.notify('profile');
    }
  }

  setAvatarFrame(id: string): void {
    if (this.avatarItemAvailable(AVATAR_CATALOG.frames, id)) {
      this.state.profile.avatarFrame = id;
      this.notify('profile');
    }
  }

  setAvatarEffect(id: string): void {
    if (this.avatarItemAvailable(AVATAR_CATALOG.effects, id)) {
      this.state.profile.avatarEffect = id;
      this.notify('profile');
    }
  }

  setAvatarBadge(id: string): void {
    if (this.avatarItemAvailable(AVATAR_CATALOG.badges, id)) {
      this.state.profile.avatarBadge = id;
      this.notify('profile');
    }
  }

  // ── Passe Premium global — Update 3.0 ─────────────────────
  /** Reseta o passe quando a temporada muda (recompensas validadas por temporada). */
  syncPremiumPassSeason(): void {
    const p = this.state.premiumPass;
    if (!p.owned) {
      p.season = SEASON_ID;
      return;
    }
    if (p.season !== SEASON_ID) {
      p.season = SEASON_ID;
      p.xp = 0;
      p.claimedFree = [];
      p.claimedPremium = [];
      appendLog(this.state, 'pass', `Nova temporada: passe premium reiniciado (${SEASON_ID})`);
    }
  }

  /** XP do passe premium (com teto diário — anti-progressão absurda). */
  addPassXp(amount: number): void {
    if (amount <= 0) return;
    const s = this.state;
    // dia como YYYYMMDD (número) — comparável e armazenável em flags
    const dayNum = Number(todayKey().replace(/-/g, ''));
    const stamp = s.flags.passXpDayStamp;
    if (stamp === 0 || stamp !== dayNum) {
      s.flags.passXpDay = 0;
    }
    s.flags.passXpDayStamp = dayNum;
    const used = s.flags.passXpDay ?? 0;
    const allowed = Math.max(0, GameConfig.pass.dailyXpCap - used);
    const gain = Math.min(amount, allowed);
    if (gain <= 0) return;
    s.flags.passXpDay = used + gain;
    s.premiumPass.xp += gain;
  }

  premiumPassLevel(): number {
    return passLevelFromXp(this.state.premiumPass.xp);
  }

  premiumPassProgress(): { level: number; needed: number; progress: number } | null {
    return passNextLevel(this.state.premiumPass.xp);
  }

  /** Concede a posse do passe premium (usado pelo fluxo local e online). */
  private grantPremiumPass({ orderId, timestamp, signature }: { orderId: string; timestamp: number; signature: string }): void {
    const s = this.state;
    s.premiumPass.owned = true;
    s.premiumPass.season = SEASON_ID;
    s.premiumPass.purchaseTimestamp = timestamp;
    s.premiumPass.orderId = orderId;
    s.premiumPass.signature = signature;
    s.premiumPass.xp = Math.max(s.premiumPass.xp, 0);
    // itens premium de avatar liberados com o passe (exclusivos do passe)
    for (const id of ['av_cyber', 'av_star', 'fr_premium', 'fx_premium', 'bd_premium']) {
      if (!s.avatarItems.includes(id)) s.avatarItems.push(id);
    }
    this.unlockTitle('pass_premium');
    appendLog(s, 'pass', `Passe premium adquirido (pedido ${orderId})`);
  }

  /**
   * Compra do passe premium via Pix — mesmo fluxo da Carteira/Loja:
   * online (Mercado Pago via servidor, recibo assinado no backend quando aprovado)
   * ou local (simulado — recibo assinado com a chave local).
   */
  async buyPremiumPass(): Promise<{ ok: boolean; reason?: string; pending?: boolean; orderId?: string; pixCode?: string; qrCodeBase64?: string }> {
    const s = this.state;
    if (s.premiumPass.owned) return { ok: false, reason: 'Passe já adquirido' };
    const gw = resolvePixGateway();
    const res = await gw.purchase(PASS_PRODUCT_ID, { playerId: s.createdAt, amountBRL: GameConfig.pass.priceBRL });
    if (!res.ok || !res.orderId) return { ok: false, reason: res.reason ?? 'Pagamento recusado' };
    if (res.pending) {
      // cobrança real criada — aguarda o pagamento e a aprovação do Mercado Pago
      s.pixOrders[res.orderId] = {
        packId: PASS_PRODUCT_ID,
        label: 'Passe Premium',
        status: 'pending',
        at: Date.now(),
        pixCode: res.pixCode,
        amountBRL: GameConfig.pass.priceBRL,
      };
      appendLog(s, 'pass', `Cobrança Pix criada para o passe (pedido ${res.orderId}) — aguardando pagamento`);
      this.invalidate();
      this.notify('wallet');
      return { ok: true, pending: true, orderId: res.orderId, pixCode: res.pixCode, qrCodeBase64: res.qrCodeBase64 };
    }
    // gateway local (simulado): concede na hora com recibo assinado localmente
    this.grantPremiumPass({
      orderId: res.orderId,
      timestamp: res.timestamp,
      signature: signPassReceipt({ orderId: res.orderId, timestamp: res.timestamp, playerId: s.createdAt }),
    });
    this.invalidate();
    this.notify('pass');
    bus.emit('notify', { kind: 'level', title: '💎 Passe Premium ativo!', desc: 'Trilha premium desbloqueada — 100 níveis de recompensas exclusivas.' });
    return { ok: true };
  }

  /** Compra um pacote de moedas/diamantes da Loja com dinheiro real via Pix. */
  async buyCoinPack(packId: string): Promise<{ ok: boolean; reason?: string; gold?: string; diamonds?: number; orderId?: string; pixCode?: string; qrCodeBase64?: string; pending?: boolean }> {
    const pack = packById(packId);
    if (!pack) return { ok: false, reason: 'Pacote inexistente' };
    // mesmo fluxo Pix da Carteira: online (Mercado Pago via servidor) ou local (simulado)
    return this.buyPixPack({ id: pack.id, name: pack.name, priceBRL: pack.priceBRL, gold: pack.gold, diamonds: pack.diamonds });
  }

  // ── carteira Ficha/Créditos ─────────────────────────────
  /** Concede o conteúdo de um pacote Pix (uma vez). */
  private grantPixContents(pack: PixPackLike, orderId: string): void {
    const s = this.state;
    if (pack.fichas) {
      this.addRes('fichas', D(pack.fichas));
      incStat(s, 'fichasBought', D(pack.fichas));
    }
    if (pack.gold && D(pack.gold).gt(ZERO)) {
      this.addRes('gold', D(pack.gold));
      incStat(s, 'goldEarned', D(pack.gold));
    }
    if (pack.diamonds && pack.diamonds > 0) {
      this.addRes('crystals', D(pack.diamonds));
      incStat(s, 'crystalsEarned', D(pack.diamonds));
    }
    appendLog(s, 'wallet', `Pix aprovado (pedido ${orderId}) — ${pack.id}: +${pack.fichas ?? 0} fichas, +${pack.gold ?? 0} moedas, +${pack.diamonds ?? 0} diamantes`);
  }

  /** Compra de fichas via Pix. Local: concede na hora. Online: cria a cobrança e aguarda pagamento. */
  async buyFichaPack(packId: string, payerEmail?: string): Promise<{
    ok: boolean;
    reason?: string;
    fichas?: number;
    orderId?: string;
    pixCode?: string;
    qrCodeBase64?: string;
    pending?: boolean;
  }> {
    const pack = fichaPackById(packId);
    if (!pack) return { ok: false, reason: 'Pacote inexistente' };
    const r = await this.buyPixPack(
      { id: pack.id, name: pack.name, priceBRL: pack.priceBRL, fichas: pack.fichas },
      payerEmail,
    );
    return { ok: r.ok, reason: r.reason, fichas: r.fichas, orderId: r.orderId, pixCode: r.pixCode, qrCodeBase64: r.qrCodeBase64, pending: r.pending };
  }

  /** Compra de um pacote Pix customizado (fichas, moedas e/ou diamantes) via Pix. */
  async buyPixPack(pack: PixPackLike, payerEmail?: string): Promise<{
    ok: boolean;
    reason?: string;
    fichas?: number;
    gold?: string;
    diamonds?: number;
    orderId?: string;
    pixCode?: string;
    qrCodeBase64?: string;
    pending?: boolean;
  }> {
    const s = this.state;
    if (!pack || typeof pack.priceBRL !== 'number' || pack.priceBRL <= 0 || !pack.id) {
      return { ok: false, reason: 'Pacote inválido' };
    }
    const gw = resolvePixGateway();
    const res = await gw.purchase(pack.id, { playerId: s.createdAt, amountBRL: pack.priceBRL, payerEmail });
    if (!res.ok || !res.orderId) return { ok: false, reason: res.reason ?? 'Pagamento Pix recusado' };
    if (res.pending) {
      // cobrança real criada — aguarda o jogador pagar e o Pix compensar.
      // O conteúdo gravado no pedido é o que o SERVIDOR definiu na cobrança
      // (res.content); o fallback local cobre gateways que ainda não o enviam.
      s.pixOrders[res.orderId] = {
        packId: pack.id,
        label: pack.name,
        gold: res.content?.gold ?? pack.gold,
        diamonds: res.content?.diamonds ?? pack.diamonds,
        fichas: res.content?.fichas ?? pack.fichas,
        status: 'pending',
        at: Date.now(),
        pixCode: res.pixCode,
        amountBRL: pack.priceBRL,
      };
      appendLog(s, 'wallet', `Cobrança Pix criada (pedido ${res.orderId}) — ${pack.id}, aguardando pagamento`);
      this.invalidate();
      this.notify('wallet');
      return { ok: true, orderId: res.orderId, pixCode: res.pixCode, qrCodeBase64: res.qrCodeBase64, pending: true };
    }
    // gateway local: concede na hora
    this.grantPixContents(pack, res.orderId);
    this.invalidate();
    this.notify('buy');
    const parts = [
      pack.fichas ? `🎰 ${pack.fichas} fichas` : '',
      pack.gold && D(pack.gold).gt(ZERO) ? `🪙 ${D(pack.gold).toFixed(0)} moedas` : '',
      pack.diamonds && pack.diamonds > 0 ? `💎 ${pack.diamonds} diamantes` : '',
    ].filter(Boolean);
    bus.emit('notify', { kind: 'level', title: `✅ ${pack.name} entregue!`, desc: `+${parts.join(' · ')}` });
    return { ok: true, fichas: pack.fichas, gold: pack.gold, diamonds: pack.diamonds, orderId: res.orderId, pixCode: res.pixCode };
  }

  /** Consulta o status de um pedido Pix e concede o conteúdo quando aprovado (uma única vez). */
  async checkPixOrder(orderId: string): Promise<{ status: PixOrderStatus; fichas?: number; gold?: string; diamonds?: number; done?: boolean }> {
    const s = this.state;
    const order = s.pixOrders[orderId];
    if (!order) return { status: 'unknown' };
    if (order.status === 'done') return { status: 'approved', done: true };

    // expira pedidos nunca pagos (evita modal/órfão para sempre)
    if (Date.now() - order.at > GameConfig.wallet.pixOrderExpiryMs) {
      order.status = 'done';
      appendLog(s, 'wallet', `Pedido Pix ${orderId} expirado (não pago em ${Math.round(GameConfig.wallet.pixOrderExpiryMs / 60000)} min)`);
      this.invalidate();
      this.notify('wallet');
      return { status: 'cancelled', done: true };
    }

    const gw = resolvePixGateway();
    const r = await gw.checkOrder(orderId);
    if (r.status === 'approved') {
      // re-check após o await: chamadas concorrentes nunca concedem duas vezes
      // (reler do state porque o TS estreita o tipo antes do await)
      const now = s.pixOrders[orderId];
      if (now?.status === 'done') return { status: 'approved', done: true };
      // passe premium: posse exige o recibo assinado pelo SERVIDOR (vem no status)
      if (order.packId === PASS_PRODUCT_ID) {
        // VERIFICA a assinatura com a chave pública embutida ANTES de conceder —
        // conceder um recibo inválido (ex.: chaves trocadas) seria conceder e
        // revogar no próximo load (jogador paga e perde o passe).
        if (!r.receipt || !verifyPassReceipt(r.receipt, { orderId, timestamp: Date.now(), playerId: s.createdAt })) {
          // servidor ainda não emitiu/emitiu recibo inválido (chave divergente):
          // mantém pendente e tenta de novo no próximo polling.
          return { status: 'pending' };
        }
        this.grantPremiumPass({ orderId, timestamp: Date.now(), signature: r.receipt });
        order.status = 'done';
        this.invalidate();
        this.notify('pass');
        bus.emit('notify', { kind: 'level', title: '💎 Passe Premium ativo!', desc: 'Pagamento Pix confirmado — trilha premium desbloqueada.' });
        return { status: 'approved', done: true };
      }
      // pacote resolvido: o conteúdo AUTORITATIVO vem do SERVIDOR (r.content) —
      // o app concede exatamente o que o servidor entrega, mesmo que o save
      // tenha sido adulterado. Fallback para o conteúdo gravado no pedido
      // (vindo da cobrança: servidor no modo online, catálogo no modo local).
      let pack: PixPackLike | null;
      const sc = r.content;
      if (sc && (sc.gold !== undefined || sc.diamonds !== undefined || sc.fichas !== undefined)) {
        pack = { id: order.packId, name: order.label ?? order.packId, priceBRL: order.amountBRL ?? 0, fichas: sc.fichas, gold: sc.gold, diamonds: sc.diamonds };
      } else if (order.gold !== undefined || order.diamonds !== undefined || order.fichas !== undefined) {
        pack = { id: order.packId, name: order.label ?? order.packId, priceBRL: order.amountBRL ?? 0, fichas: order.fichas, gold: order.gold, diamonds: order.diamonds };
      } else {
        const f = fichaPackById(order.packId);
        pack = f ? { id: f.id, name: f.name, priceBRL: f.priceBRL, fichas: f.fichas } : null;
      }
      if (pack) {
        this.grantPixContents(pack, orderId);
        const parts = [
          pack.fichas ? `🎰 ${pack.fichas} fichas` : '',
          pack.gold && D(pack.gold).gt(ZERO) ? `🪙 ${D(pack.gold).toFixed(0)} moedas` : '',
          pack.diamonds && pack.diamonds > 0 ? `💎 ${pack.diamonds} diamantes` : '',
        ].filter(Boolean);
        bus.emit('notify', { kind: 'level', title: `✅ ${pack.name} aprovado!`, desc: `Pagamento Pix confirmado — +${parts.join(' · ')}` });
      }
      order.status = 'done';
      this.invalidate();
      this.notify('wallet');
      return { status: 'approved', fichas: pack?.fichas, gold: pack?.gold, diamonds: pack?.diamonds, done: true };
    }
    return { status: r.status };
  }

  /** Pedidos Pix pendentes (para retomar o polling após reiniciar o jogo). */
  pendingPixOrders(): { orderId: string; packId: string; at: number; pixCode?: string; amountBRL?: number; label?: string }[] {
    return Object.entries(this.state.pixOrders)
      .filter(([, o]) => o.status === 'pending')
      .map(([orderId, o]) => ({ orderId, packId: o.packId, at: o.at, pixCode: o.pixCode, amountBRL: o.amountBRL, label: o.label }));
  }

  /** Converte fichas em créditos (1 ficha = 1 crédito). Gasta apenas o conversível. */
  convertFichasToCredits(amount: number): { ok: boolean; reason?: string; credits?: number } {
    const s = this.state;
    const qty = Math.floor(amount);
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'Quantidade inválida' };
    const credits = fichasToCredits(qty);
    if (credits <= 0) return { ok: false, reason: 'Valor não convertível' };
    // gasta só as fichas efetivamente convertidas (sem perda silenciosa se a taxa mudar)
    const spent = credits * GameConfig.wallet.fichasPerCredit;
    const fichas = this.getRes('fichas');
    if (fichas.lt(spent)) return { ok: false, reason: 'Fichas insuficientes' };
    this.spend('fichas', D(spent));
    this.addRes('credits', D(credits));
    incStat(s, 'creditsConverted', D(credits));
    appendLog(s, 'wallet', `Conversão: ${spent} fichas → ${credits} créditos`);
    this.invalidate();
    this.notify('wallet');
    return { ok: true, credits };
  }

  /** Converte créditos em diamantes 💎 (1 crédito = 1 diamante). Gasta apenas o conversível. */
  convertCreditsToDiamonds(amount: number): { ok: boolean; reason?: string; diamonds?: number } {
    const s = this.state;
    const qty = Math.floor(amount);
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'Quantidade inválida' };
    const diamonds = creditsToDiamonds(qty);
    if (diamonds <= 0) return { ok: false, reason: 'Valor não convertível' };
    const spent = diamonds * GameConfig.wallet.creditsPerDiamond;
    const credits = this.getRes('credits');
    if (credits.lt(spent)) return { ok: false, reason: 'Créditos insuficientes' };
    this.spend('credits', D(spent));
    this.addRes('crystals', D(diamonds));
    incStat(s, 'diamondsFromCredits', D(diamonds));
    appendLog(s, 'wallet', `Conversão: ${spent} créditos → ${diamonds} diamantes`);
    this.invalidate();
    this.notify('wallet');
    bus.emit('notify', { kind: 'level', title: '💎 Diamantes adicionados!', desc: `+${diamonds} diamantes na sua conta` });
    return { ok: true, diamonds };
  }

  claimPassFree(level: number): { ok: boolean; reason?: string } {
    return this.claimGlobalPass(level, 'free');
  }

  claimPassPremium(level: number): { ok: boolean; reason?: string } {
    return this.claimGlobalPass(level, 'premium');
  }

  private claimGlobalPass(level: number, which: 'free' | 'premium'): { ok: boolean; reason?: string } {
    const s = this.state;
    const lv = GAME_PASS_LEVELS.find((l) => l.level === level);
    if (!lv) return { ok: false, reason: 'Nível inexistente' };
    const spec = which === 'free' ? lv.free : lv.premium;
    if (!spec) return { ok: false, reason: 'Sem recompensa nesta trilha' };
    if (which === 'premium' && !s.premiumPass.owned) return { ok: false, reason: 'Passe premium não adquirido' };
    if (s.premiumPass.season !== SEASON_ID) return { ok: false, reason: 'Temporada inválida' };
    const claimed = which === 'free' ? s.premiumPass.claimedFree : s.premiumPass.claimedPremium;
    if (claimed.includes(level)) return { ok: false, reason: 'Já reivindicado' };
    if (this.premiumPassLevel() < level) return { ok: false, reason: 'Nível não alcançado' };
    claimed.push(level);
    this.grantRewards(spec);
    this.notify('pass');
    bus.emit('notify', { kind: 'level', title: `Passe nível ${level} reivindicado!`, desc: which === 'premium' ? 'Recompensa premium exclusiva' : 'Recompensa grátis' });
    return { ok: true };
  }

  // ── automação (configurações de gameplay) — Update 3.0 ───
  private autoTick(): void {
    const s = this.state;
    // abrir caixas básicas automaticamente (respeita desbloqueio da mecânica)
    if (s.settings.gameplay.autoOpenBoxes && (s.boxes.basic ?? 0) > 0) {
      this.openBox('basic', s.boxes.basic);
    }
  }

  // ── recompensas diárias de evento ─────────────────────────
  claimEventDaily(eventId: string, dayIdx: number): { ok: boolean; reason?: string; reward?: EventRewardSpec } {
    const def = eventById(eventId);
    if (!def || !def.dailyRewards) return { ok: false, reason: 'Sem recompensas diárias' };
    if (!this.isEventActive(eventId)) return { ok: false, reason: 'Evento inativo' };
    const st = this.eventState(def);
    if (st.dailyClaimed.includes(String(dayIdx))) return { ok: false, reason: 'Já coletado' };
    const reward = def.dailyRewards[dayIdx];
    if (!reward) return { ok: false, reason: 'Dia inválido' };
    st.dailyClaimed.push(String(dayIdx));
    this.grantRewards(reward);
    this.notify('event');
    return { ok: true, reward };
  }

  // ── códigos ───────────────────────────────────────────────
  redeemCode(input: string): { ok: boolean; reason?: string; name?: string } {
    const s = this.state;
    const code = CODES.find((c) => c.id === input.trim().toUpperCase());
    if (!code) return { ok: false, reason: 'Código inválido' };
    if (code.expiresAt && now() > code.expiresAt) return { ok: false, reason: 'Código expirado' };
    const limit = code.limit ?? 1;
    const used = s.codes.filter((c) => c === code.id).length;
    if (used >= limit) return { ok: false, reason: 'Código já utilizado' };
    s.codes.push(code.id);
    this.grantRewards(code.rewards);
    this.notify('code');
    bus.emit('notify', { kind: 'level', title: `Código ${code.id} resgatado!`, desc: code.desc });
    return { ok: true, name: code.id };
  }

  // ── compensação administrativa ────────────────────────────
  pendingCompensations(): { id: string; name: string; icon: string; desc: string; reward: EventRewardSpec }[] {
    return COMPENSATIONS.filter((c) => !this.state.compensations.includes(c.id));
  }

  claimCompensation(id: string): { ok: boolean; reason?: string } {
    const c = COMPENSATIONS.find((x) => x.id === id);
    if (!c) return { ok: false, reason: 'Compensação inexistente' };
    if (this.state.compensations.includes(id)) return { ok: false, reason: 'Já recebida' };
    this.state.compensations.push(id);
    this.grantRewards(c.reward);
    this.notify('compensation');
    bus.emit('notify', { kind: 'level', title: `🎁 ${c.name}`, desc: c.desc });
    return { ok: true };
  }

  // ── recompensa de atualização ─────────────────────────────
  pendingUpdateReward(): boolean {
    return (this.state.flags.updateRewardsGranted ?? 0) < 1 && this.state.lastSeenVersion === GAME_VERSION;
  }

  grantUpdateReward(): boolean {
    if (!this.pendingUpdateReward()) return false;
    // recompensa vem do conteúdo data-driven (uma fonte de verdade)
    const spec = updateByVersion(GAME_VERSION)?.reward ?? { gold: '1000000' };
    this.grantRewards(spec);
    this.state.flags.updateRewardsGranted = 1;
    this.notify('update');
    bus.emit('notify', { kind: 'level', title: '🎁 Presente de atualização!', desc: '+5.000 cristais · +1 caixa · +1 skin' });
    return true;
  }

  // ── progresso offline ────────────────────────────────────
  computeOffline(nowMs?: number): OfflineResult | null {
    const s = this.state;
    const elapsed = Math.max(0, (nowMs ?? now()) - s.lastSeen) / 1000;
    if (elapsed < 60) return null;
    const capSeconds = (s.settings?.offlineCapHours ?? 12) * 3600;
    const capped = Math.min(elapsed, capSeconds);
    const b = this.bonusesPersistent();
    const eps = this.energyPerSec(b);
    const gps = this.goldPerSec(b);
    const energy = eps.mul(capped).mul(0.5);
    const gold = gps.mul(capped).mul(0.5);
    if (energy.lte(ZERO) && gold.lte(ZERO)) return null;
    return { seconds: Math.floor(capped), energy, gold };
  }

  applyOffline(res: OfflineResult): void {
    const s = this.state;
    this.addRes('energy', res.energy);
    incStat(s, 'energyProduced', res.energy);
    this.addRes('gold', res.gold);
    incStat(s, 'goldEarned', res.gold);
    s.playTimeSeconds += res.seconds;
    s.lastSeen = now();
    this.notify('offline');
  }

  // ── ciclo ────────────────────────────────────────────────
  tick(dtMs: number): void {
    const s = this.state;
    const dt = Math.min(Math.max(dtMs, 0), 5000) / 1000;
    const nowMs = now();
    const b = this.bonuses();

    // produção passiva
    const eps = this.energyPerSec(b);
    if (eps.gt(ZERO)) {
      const add = eps.mul(dt);
      this.addRes('energy', add);
      incStat(s, 'energyProduced', add);
      setStatMax(s, 'energyPerSecMax', eps);
    }
    const gps = this.goldPerSec(b);
    if (gps.gt(ZERO)) {
      const add = gps.mul(dt);
      this.addRes('gold', add);
      incStat(s, 'goldEarned', add);
    }
    // auto cliques
    const acps = this.autoClicksPerSec(b);
    if (acps.gt(ZERO)) {
      const clicks = acps.mul(dt);
      const power = D(1).plus(b.energyPerClick).mul(b.clickPower);
      const g = power.mul(clicks);
      this.addRes('energy', g);
      incStat(s, 'energyProduced', g);
      incStat(s, 'clicksAuto', clicks);
    }

    // XP por tempo jogado
    this.addXp(D(dt).div(120).mul(b.xpGain));

    // decaimento do combo
    if (s.combo.count > 0) {
      const dur = Math.max(1, b.comboDuration.toNumber());
      if (nowMs - s.combo.lastClick > dur * 1000) {
        const lost = Math.max(1, Math.floor((nowMs - s.combo.lastClick) / (dur * 1000)));
        s.combo.count = Math.max(0, s.combo.count - lost);
        s.combo.lastClick = nowMs;
      }
    }

    // expiração de efeitos
    let expired = false;
    for (const [k, eff] of Object.entries(s.activeEffects)) {
      if (eff.until <= nowMs) {
        delete s.activeEffects[k];
        expired = true;
      }
    }
    if (expired) this.invalidate();

    // skills de pets
    for (const petId of s.petSlots) {
      if (!petId) continue;
      const def = PET_MAP[petId];
      const inst = s.pets[petId];
      if (!def?.skill || !inst) continue;
      const last = this.petSkillTimers[petId] ?? nowMs - def.skill.everyMs;
      if (nowMs - last >= def.skill.everyMs) {
        this.petSkillTimers[petId] = nowMs;
        s.activeEffects[`pet_skill_${petId}`] = { until: nowMs + def.skill.durationMs, stacks: 1 };
        this.invalidate();
        bus.emit('notify', { kind: 'pet', title: `${def.name} usou ${def.skill.name}!`, desc: def.skill.desc });
      }
    }

    // XP do Passe Premium por tempo jogado (tetado diariamente)
    this.addPassXp((GameConfig.pass.xpPerMinute * dt) / 60);

    // temporada: sincroniza o passe premium quando muda
    if (this.passTickTimer > 10) {
      this.passTickTimer = 0;
      this.syncPremiumPassSeason();
    } else {
      this.passTickTimer += dt;
    }

    // automação de gameplay (configurações)
    this.autoTick();

    // tempo jogado
    s.playTimeSeconds += dt;
    s.lastSeen = nowMs;

    // rotação diária/semanal
    if (s.questDay !== todayKey()) this.refreshDaily();
    if (s.questWeek !== weekKey()) this.refreshWeekly();

    // checagens periódicas
    this.achTimer += dtMs;
    if (this.achTimer > 5000) {
      this.achTimer = 0;
      this.checkAchievements();
      this.checkTitles();
    }

    this.notify('tick');
  }

  // ── utilitários de UI ────────────────────────────────────
  activeEventsNow(): EventDef[] {
    return activeEvents(new Date(), true);
  }

  /** Nome amigável do mundo atual. */
  worldName(): string {
    return `Mundo ${this.state.ascension.worldsUnlocked}`;
  }
}

export { RESOURCE_KEYS };
export type { ResourceKey };
