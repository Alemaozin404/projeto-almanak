import { D } from '../core/bignum';
import { pct, type PartialModifiers } from '../core/modifiers';
import type { RarityId } from '../game/types';

export type UpgradeCategory = 'click' | 'production' | 'economy' | 'prestige';
export type UpgradeCurrency = 'gold' | 'crystals' | 'prestigeCoins' | 'ascensionCoins' | 'energy';

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: UpgradeCategory;
  baseCost: string;
  currency: UpgradeCurrency;
  costMult: number;
  maxLevel: number;
  unlockLevel: number;
  rarity: RarityId;
  effect: (level: number) => PartialModifiers;
  effectDesc: (level: number) => string;
  /** Multiplicador de custo entre tiers (padrão 120; menor para moedas escassas como diamantes). */
  tierCostMult?: number;
}

const TIER_NAMES = ['', 'Mk. II', 'Mk. III', 'Mk. IV', 'Mk. V', 'Mk. VI', 'Mk. VII', 'Mk. VIII', 'Mk. IX', 'Mk. X'];

interface Template {
  id: string;
  name: string;
  icon: string;
  category: UpgradeCategory;
  baseCost: number;
  currency: UpgradeCurrency;
  costMult: number;
  maxLevel: number;
  unlockLevel: number;
  rarity: RarityId;
  desc: string;
  effect: (level: number) => PartialModifiers;
  effectDesc: (level: number) => string;
  tiers: number;
  /** Multiplicador de custo entre tiers (padrão 120 — ver UpgradeDef). */
  tierCostMult?: number;
}

const TEMPLATES: Template[] = [
  // ── Clique ─────────────────────────────────────────────
  {
    id: 'click_power', name: 'Poder do Clique', icon: '⚡', category: 'click',
    baseCost: 50, currency: 'energy', costMult: 1.15, maxLevel: 200, unlockLevel: 1, rarity: 'common', tiers: 6,
    desc: 'Aumenta o poder de cada clique.',
    effect: (l) => pct({ clickPower: 10 * l }),
    effectDesc: (l) => `+${10 * l}% poder de clique`,
  },
  {
    id: 'click_power2', name: 'Mão de Ferro', icon: '👊', category: 'click',
    baseCost: 2500, currency: 'energy', costMult: 1.18, maxLevel: 200, unlockLevel: 5, rarity: 'uncommon', tiers: 5,
    desc: 'Treinamento avançado de cliques.',
    effect: (l) => pct({ clickPower: 15 * l }),
    effectDesc: (l) => `+${15 * l}% poder de clique`,
  },
  {
    id: 'click_power3', name: 'Braço Mecânico', icon: '🦾', category: 'click',
    baseCost: 100000, currency: 'energy', costMult: 1.2, maxLevel: 200, unlockLevel: 12, rarity: 'rare', tiers: 4,
    desc: 'Implante cibernético de força.',
    effect: (l) => pct({ clickPower: 25 * l }),
    effectDesc: (l) => `+${25 * l}% poder de clique`,
  },
  {
    id: 'crit_chance', name: 'Olho Crítico', icon: '🎯', category: 'click',
    baseCost: 300, currency: 'energy', costMult: 1.25, maxLevel: 50, unlockLevel: 3, rarity: 'uncommon', tiers: 5,
    desc: 'Aumenta a chance de acerto crítico.',
    effect: (l) => pct({ critChance: 1 * l }),
    effectDesc: (l) => `+${l}% chance crítica`,
  },
  {
    id: 'crit_damage', name: 'Lâmina Afiada', icon: '🗡️', category: 'click',
    baseCost: 600, currency: 'energy', costMult: 1.22, maxLevel: 100, unlockLevel: 4, rarity: 'rare', tiers: 4,
    desc: 'Multiplica o dano dos críticos.',
    effect: (l) => pct({ critDamage: 15 * l }),
    effectDesc: (l) => `+${15 * l}% dano crítico`,
  },
  {
    id: 'super_crit', name: 'Super Crítico', icon: '💥', category: 'click',
    baseCost: 50000, currency: 'energy', costMult: 1.3, maxLevel: 30, unlockLevel: 15, rarity: 'epic', tiers: 3,
    desc: 'Chance de acerto super crítico (×10).',
    effect: (l) => pct({ superCritChance: 0.5 * l }),
    effectDesc: (l) => `+${0.5 * l}% chance de super crítico`,
  },
  {
    id: 'mega_crit', name: 'Mega Crítico', icon: '☄️', category: 'click',
    baseCost: 5000000, currency: 'energy', costMult: 1.35, maxLevel: 25, unlockLevel: 30, rarity: 'legendary', tiers: 3,
    desc: 'Chance de acerto mega crítico (×100).',
    effect: (l) => pct({ megaCritChance: 0.15 * l }),
    effectDesc: (l) => `+${0.15 * l}% chance de mega crítico`,
  },
  {
    id: 'ultra_crit', name: 'Ultra Crítico', icon: '🌠', category: 'click',
    baseCost: 6000, currency: 'crystals', costMult: 1.4, maxLevel: 20, unlockLevel: 50, rarity: 'mythic', tiers: 1, tierCostMult: 5,
    desc: 'Chance de acerto ultra crítico (×1000).',
    effect: (l) => pct({ ultraCritChance: 0.05 * l }),
    effectDesc: (l) => `+${0.05 * l}% chance de ultra crítico`,
  },
  {
    id: 'diamond_power', name: 'Núcleo de Diamante', icon: '💎', category: 'click',
    baseCost: 1000, currency: 'crystals', costMult: 1.35, maxLevel: 50, unlockLevel: 20, rarity: 'legendary', tiers: 1, tierCostMult: 10,
    desc: 'Cristalizado com diamantes — multiplica o poder de cada clique.',
    effect: (l) => pct({ clickPower: 25 * l }),
    effectDesc: (l) => `+${25 * l}% poder de clique`,
  },
  {
    id: 'diamond_prod', name: 'Reator de Diamante', icon: '🟣', category: 'production',
    baseCost: 1500, currency: 'crystals', costMult: 1.35, maxLevel: 50, unlockLevel: 25, rarity: 'mythic', tiers: 1, tierCostMult: 10,
    desc: 'Núcleo premium — turbina toda a produção de energia.',
    effect: (l) => pct({ production: 30 * l }),
    effectDesc: (l) => `+${30 * l}% produção de energia`,
  },
  {
    id: 'diamond_luck', name: 'Aura de Diamante', icon: '💠', category: 'economy',
    baseCost: 600, currency: 'crystals', costMult: 1.3, maxLevel: 50, unlockLevel: 18, rarity: 'epic', tiers: 1, tierCostMult: 10,
    desc: 'Aura cobiçada — mais sorte e mais drops de moedas.',
    effect: (l) => pct({ luck: 10 * l, dropChance: 10 * l }),
    effectDesc: (l) => `+${10 * l}% sorte e drops`,
  },
  {
    id: 'combo_duration', name: 'Estabilidade', icon: '⏱️', category: 'click',
    baseCost: 800, currency: 'energy', costMult: 1.2, maxLevel: 100, unlockLevel: 3, rarity: 'uncommon', tiers: 4,
    desc: 'Aumenta a duração do combo antes de expirar.',
    effect: (l) => ({ comboDuration: D(2 * l) } as PartialModifiers),
    effectDesc: (l) => `+${2 * l}s de duração do combo`,
  },
  {
    id: 'combo_cap', name: 'Fúria do Combo', icon: '🔥', category: 'click',
    baseCost: 20000, currency: 'energy', costMult: 1.25, maxLevel: 100, unlockLevel: 10, rarity: 'rare', tiers: 4,
    desc: 'Aumenta o limite máximo do combo.',
    effect: (l) => ({ comboCap: D(5 * l) } as PartialModifiers),
    effectDesc: (l) => `+${5 * l} no limite do combo`,
  },

  // ── Produção ────────────────────────────────────────────
  {
    id: 'generator_eff', name: 'Eficiência de Geradores', icon: '⚙️', category: 'production',
    baseCost: 250, currency: 'gold', costMult: 1.2, maxLevel: 300, unlockLevel: 2, rarity: 'common', tiers: 6,
    desc: 'Aumenta a produção de energia por segundo.',
    effect: (l) => pct({ production: 10 * l }),
    effectDesc: (l) => `+${10 * l}% produção de energia`,
  },
  {
    id: 'prod_global', name: 'Reator de Fluxo', icon: '🔄', category: 'production',
    baseCost: 20000, currency: 'gold', costMult: 1.25, maxLevel: 250, unlockLevel: 8, rarity: 'uncommon', tiers: 5,
    desc: 'Multiplica toda a produção do Núcleo.',
    effect: (l) => pct({ production: 8 * l }),
    effectDesc: (l) => `+${8 * l}% produção global`,
  },
  {
    id: 'auto_speed', name: 'Turbo Automático', icon: '🤖', category: 'production',
    baseCost: 5000, currency: 'gold', costMult: 1.22, maxLevel: 200, unlockLevel: 7, rarity: 'rare', tiers: 4,
    desc: 'Acelera os auto-cliques dos clicadores automáticos.',
    effect: (l) => pct({ autoClickSpeed: 10 * l }),
    effectDesc: (l) => `+${10 * l}% velocidade dos auto-cliques`,
  },
  {
    id: 'idle_boost', name: 'Energia Residual', icon: '🌙', category: 'production',
    baseCost: 100000, currency: 'gold', costMult: 1.28, maxLevel: 100, unlockLevel: 20, rarity: 'epic', tiers: 3,
    desc: 'Produção passiva mesmo com o jogo fechado (ganho offline).',
    effect: (l) => pct({ production: 5 * l }),
    effectDesc: (l) => `+${5 * l}% produção (e offline)`,
  },

  // ── Economia ────────────────────────────────────────────
  {
    id: 'gold_gain', name: 'Alquimia do Ouro', icon: '🪙', category: 'economy',
    baseCost: 400, currency: 'gold', costMult: 1.2, maxLevel: 200, unlockLevel: 3, rarity: 'common', tiers: 6,
    desc: 'Aumenta todo o ouro recebido.',
    effect: (l) => pct({ goldGain: 10 * l }),
    effectDesc: (l) => `+${10 * l}% ganho de ouro`,
  },
  {
    id: 'drop_chance', name: 'Magnetismo de Recompensas', icon: '🧲', category: 'economy',
    baseCost: 1500, currency: 'gold', costMult: 1.25, maxLevel: 50, unlockLevel: 6, rarity: 'uncommon', tiers: 4,
    desc: 'Aumenta a chance de ouro dropado nos cliques.',
    effect: (l) => pct({ dropChance: 2 * l }),
    effectDesc: (l) => `+${2 * l}% chance de drop de ouro`,
  },
  {
    id: 'discount', name: 'Negociação', icon: '🏷️', category: 'economy',
    baseCost: 5000, currency: 'gold', costMult: 1.3, maxLevel: 50, unlockLevel: 9, rarity: 'rare', tiers: 4,
    desc: 'Reduz o preço de tudo que você compra.',
    effect: (l) => pct({ discounts: 1 * l }),
    effectDesc: (l) => `-${l}% no custo de compras`,
  },
  {
    id: 'luck', name: 'Amuleto da Sorte', icon: '🍀', category: 'economy',
    baseCost: 50000, currency: 'gold', costMult: 1.3, maxLevel: 50, unlockLevel: 14, rarity: 'epic', tiers: 3,
    desc: 'Melhora as raridades obtidas em caixas e drops.',
    effect: (l) => pct({ luck: 5 * l }),
    effectDesc: (l) => `+${5 * l}% sorte`,
  },

  // ── Prestígio ───────────────────────────────────────────
  {
    id: 'frag_gain', name: 'Fragmentador', icon: '🧩', category: 'prestige',
    baseCost: 100, currency: 'prestigeCoins', costMult: 1.35, maxLevel: 100, unlockLevel: 1, rarity: 'legendary', tiers: 4,
    desc: 'Aumenta a quantidade de fragmentos ganhos no prestígio.',
    effect: (l) => pct({ prestigeGain: 10 * l }),
    effectDesc: (l) => `+${10 * l}% ganho de fragmentos`,
  },
  {
    id: 'prestige_power', name: 'Poder Ancestral', icon: '🌟', category: 'prestige',
    baseCost: 250, currency: 'prestigeCoins', costMult: 1.4, maxLevel: 100, unlockLevel: 1, rarity: 'mythic', tiers: 4,
    desc: 'Cada nível aumenta cliques e produção em 5%.',
    effect: (l) => pct({ clickPower: 5 * l, production: 5 * l }),
    effectDesc: (l) => `+${5 * l}% clique e produção`,
  },
  {
    id: 'ascension_boost', name: 'Chave de Ascensão', icon: '👑', category: 'prestige',
    baseCost: 5, currency: 'ascensionCoins', costMult: 1.5, maxLevel: 100, unlockLevel: 1, rarity: 'divine', tiers: 3,
    desc: 'Aumenta o ganho de moedas de ascensão.',
    effect: (l) => pct({ prestigeGain: 15 * l }),
    effectDesc: (l) => `+${15 * l}% progresso de prestígio`,
  },
];

/** Gera upgrades tiered a partir dos templates (mais de 120 upgrades). */
export const UPGRADE_DEFS: UpgradeDef[] = TEMPLATES.flatMap((t) => {
  const out: UpgradeDef[] = [];
  for (let tier = 1; tier <= t.tiers + 2; tier++) {
    const isBase = tier === 1;
    out.push({
      id: isBase ? t.id : `${t.id}_t${tier}`,
      name: isBase ? t.name : `${t.name} ${TIER_NAMES[tier]}`,
      desc: t.desc,
      icon: t.icon,
      category: t.category,
      baseCost: isBase ? String(t.baseCost) : D(t.baseCost).mul(D(t.tierCostMult ?? 120).pow(tier - 1)).toFixed(0),
      tierCostMult: t.tierCostMult,
      currency: t.currency,
      costMult: t.costMult + (tier - 1) * 0.02,
      maxLevel: t.maxLevel,
      unlockLevel: t.unlockLevel + (tier - 1) * 6,
      rarity: t.rarity,
      effect: t.effect,
      effectDesc: t.effectDesc,
    });
  }
  return out;
});

export const UPGRADE_MAP: Record<string, UpgradeDef> = Object.fromEntries(UPGRADE_DEFS.map((u) => [u.id, u]));

export function upgradesByCategory(cat: UpgradeCategory): UpgradeDef[] {
  return UPGRADE_DEFS.filter((u) => u.category === cat);
}

export const UPGRADE_CATEGORIES: { id: UpgradeCategory; name: string; icon: string }[] = [
  { id: 'click', name: 'Clique', icon: '⚡' },
  { id: 'production', name: 'Produção', icon: '⚙️' },
  { id: 'economy', name: 'Economia', icon: '🪙' },
  { id: 'prestige', name: 'Prestígio', icon: '🌟' },
];
