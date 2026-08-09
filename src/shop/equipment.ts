import { D } from '../core/bignum';
import { RARITIES, type RarityDef } from '../core/rarities';
import type { PartialModifiers } from '../core/modifiers';
import type { RarityId } from '../game/types';

export type EquipSlot = 'helmet' | 'armor' | 'gloves' | 'boots' | 'ring' | 'amulet' | 'weapon';

export const EQUIP_SLOTS: { id: EquipSlot; name: string; icon: string }[] = [
  { id: 'helmet', name: 'Capacete', icon: '🪖' },
  { id: 'armor', name: 'Armadura', icon: '🛡️' },
  { id: 'gloves', name: 'Luvas', icon: '🧤' },
  { id: 'boots', name: 'Botas', icon: '🥾' },
  { id: 'ring', name: 'Anel', icon: '💍' },
  { id: 'amulet', name: 'Amuleto', icon: '📿' },
  { id: 'weapon', name: 'Arma', icon: '⚔️' },
];

export interface EquipmentDef {
  id: string;
  slot: EquipSlot;
  name: string;
  icon: string;
  rarity: RarityId;
  stats: PartialModifiers;
  statText: string;
  baseValue: string;
  unlockLevel: number;
}

const BASE_NAMES: Record<EquipSlot, string[]> = {
  helmet: ['Elmo', 'Capacete', 'Coroa', 'Elmo de Comando', 'Máscara'],
  armor: ['Armadura', 'Peitoral', 'Túnica', 'Cota de Malha', 'Armadura de Guerra'],
  gloves: ['Luvas', 'Manoplas', 'Garras', 'Luvas de Força', 'Manoplas Técnicas'],
  boots: ['Botas', 'Grevas', 'Botas de Salto', 'Botas Rápidas', 'Grevas Táticas'],
  ring: ['Anel', 'Anel de Poder', 'Anel Antigo', 'Anel do Destino', 'Anel Estelar'],
  amulet: ['Amuleto', 'Colar', 'Talismã', 'Amuleto Sagrado', 'Talismã Cósmico'],
  weapon: ['Espada', 'Machado', 'Lança', 'Cajado', 'Lâmina de Energia'],
};

const SUFFIX: Record<RarityId, string> = {
  common: 'Simples',
  uncommon: 'Refinado',
  rare: 'Encantado',
  epic: 'Épico',
  legendary: 'Lendário',
  mythic: 'Mítico',
  divine: 'Divino',
  celestial: 'Celestial',
  transcendent: 'Transcendente',
};

function statsFor(slot: EquipSlot, rarity: RarityDef): { stats: PartialModifiers; text: string } {
  const m = rarity.mult;
  const parts: string[] = [];
  const add = (label: string, v: number) => {
    parts.push(`+${v}% ${label}`);
  };
  const p: PartialModifiers = {};
  // Monta manualmente por slot para maior clareza visual
  switch (slot) {
    case 'weapon': {
      const v = +(60 * m).toFixed(1);
      p.clickPower = D(1 + v / 100);
      add('poder de clique', v);
      break;
    }
    case 'helmet': {
      const v = +(3 * m).toFixed(2);
      p.critChance = D(v / 100);
      add('chance crítica', v);
      const d = +(40 * m).toFixed(1);
      p.critDamage = D(1 + d / 100);
      add('dano crítico', d);
      break;
    }
    case 'armor': {
      const v = +(45 * m).toFixed(1);
      p.production = D(1 + v / 100);
      add('produção', v);
      break;
    }
    case 'gloves': {
      const v = +(30 * m).toFixed(1);
      p.clickPower = D(1 + v / 100);
      add('poder de clique', v);
      const g = +(25 * m).toFixed(1);
      p.goldGain = D(1 + g / 100);
      add('ganho de ouro', g);
      break;
    }
    case 'boots': {
      const v = +(30 * m).toFixed(1);
      p.production = D(1 + v / 100);
      add('produção', v);
      const a = +(25 * m).toFixed(1);
      p.autoClickSpeed = D(1 + a / 100);
      add('velocidade de auto-clique', a);
      break;
    }
    case 'ring': {
      const g = +(40 * m).toFixed(1);
      p.goldGain = D(1 + g / 100);
      add('ganho de ouro', g);
      const l = +(20 * m).toFixed(1);
      p.luck = D(1 + l / 100);
      add('sorte', l);
      break;
    }
    case 'amulet': {
      const x = +(30 * m).toFixed(1);
      p.xpGain = D(1 + x / 100);
      add('ganho de XP', x);
      const pe = +(30 * m).toFixed(1);
      p.petPower = D(1 + pe / 100);
      add('poder dos pets', pe);
      break;
    }
  }
  return { stats: p, text: parts.join(' · ') || '+' };
}

export const EQUIPMENT_DEFS: Record<string, EquipmentDef> = {};

for (const slot of EQUIP_SLOTS) {
  for (const rarity of Object.values(RARITIES)) {
    const nameBase = BASE_NAMES[slot.id][rarity.order % BASE_NAMES[slot.id].length];
    const name = `${nameBase} ${SUFFIX[rarity.id]}`;
    const { stats, text } = statsFor(slot.id, rarity);
    const id = `eq_${slot.id}_${rarity.id}`;
    EQUIPMENT_DEFS[id] = {
      id,
      slot: slot.id,
      name,
      icon: slot.icon,
      rarity: rarity.id,
      stats,
      statText: text,
      baseValue: D(250).mul(D(12).pow(rarity.order)).toFixed(0),
      unlockLevel: 1 + rarity.order * 4,
    };
  }
}

export const EQUIPMENT_LIST = Object.values(EQUIPMENT_DEFS);

export function equipmentBySlot(slot: EquipSlot): EquipmentDef[] {
  return EQUIPMENT_LIST.filter((e) => e.slot === slot);
}

/** Nível efetivo de um equipamento = quantidade de cópias (duplicatas sobem de nível). */
export function equipmentLevel(count: number): number {
  return Math.max(1, count);
}

export function equipmentStatMultiplier(count: number): number {
  return 1 + 0.1 * (equipmentLevel(count) - 1);
}
