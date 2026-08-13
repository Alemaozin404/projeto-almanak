import { D } from '../core/bignum';
import { pct, type PartialModifiers } from '../core/modifiers';

export type SkillCategory = 'poder' | 'economia' | 'automacao' | 'sorte' | 'critico' | 'prestigio' | 'pets' | 'idle';

export const SKILL_CATEGORIES: { id: SkillCategory; name: string; icon: string; color: string }[] = [
  { id: 'poder', name: 'Poder', icon: '⚡', color: '#37f5ff' },
  { id: 'economia', name: 'Economia', icon: '💰', color: '#ffd94d' },
  { id: 'automacao', name: 'Automação', icon: '🤖', color: '#9aa5b1' },
  { id: 'sorte', name: 'Sorte', icon: '🍀', color: '#3ddc84' },
  { id: 'critico', name: 'Crítico', icon: '🔥', color: '#ff4d6d' },
  { id: 'prestigio', name: 'Prestígio', icon: '👑', color: '#ffe14d' },
  { id: 'pets', name: 'Pets', icon: '🐾', color: '#b06cff' },
  { id: 'idle', name: 'Idle', icon: '⏱', color: '#4da6ff' },
];

export interface SkillNodeDef {
  id: string;
  name: string;
  icon: string;
  category: SkillCategory;
  desc: string;
  maxLevel: number;
  prereq?: { id: string; level: number };
  cost: (level: number) => number;
  effect: (level: number) => PartialModifiers;
  effectDesc: (level: number) => string;
}

export const SKILL_NODES: SkillNodeDef[] = [
  // Poder
  { id: 'super_click', name: 'Super Clique', icon: '⚡', category: 'poder', desc: 'Aumenta o poder de clique.', maxLevel: 50, cost: () => 1, effect: (l) => pct({ clickPower: 3 * l }), effectDesc: (l) => `+${3 * l}% clique` },
  { id: 'double_hit', name: 'Golpe Duplo', icon: '👊', category: 'poder', desc: 'Reforço ainda maior de clique.', maxLevel: 50, prereq: { id: 'super_click', level: 10 }, cost: () => 1, effect: (l) => pct({ clickPower: 5 * l }), effectDesc: (l) => `+${5 * l}% clique` },
  { id: 'power_surge', name: 'Sobrecarga', icon: '🌩️', category: 'poder', desc: 'Energia extra por clique.', maxLevel: 50, prereq: { id: 'double_hit', level: 15 }, cost: () => 1, effect: (l) => ({ energyPerClick: D(0.5 * l) } as PartialModifiers), effectDesc: (l) => `+${0.5 * l} energia por clique` },
  // Economia
  { id: 'gold_master', name: 'Mestre do Ouro', icon: '🪙', category: 'economia', desc: 'Aumenta todo o ouro ganho.', maxLevel: 50, cost: () => 1, effect: (l) => pct({ goldGain: 3 * l }), effectDesc: (l) => `+${3 * l}% ouro` },
  { id: 'merchant', name: 'Mercador', icon: '🏷️', category: 'economia', desc: 'Reduz preços de compras.', maxLevel: 50, prereq: { id: 'gold_master', level: 10 }, cost: () => 1, effect: (l) => pct({ discounts: 0.5 * l }), effectDesc: (l) => `-${0.5 * l}% custo` },
  { id: 'magnate', name: 'Magnata', icon: '💎', category: 'economia', desc: 'Chance maior de drops de ouro.', maxLevel: 50, prereq: { id: 'merchant', level: 15 }, cost: () => 1, effect: (l) => pct({ dropChance: 0.3 * l }), effectDesc: (l) => `+${0.3 * l}% drops` },
  // Automação
  { id: 'auto_speed', name: 'Automação', icon: '🤖', category: 'automacao', desc: 'Acelera auto-cliques.', maxLevel: 50, cost: () => 1, effect: (l) => pct({ autoClickSpeed: 4 * l }), effectDesc: (l) => `+${4 * l}% auto-clique` },
  { id: 'machines', name: 'Máquinas', icon: '⚙️', category: 'automacao', desc: 'Aumenta a produção dos geradores.', maxLevel: 50, prereq: { id: 'auto_speed', level: 10 }, cost: () => 1, effect: (l) => pct({ production: 3 * l }), effectDesc: (l) => `+${3 * l}% produção` },
  { id: 'sentient', name: 'Inteligência Artificial', icon: '🧠', category: 'automacao', desc: 'Sistemas que se aprimoram sozinhos.', maxLevel: 50, prereq: { id: 'machines', level: 20 }, cost: () => 1, effect: (l) => pct({ production: 6 * l }), effectDesc: (l) => `+${6 * l}% produção` },
  // Sorte
  { id: 'luck_master', name: 'Sorte', icon: '🍀', category: 'sorte', desc: 'Melhora raridades de caixas.', maxLevel: 50, cost: () => 1, effect: (l) => pct({ luck: 2.5 * l }), effectDesc: (l) => `+${2.5 * l}% sorte` },
  { id: 'finder', name: 'Caçador de Tesouros', icon: '🧭', category: 'sorte', desc: 'Mais chances de achar pets raros.', maxLevel: 50, prereq: { id: 'luck_master', level: 10 }, cost: () => 1, effect: (l) => pct({ petFind: 2.5 * l }), effectDesc: (l) => `+${2.5 * l}% achado de pets` },
  // Crítico
  { id: 'crit_master', name: 'Crítico', icon: '🎯', category: 'critico', desc: 'Aumenta a chance crítica.', maxLevel: 50, cost: () => 1, effect: (l) => pct({ critChance: 0.25 * l }), effectDesc: (l) => `+${0.25 * l}% chance crítica` },
  { id: 'crit_damage_master', name: 'Dano Crítico', icon: '💥', category: 'critico', desc: 'Multiplica o dano crítico.', maxLevel: 50, prereq: { id: 'crit_master', level: 10 }, cost: () => 1, effect: (l) => pct({ critDamage: 4 * l }), effectDesc: (l) => `+${4 * l}% dano crítico` },
  { id: 'devastation', name: 'Devastação', icon: '☄️', category: 'critico', desc: 'Chance de super crítico.', maxLevel: 50, prereq: { id: 'crit_damage_master', level: 20 }, cost: () => 1, effect: (l) => pct({ superCritChance: 0.15 * l }), effectDesc: (l) => `+${0.15 * l}% super crítico` },
  // Prestígio
  { id: 'frag_master', name: 'Fragmentos', icon: '🧩', category: 'prestigio', desc: 'Mais fragmentos no prestígio.', maxLevel: 50, cost: () => 1, effect: (l) => pct({ prestigeGain: 3 * l }), effectDesc: (l) => `+${3 * l}% fragmentos` },
  { id: 'legacy', name: 'Legado', icon: '🏛️', category: 'prestigio', desc: 'Bônus permanente de poder.', maxLevel: 50, prereq: { id: 'frag_master', level: 10 }, cost: () => 1, effect: (l) => pct({ clickPower: 2 * l, production: 2 * l }), effectDesc: (l) => `+${2 * l}% clique e produção` },
  // Pets
  { id: 'pet_master', name: 'Domador', icon: '🐾', category: 'pets', desc: 'Aumenta o poder dos pets.', maxLevel: 50, cost: () => 1, effect: (l) => pct({ petPower: 3 * l }), effectDesc: (l) => `+${3 * l}% poder de pets` },
  { id: 'pet_whisper', name: 'Vínculo', icon: '💞', category: 'pets', desc: 'Pets encontrados com mais frequência.', maxLevel: 50, prereq: { id: 'pet_master', level: 10 }, cost: () => 1, effect: (l) => pct({ petFind: 3 * l }), effectDesc: (l) => `+${3 * l}% achado de pets` },
  // Idle
  { id: 'combo_master', name: 'Combo Estendido', icon: '⏱️', category: 'idle', desc: 'Combo dura mais e vai mais longe.', maxLevel: 50, cost: () => 1, effect: (l) => ({ comboDuration: D(1 * l), comboCap: D(1.5 * l) } as PartialModifiers), effectDesc: (l) => `+${1 * l}s combo e +${1.5 * l} limite` },
  { id: 'offline_master', name: 'Descanso Ativo', icon: '🌙', category: 'idle', desc: 'Melhor ganho offline.', maxLevel: 50, prereq: { id: 'combo_master', level: 10 }, cost: () => 1, effect: (l) => pct({ production: 2 * l }), effectDesc: (l) => `+${2 * l}% produção (inclui offline)` },
];

export const SKILL_MAP: Record<string, SkillNodeDef> = Object.fromEntries(SKILL_NODES.map((n) => [n.id, n]));

export function nodesByCategory(cat: SkillCategory): SkillNodeDef[] {
  return SKILL_NODES.filter((n) => n.category === cat);
}

export function canUnlock(node: SkillNodeDef, skills: Record<string, number>): { ok: boolean; reason?: string } {
  if (!node.prereq) return { ok: true };
  const lvl = skills[node.prereq.id] ?? 0;
  return lvl >= node.prereq.level ? { ok: true } : { ok: false, reason: `Requer ${node.prereq.id.replace(/_/g, ' ')} nível ${node.prereq.level}` };
}
