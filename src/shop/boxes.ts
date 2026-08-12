import { D } from '../core/bignum';
import { rollRarity, RARITY_LIST } from '../core/rarities';
import type { RarityId } from '../game/types';

export interface BoxDef {
  id: string;
  name: string;
  icon: string;
  cost: string;
  currency: 'crystals' | 'gold' | 'eventTokens';
  /** Preço alternativo em CRÉDITOS 💳 (moeda principal) — quando definido, a caixa pode ser comprada com créditos. */
  creditCost?: number;
  unlockLevel: number;
  desc: string;
  typeWeights: { pet: number; equipment: number; resource: number; consumable: number; ticket: number };
  rarityWeights: Partial<Record<RarityId, number>>;
}

export const BOX_DEFS: BoxDef[] = [
  {
    id: 'basic', name: 'Caixa Básica', icon: '📦',
    cost: '50', currency: 'crystals', creditCost: 10, unlockLevel: 1,
    desc: 'A caixa inicial. Pequena chance de algo bom.',
    typeWeights: { pet: 55, equipment: 25, resource: 12, consumable: 6, ticket: 2 },
    rarityWeights: { common: 1000, uncommon: 500, rare: 150, epic: 40, legendary: 10, mythic: 2, divine: 0.4, celestial: 0.1, transcendent: 0.02 },
  },
  {
    id: 'rare', name: 'Caixa Rara', icon: '🎁',
    cost: '160', currency: 'crystals', creditCost: 25, unlockLevel: 5,
    desc: 'Raridades melhores garantidas.',
    typeWeights: { pet: 55, equipment: 28, resource: 10, consumable: 5, ticket: 2 },
    rarityWeights: { common: 500, uncommon: 700, rare: 400, epic: 120, legendary: 35, mythic: 8, divine: 1.5, celestial: 0.4, transcendent: 0.08 },
  },
  {
    id: 'epic', name: 'Caixa Épica', icon: '🗃️',
    cost: '400', currency: 'crystals', creditCost: 60, unlockLevel: 12,
    desc: 'Garante no mínimo raridade rara.',
    typeWeights: { pet: 55, equipment: 30, resource: 8, consumable: 5, ticket: 2 },
    rarityWeights: { uncommon: 300, rare: 700, epic: 350, legendary: 110, mythic: 30, divine: 6, celestial: 1.6, transcendent: 0.3 },
  },
  {
    id: 'legendary', name: 'Caixa Lendária', icon: '📯',
    cost: '1400', currency: 'crystals', creditCost: 200, unlockLevel: 20,
    desc: 'Garante no mínimo raridade épica.',
    typeWeights: { pet: 55, equipment: 32, resource: 6, consumable: 4, ticket: 3 },
    rarityWeights: { rare: 200, epic: 700, legendary: 320, mythic: 100, divine: 22, celestial: 6, transcendent: 1.2 },
  },
  {
    id: 'mythic', name: 'Caixa Mítica', icon: '🪔',
    cost: '3600', currency: 'crystals', creditCost: 500, unlockLevel: 30,
    desc: 'Raridades míticas e além.',
    typeWeights: { pet: 58, equipment: 34, resource: 4, consumable: 2, ticket: 2 },
    rarityWeights: { epic: 300, legendary: 700, mythic: 300, divine: 80, celestial: 22, transcendent: 5 },
  },
  {
    id: 'celestial', name: 'Caixa Celestial', icon: '✨',
    cost: '9000', currency: 'crystals', creditCost: 1200, unlockLevel: 45,
    desc: 'O auge das caixas. Raridades divinas e celestiais.',
    typeWeights: { pet: 60, equipment: 36, resource: 2, consumable: 1, ticket: 1 },
    rarityWeights: { legendary: 300, mythic: 700, divine: 350, celestial: 120, transcendent: 30 },
  },
  {
    id: 'event', name: 'Caixa do Evento', icon: '🎊',
    cost: '100', currency: 'eventTokens', unlockLevel: 1,
    desc: 'Caixa exclusiva de eventos. Contém pets e itens especiais.',
    typeWeights: { pet: 60, equipment: 30, resource: 5, consumable: 3, ticket: 2 },
    rarityWeights: { uncommon: 500, rare: 600, epic: 250, legendary: 80, mythic: 25, divine: 6, celestial: 1.5, transcendent: 0.3 },
  },
];

export const BOX_MAP: Record<string, BoxDef> = Object.fromEntries(BOX_DEFS.map((b) => [b.id, b]));

export interface BoxResult {
  kind: 'pet' | 'equipment' | 'resource' | 'consumable' | 'ticket';
  itemId: string;
  label: string;
  rarity: RarityId;
  amount: string;
}

/** Probabilidades percentuais exibidas na interface. */
export function boxOddsText(box: BoxDef): string {
  const total = Object.values(box.rarityWeights).reduce((a, b) => a + b, 0);
  return RARITY_LIST.map((r) => {
    const w = box.rarityWeights[r.id] ?? 0;
    return `${r.name}: ${((w / total) * 100).toFixed(w > 0 && (w / total) * 100 < 0.1 ? 2 : 1).replace('.', ',')}%`;
  }).join(' · ');
}

export function rollBoxRarity(box: BoxDef, luckMult: number): RarityId {
  return rollRarity(box.rarityWeights, luckMult);
}

export function rollBoxType(box: BoxDef): keyof BoxDef['typeWeights'] {
  const entries = Object.entries(box.typeWeights) as [keyof BoxDef['typeWeights'], number][];
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = Math.random() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r <= 0) return k;
  }
  return 'pet';
}

/** Ajusta custo com desconto global. */
export function boxCostWithDiscount(box: BoxDef, discountPct: number): string {
  return D(box.cost).mul(1 - Math.min(0.9, discountPct / 100)).toFixed(2);
}
