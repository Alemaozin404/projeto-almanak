/**
 * Pacotes de compra com dinheiro real (Loja → aba "Moedas").
 *
 * A compra passa pelo fluxo Pix (engine.buyCoinPack → buyPixPack): online =
 * Mercado Pago via servidor (preço validado lá) ou local = simulado.
 * Moedas (gold) são a moeda normal; Diamantes (crystals) são a moeda paga.
 */
export interface CoinPackDef {
  id: string;
  name: string;
  icon: string;
  /** Preço em reais (exibição). O gateway local confirma sem cobrar. */
  priceBRL: number;
  /** Moedas 🪙 concedidas (Decimal string). */
  gold: string;
  /** Diamantes 💎 concedidos. */
  diamonds: number;
  tag?: string;
  featured?: boolean;
}

export function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const COIN_PACKS: CoinPackDef[] = [
  {
    id: 'pack_mini',
    name: 'Mini Pacote',
    icon: '🪙',
    priceBRL: 3.99,
    gold: '5000',
    diamonds: 380,
    tag: 'Entrada',
  },
  {
    id: 'pack_starter',
    name: 'Pacote Iniciante',
    icon: '🥉',
    priceBRL: 9.99,
    gold: '25000',
    diamonds: 1000,
    tag: 'Básico',
  },
  {
    id: 'pack_popular',
    name: 'Pacote Popular',
    icon: '🥈',
    priceBRL: 19.99,
    gold: '100000',
    diamonds: 2500,
    tag: 'Mais vendido',
    featured: true,
  },
  {
    id: 'pack_premium',
    name: 'Pacote Premium',
    icon: '🥇',
    priceBRL: 39.99,
    gold: '400000',
    diamonds: 6000,
    tag: 'Melhor custo-benefício',
  },
  {
    id: 'pack_legend',
    name: 'Pacote Lendário',
    icon: '👑',
    priceBRL: 99.99,
    gold: '2000000',
    diamonds: 18000,
    tag: 'Máximo',
  },
  {
    id: 'pack_ultra',
    name: 'Pacote Supremo',
    icon: '🌟',
    priceBRL: 199.99,
    gold: '8000000',
    diamonds: 45000,
    tag: 'Novo',
  },
];

export function packById(id: string): CoinPackDef | undefined {
  return COIN_PACKS.find((p) => p.id === id);
}

export function packPriceLabel(p: CoinPackDef): string {
  return fmtBRL(p.priceBRL);
}

/**
 * Combos (Loja → aba "Combos") — pacotes MISTOS comprados com dinheiro real
 * via Pix: sempre incluem Créditos 💳 + um mix de diamantes 💎, moedas 🪙,
 * XP do passe ⚡, caixas 📦 e skins. O catálogo espelha EXATAMENTE o
 * BUNDLE_PACKS do servidor (server/index.js) — o preço e o conteúdo da
 * entrega são revalidados lá (o cliente nunca arbitra valor).
 */
export interface BundlePackDef {
  id: string;
  name: string;
  icon: string;
  /** Preço em reais (exibição). O gateway local confirma sem cobrar. */
  priceBRL: number;
  /** Créditos 💳 concedidos (moeda universal). */
  credits: number;
  /** Diamantes 💎 concedidos. */
  diamonds?: number;
  /** Moedas 🪙 concedidas (string Decimal — dígitos, sem notação científica). */
  gold?: string;
  /** XP ⚡ do passe premium concedido (respeita o teto diário). */
  xp?: number;
  /** Skins desbloqueadas (IDs do catálogo src/content/skins.ts). */
  skins?: string[];
  /** Caixas 📦 concedidas. */
  boxes?: { boxId: string; qty: number }[];
  /** Títulos 🏆 exclusivos (IDs do catálogo src/progression/titles.ts). */
  titles?: string[];
  /** Badges de avatar exclusivas (IDs do catálogo src/profile/avatars.ts). */
  badges?: string[];
  tag?: string;
  featured?: boolean;
}

export const BUNDLE_PACKS: BundlePackDef[] = [
  {
    id: 'bundle_starter',
    name: 'Combo Iniciante',
    icon: '🌱',
    priceBRL: 9.99,
    credits: 220, // +10% sobre 20 créditos/R$ base
    diamonds: 200,
    gold: '2000',
    xp: 250,
    boxes: [{ boxId: 'basic', qty: 1 }],
    skins: ['cursor_star'],
    tag: 'Entrada',
  },
  {
    id: 'bundle_support',
    name: 'Combo Suporte',
    icon: '🧰',
    priceBRL: 14.99,
    credits: 345, // +15%
    diamonds: 400,
    gold: '10000',
    xp: 500,
    boxes: [{ boxId: 'basic', qty: 2 }],
    tag: 'Básico',
  },
  {
    id: 'bundle_popular',
    name: 'Combo Popular',
    icon: '🔥',
    priceBRL: 19.99,
    credits: 480, // +20%
    diamonds: 700,
    gold: '25000',
    xp: 1000,
    boxes: [{ boxId: 'rare', qty: 1 }],
    skins: ['plasma'],
    tag: 'Mais vendido',
    featured: true,
  },
  {
    id: 'bundle_adventurer',
    name: 'Combo Aventureiro',
    icon: '🧭',
    priceBRL: 24.99,
    credits: 625, // +25%
    diamonds: 1000,
    gold: '60000',
    xp: 2000,
    boxes: [{ boxId: 'rare', qty: 2 }],
    skins: ['frost'],
    tag: 'Popular',
  },
  {
    id: 'bundle_hero',
    name: 'Combo Herói',
    icon: '🦸',
    priceBRL: 34.99,
    credits: 910, // +30%
    diamonds: 1600,
    gold: '150000',
    xp: 4000,
    boxes: [{ boxId: 'epic', qty: 1 }],
    skins: ['fx_fire'],
    tag: 'Custo-benefício',
  },
  {
    id: 'bundle_epic',
    name: 'Combo Épico',
    icon: '🗡️',
    priceBRL: 49.99,
    credits: 1350, // +35%
    diamonds: 2600,
    gold: '400000',
    xp: 8000,
    boxes: [{ boxId: 'epic', qty: 2 }],
    skins: ['aurora'],
    tag: 'Novo',
  },
  {
    id: 'bundle_legend',
    name: 'Combo Lendário',
    icon: '📯',
    priceBRL: 74.99,
    credits: 2100, // +40%
    diamonds: 4200,
    gold: '1000000',
    xp: 15000,
    boxes: [{ boxId: 'legendary', qty: 1 }],
    skins: ['bg_nebula', 'num_gold'],
    tag: 'Melhor custo-benefício',
  },
  {
    id: 'bundle_mythic',
    name: 'Combo Mítico',
    icon: '🪔',
    priceBRL: 99.99,
    credits: 2900, // +45%
    diamonds: 7000,
    gold: '3000000',
    xp: 25000,
    boxes: [{ boxId: 'legendary', qty: 2 }],
    skins: ['royal'],
    titles: ['combo_mythic'],
    badges: ['bd_combo_mythic'],
    tag: 'Premium',
  },
  {
    id: 'bundle_divine',
    name: 'Combo Divino',
    icon: '😇',
    priceBRL: 149.99,
    credits: 4500, // +50%
    diamonds: 12000,
    gold: '8000000',
    xp: 30000,
    boxes: [{ boxId: 'mythic', qty: 1 }],
    skins: ['void', 'pf_celestial'],
    titles: ['combo_divine'],
    badges: ['bd_combo_divine'],
    tag: 'Elite',
  },
  {
    id: 'bundle_celestial',
    name: 'Combo Celestial',
    icon: '✨',
    priceBRL: 199.99,
    credits: 6200, // +55%
    diamonds: 20000,
    gold: '20000000',
    xp: 30000,
    boxes: [{ boxId: 'mythic', qty: 2 }],
    skins: ['pet_angel'],
    titles: ['combo_celestial'],
    badges: ['bd_combo_celestial'],
    tag: 'Lendário',
  },
  {
    id: 'bundle_omega',
    name: 'Combo Supremo',
    icon: '👑',
    priceBRL: 299.99,
    credits: 9600, // +60% — maior desconto
    diamonds: 35000,
    gold: '50000000',
    xp: 30000,
    boxes: [{ boxId: 'celestial', qty: 1 }],
    skins: ['banner_gold', 'bg_void'],
    titles: ['combo_omega'],
    badges: ['bd_combo_omega'],
    tag: 'Máximo',
  },
];

export function bundlePackById(id: string): BundlePackDef | undefined {
  return BUNDLE_PACKS.find((p) => p.id === id);
}

export function bundlePriceLabel(p: BundlePackDef): string {
  return fmtBRL(p.priceBRL);
}
