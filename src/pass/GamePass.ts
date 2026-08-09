/**
 * Passe Premium global — 100 níveis.
 * Trilha GRÁTIS (todos) + trilha PREMIUM (exclusiva para quem adquiriu o passe).
 * Itens exclusivos do passe NÃO aparecem na loja comum.
 *
 * A aquisição é uma arquitetura local de teste: a interface `PaymentGateway`
 * separa a camada de pagamento — nenhum dado sensível é armazenado no cliente.
 * Para uma futura versão online, basta implementar `PaymentGateway` com o backend.
 */
import type { EventRewardSpec } from '../content/rewards';
import { GameConfig } from '../config/GameConfig';
import { PASS_PRODUCT_ID, signPassReceipt } from '../security/passReceipt';

export interface PassLevelDef {
  level: number;
  /** XP total acumulada para atingir este nível. */
  xp: number;
  free?: EventRewardSpec;
  premium?: EventRewardSpec;
}

/** Itens exclusivos do passe (não disponíveis na loja comum). */
export const PASS_EXCLUSIVE: { skin: string; atLevel: number }[] = [
  { skin: 'pass_echo', atLevel: 5 },
  { skin: 'pass_core', atLevel: 25 },
  { skin: 'pass_glitch', atLevel: 50 },
  { skin: 'pass_divine', atLevel: 75 },
  { skin: 'pass_omega', atLevel: 100 },
];

export const PASS_EXCLUSIVE_PET = 'pet_chrono';
export const PASS_EXCLUSIVE_TITLE = 'pass_premium';
export const PASS_EXCLUSIVE_AVATAR = 'av_cyber';
export const PASS_EXCLUSIVE_FRAME = 'fr_premium';
export const PASS_EXCLUSIVE_EFFECT = 'fx_premium';
export const PASS_EXCLUSIVE_BADGE = 'bd_premium';

function gold(n: number | string): EventRewardSpec { return { gold: String(n) }; }
function boxes(n: number): EventRewardSpec { return { boxes: [{ boxId: 'basic', qty: n }] }; }

/**
 * Trilha GRÁTIS: recompensa a cada 5 níveis (5, 10, 15 … 100).
 * Os marcos curados sobrescrevem este preenchimento.
 */
function fillerFree(level: number): EventRewardSpec {
  if (level % 10 === 0) return gold('20000');
  if (level % 5 === 0) return { gold: '10000', boxes: [{ boxId: 'basic', qty: 1 }] };
  // níveis sem recompensa free (não múltiplos de 5) — valor de segurança, nunca usado
  return gold(Math.round(2000 * Math.pow(level, 1.35)));
}

function fillerPremium(level: number): EventRewardSpec {
  if (level % 5 === 0) return { gold: '25000', consumables: [{ id: 'pet_food', qty: 2 }] };
  if (level % 7 === 0) return boxes(2);
  return { gold: String(Math.round(10000 + 5000 * Math.pow(level, 1.3))) };
}

/** Gera os 100 níveis do passe (curadoria nos marcos). */
export function generatePassLevels(): PassLevelDef[] {
  const levels: PassLevelDef[] = [];
  for (let lvl = 1; lvl <= GameConfig.pass.maxLevel; lvl++) {
    // trilha grátis libera recompensa a cada 5 níveis; premium em todos
    let free: EventRewardSpec | undefined = lvl % 5 === 0 ? fillerFree(lvl) : undefined;
    let premium: EventRewardSpec = fillerPremium(lvl);

    if (lvl === 5) { free = boxes(2); premium = { skins: ['pass_echo'], gold: '10000' }; }
    if (lvl === 10) { free = gold('15000'); premium = { skins: ['pass_echo'], gold: '30000' }; }
    if (lvl === 15) { free = gold('150000'); premium = { consumables: [{ id: 'pet_food', qty: 5 }], gold: '20000' }; }
    if (lvl === 20) { free = boxes(3); premium = { titles: [PASS_EXCLUSIVE_TITLE], gold: '25000' }; }
    if (lvl === 25) { free = gold('25000'); premium = { skins: ['pass_core'], boxes: [{ boxId: 'event', qty: 1 }] }; }
    if (lvl === 30) { free = gold('400000'); premium = { gold: '40000', consumables: [{ id: 'pet_food', qty: 5 }] }; }
    if (lvl === 40) { free = boxes(4); premium = { skins: ['pass_core'], gold: '40000' }; }
    if (lvl === 50) { free = gold('40000'); premium = { skins: ['pass_glitch'], boxes: [{ boxId: 'event', qty: 2 }] }; }
    if (lvl === 60) { free = gold('900000'); premium = { gold: '60000', consumables: [{ id: 'pet_food', qty: 8 }] }; }
    if (lvl === 75) { free = gold('50000'); premium = { skins: ['pass_divine'], boxes: [{ boxId: 'event', qty: 2 }] }; }
    if (lvl === 90) { free = boxes(5); premium = { gold: '75000', consumables: [{ id: 'pet_food', qty: 10 }] }; }
    if (lvl === 100) {
      free = { gold: '100000', boxes: [{ boxId: 'event', qty: 2 }] };
      premium = { skins: ['pass_omega'], pets: [PASS_EXCLUSIVE_PET], titles: ['pass_omega'], gold: '100000' };
    }

    levels.push({
      level: lvl,
      xp: GameConfig.pass.xpForLevel(lvl),
      free,
      premium,
    });
  }
  return levels;
}

export const GAME_PASS_LEVELS: PassLevelDef[] = generatePassLevels();

/** Nível atual a partir da XP acumulada (0 se sem XP). */
export function passLevelFromXp(xp: number): number {
  let level = 0;
  for (const l of GAME_PASS_LEVELS) {
    if (xp >= l.xp) level = l.level;
    else break;
  }
  return level;
}

/** XP necessária para o próximo nível a partir da XP atual. */
export function passNextLevel(xp: number): { level: number; needed: number; progress: number } | null {
  const next = GAME_PASS_LEVELS.find((l) => l.xp > xp);
  if (!next) return null;
  const prevXp = GAME_PASS_LEVELS[next.level - 2]?.xp ?? 0;
  return { level: next.level, needed: next.xp, progress: (xp - prevXp) / Math.max(1, next.xp - prevXp) };
}

// ── Camada de pagamento (separada; nada sensível no cliente) ──
export interface PaymentResult {
  ok: boolean;
  orderId: string;
  timestamp: number;
  /** Recibo assinado (só para produtos com posse verificável, ex.: passe). */
  signature?: string;
}

export interface PaymentGateway {
  /** Inicia uma compra. Implementação local de teste. */
  purchase(product: string, meta?: { playerId: number }): Promise<PaymentResult>;
  /** Camada futura: frontend → API → processadora. Nunca armazena credenciais. */
  readonly provider: 'local' | 'online';
}

export const LocalPaymentGateway: PaymentGateway = {
  provider: 'local',
  async purchase(product, meta) {
    // Simulação local: gera um "pedido" e confirma. Para online, a processadora
    // confirmaria o pagamento real e assinaria o recibo com a chave do backend.
    const orderId = `local-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const timestamp = Date.now();
    const result: PaymentResult = { ok: true, orderId, timestamp };
    // posse verificável (passe) recebe recibo assinado; pacotes de moedas não
    if (product === PASS_PRODUCT_ID) {
      result.signature = signPassReceipt({ orderId, timestamp, playerId: meta?.playerId ?? 0 });
    }
    return result;
  },
};
