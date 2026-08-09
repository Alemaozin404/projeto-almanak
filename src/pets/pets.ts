import { RARITIES, RARITY_LIST } from '../core/rarities';
import { pct, type PartialModifiers } from '../core/modifiers';
import type { RarityId } from '../game/types';

export interface PetSkill {
  name: string;
  desc: string;
  everyMs: number;
  durationMs: number;
  mult: number;
  type: 'production' | 'click';
}

export interface PetDef {
  id: string;
  name: string;
  icon: string;
  rarity: RarityId;
  desc: string;
  bonus: PartialModifiers;
  bonusText: string;
  skill?: PetSkill;
  evolves: boolean;
}

const ANIMALS: Record<RarityId, string[]> = {
  common: ['Rato', 'Slime', 'Corvo', 'Esquilo', 'Sapo', 'Gato', 'Cachorro', 'Lagarto'],
  uncommon: ['Raposa', 'Lobo', 'Falcão', 'Cobra', 'Lontra', 'Texugo', 'Coruja', 'Pantera'],
  rare: ['Tigre', 'Águia', 'Leão', 'Urso', 'Lince', 'Rinoceronte', 'Hipopótamo', 'Panda'],
  epic: ['Fênix', 'Grifo', 'Quimera', 'Basilisco', 'Cérbero', 'Hidra', 'Minotauro', 'Manticora'],
  legendary: ['Dragão', 'Kraken', 'Leviatã', 'Titã', 'Valquíria', 'Ifrit', 'Sereia', 'Golem'],
  mythic: ['Dragão Ancião', 'Fênix Imortal', 'Jormungandr', 'Bahamut', 'Tiamat', 'Odin', 'Lúcifer', 'Void'],
  divine: ['Serafim', 'Arcanjo', 'Deus do Trovão', 'Dragão Divino', 'Quimera Dourada', 'Anjo Caído', 'Primordial', 'Éter'],
  celestial: ['Dragão Celestial', 'Estrela Viva', 'Cometa', 'Nebulosa', 'Sol Radiante', 'Lua Eterna', 'Guardião Cósmico', 'Vórtice'],
  transcendent: ['Um Todo', 'O Infinito', 'Singularidade', 'Criador', 'Vazio Absoluto', 'Fim de Tudo', 'Origem', 'O Desconhecido'],
};

const PREFIX = ['Selvagem', 'Ancião', 'Sombrio', 'Radiante', 'Feroz', 'Sábio', 'Fantasmal', 'Eterno', 'Primitivo', 'Astral'];

const ANIMAL_ICONS = ['🐾', '🦴', '🐾', '🐾'];

const CURATED: Omit<PetDef, 'bonusText'>[] = [
  {
    id: 'pet_dragon_celestial', name: 'Dragão Celestial', icon: '🐉', rarity: 'celestial',
    desc: 'Guardião lendário das estrelas.',
    bonus: pct({ clickPower: 350, production: 350, goldGain: 75, critChance: 15 }),
    skill: { name: 'Fúria Celestial', desc: 'A cada 60s, +500% de produção por 10s.', everyMs: 60000, durationMs: 10000, mult: 5, type: 'production' },
    evolves: true,
  },
  {
    id: 'pet_phoenix', name: 'Fênix Imortal', icon: '🔥', rarity: 'mythic',
    desc: 'Renasce das cinzas, sempre mais forte.',
    bonus: pct({ clickPower: 200, production: 150, xpGain: 100 }),
    skill: { name: 'Renascer', desc: 'A cada 45s, +300% de clique por 8s.', everyMs: 45000, durationMs: 8000, mult: 3, type: 'click' },
    evolves: true,
  },
  {
    id: 'pet_void', name: 'Abismo do Vazio', icon: '🌌', rarity: 'transcendent',
    desc: 'Tudo que toca deixa de existir.',
    bonus: pct({ clickPower: 600, production: 600, critChance: 30, critDamage: 150, goldGain: 150 }),
    skill: { name: 'Aniquilação', desc: 'A cada 40s, +1000% de produção por 6s.', everyMs: 40000, durationMs: 6000, mult: 10, type: 'production' },
    evolves: true,
  },
  {
    id: 'pet_golden', name: 'Golem Dourado', icon: '🗿', rarity: 'divine',
    desc: 'Forjado em ouro puro das profundezas.',
    bonus: pct({ goldGain: 300, production: 120, dropChance: 30 }),
    skill: { name: 'Chuva de Ouro', desc: 'A cada 90s, concede 2x ouro por 15s.', everyMs: 90000, durationMs: 15000, mult: 2, type: 'production' },
    evolves: false,
  },
  {
    id: 'pet_seraph', name: 'Serafim', icon: '😇', rarity: 'divine',
    desc: 'Um anjo de pura energia.',
    bonus: pct({ clickPower: 250, production: 250, luck: 100, xpGain: 50 }),
    evolves: false,
  },
  {
    id: 'pet_kraken', name: 'Kraken', icon: '🐙', rarity: 'legendary',
    desc: 'Terror dos mares profundos.',
    bonus: pct({ production: 220, goldGain: 100 }),
    skill: { name: 'Maremoto', desc: 'A cada 75s, +400% de produção por 10s.', everyMs: 75000, durationMs: 10000, mult: 4, type: 'production' },
    evolves: true,
  },
  {
    id: 'pet_star', name: 'Estrela Viva', icon: '⭐', rarity: 'celestial',
    desc: 'Uma estrela com vontade própria.',
    bonus: pct({ clickPower: 300, critChance: 20, luck: 80 }),
    evolves: false,
  },
  {
    id: 'pet_fox', name: 'Raposa Espiritual', icon: '🦊', rarity: 'rare',
    desc: 'Guia fiel dos clicadores.',
    bonus: pct({ clickPower: 60, goldGain: 40 }),
    evolves: true,
  },
  {
    // Pet exclusivo do Passe Premium (nível 100). Não sai em caixas — concedido via passe.
    id: 'pet_chrono', name: 'Cronos', icon: '⏳', rarity: 'celestial',
    desc: 'Senhor do tempo. Exclusivo do Passe Premium.',
    bonus: pct({ clickPower: 500, production: 500, critChance: 25, goldGain: 200, luck: 100 }),
    skill: { name: 'Dilatação Temporal', desc: 'A cada 50s, +800% de produção por 8s.', everyMs: 50000, durationMs: 8000, mult: 8, type: 'production' },
    evolves: true,
  },
];

/** Gera pets procedurais para todas as raridades (centenas de combinações possíveis). */
const GENERATED: PetDef[] = [];
let gid = 0;
for (const rarity of RARITY_LIST) {
  const animals = ANIMALS[rarity.id];
  for (let i = 0; i < animals.length; i++) {
    const prefix = PREFIX[(rarity.order * 3 + i) % PREFIX.length];
    const animal = animals[i];
    const m = rarity.mult;
    const isBoss = i === 0; // primeiro animal de cada raridade tem habilidade
    const bonus: PartialModifiers = pct({
      clickPower: +(20 * m * (1 + (i % 3))).toFixed(1),
      production: +(15 * m * (1 + (i % 2))).toFixed(1),
      goldGain: +(10 * m).toFixed(1),
      petPower: +(5 * m).toFixed(1),
    });
    GENERATED.push({
      id: `pet_gen_${gid++}`,
      name: `${prefix} ${animal}`,
      icon: ANIMAL_ICONS[rarity.order % ANIMAL_ICONS.length],
      rarity: rarity.id,
      desc: `Um ${animal} ${rarity.name.toLowerCase()} de poder ${m.toFixed(1)}x.`,
      bonus,
      bonusText: '',
      skill: isBoss
        ? {
            name: `Instinto ${rarity.name}`,
            desc: `A cada ${60 + rarity.order * 10}s, +${100 * m}% de produção por 8s.`,
            everyMs: (60 + rarity.order * 10) * 1000,
            durationMs: 8000,
            mult: 1 + rarity.mult,
            type: 'production',
          }
        : undefined,
      evolves: rarity.order >= 3,
    });
  }
}

export const PET_DEFS: PetDef[] = [...CURATED, ...GENERATED].map((p) => ({
  ...p,
  bonusText: bonusToText(p.bonus),
}));

export const PET_MAP: Record<string, PetDef> = Object.fromEntries(PET_DEFS.map((p) => [p.id, p]));

export const PET_SLOT_COUNT = 4;

export function petsByRarity(rarity: RarityId): PetDef[] {
  return PET_DEFS.filter((p) => p.rarity === rarity);
}

export function bonusToText(bonus: PartialModifiers): string {
  const parts: string[] = [];
  if (bonus.clickPower) parts.push(`+${pctLabel(bonus.clickPower)}% clique`);
  if (bonus.production) parts.push(`+${pctLabel(bonus.production)}% produção`);
  if (bonus.goldGain) parts.push(`+${pctLabel(bonus.goldGain)}% ouro`);
  if (bonus.critChance) parts.push(`+${pctLabel(bonus.critChance)}% chance crítica`);
  if (bonus.critDamage) parts.push(`+${pctLabel(bonus.critDamage)}% dano crítico`);
  if (bonus.xpGain) parts.push(`+${pctLabel(bonus.xpGain)}% XP`);
  if (bonus.petPower) parts.push(`+${pctLabel(bonus.petPower)}% poder de pets`);
  if (bonus.luck) parts.push(`+${pctLabel(bonus.luck)}% sorte`);
  if (bonus.dropChance) parts.push(`+${pctLabel(bonus.dropChance)}% drops`);
  if (bonus.autoClickSpeed) parts.push(`+${pctLabel(bonus.autoClickSpeed)}% auto-clique`);
  return parts.join(' · ');
}

function pctLabel(d: import('decimal.js').Decimal): string {
  const n = d.minus(1).mul(100);
  return n.isInteger() ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, '');
}

/** Multiplicador de bônus do pet por nível. */
export function petLevelMult(level: number): number {
  return 1 + 0.1 * (level - 1);
}

/** Multiplicador por evolução. */
export function petEvolveMult(evolves: number): number {
  return Math.pow(2, evolves);
}

export function rarityMultOf(r: RarityId): number {
  return RARITIES[r]?.mult ?? 1;
}
