import { D } from '../core/bignum';

export type GeneratorType = 'energy' | 'gold' | 'clicks';

export interface GeneratorDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  baseCost: string;
  currency: 'gold' | 'crystals';
  costMult: number;
  baseProduction: string; // por nível: energia/s, ouro/s ou cliques/s
  type: GeneratorType;
  unlockLevel: number;
}

export const GENERATOR_DEFS: GeneratorDef[] = [
  {
    id: 'auto_clicker', name: 'Clicador Automático', icon: '🖱️',
    desc: 'Clica sozinho a cada segundo, usando seu poder de clique.',
    baseCost: '25', currency: 'gold', costMult: 1.15, baseProduction: '0.5', type: 'clicks', unlockLevel: 1,
  },
  {
    id: 'generator_i', name: 'Gerador Mk. I', icon: '🔋',
    desc: 'Gera energia de forma constante.',
    baseCost: '150', currency: 'gold', costMult: 1.14, baseProduction: '1', type: 'energy', unlockLevel: 1,
  },
  {
    id: 'generator_ii', name: 'Gerador Mk. II', icon: '🔌',
    desc: 'Geração ampliada de energia.',
    baseCost: '2000', currency: 'gold', costMult: 1.15, baseProduction: '8', type: 'energy', unlockLevel: 4,
  },
  {
    id: 'drone', name: 'Drone de Energia', icon: '🚁',
    desc: 'Drones que captam energia do ambiente.',
    baseCost: '15000', currency: 'gold', costMult: 1.16, baseProduction: '45', type: 'energy', unlockLevel: 8,
  },
  {
    id: 'robot', name: 'Robô Coletor', icon: '🤖',
    desc: 'Robôs industriais de coleta.',
    baseCost: '120000', currency: 'gold', costMult: 1.17, baseProduction: '260', type: 'energy', unlockLevel: 14,
  },
  {
    id: 'farm', name: 'Fazenda Solar', icon: '☀️',
    desc: 'Painéis solares em larga escala.',
    baseCost: '1000000', currency: 'gold', costMult: 1.18, baseProduction: '1800', type: 'energy', unlockLevel: 22,
  },
  {
    id: 'reactor', name: 'Reator de Plasma', icon: '☢️',
    desc: 'Reação de plasma controlada.',
    baseCost: '10000000', currency: 'gold', costMult: 1.19, baseProduction: '15000', type: 'energy', unlockLevel: 32,
  },
  {
    id: 'plant', name: 'Usina Orbital', icon: '🛰️',
    desc: 'Coleta energia direto da estrela.',
    baseCost: '150000000', currency: 'gold', costMult: 1.2, baseProduction: '140000', type: 'energy', unlockLevel: 45,
  },
  {
    id: 'gold_miner', name: 'Minerador de Ouro', icon: '⛏️',
    desc: 'Extrai ouro automaticamente.',
    baseCost: '200000', currency: 'gold', costMult: 1.18, baseProduction: '0.125', type: 'gold', unlockLevel: 12,
  },
];

export const GENERATOR_MAP: Record<string, GeneratorDef> = Object.fromEntries(GENERATOR_DEFS.map((g) => [g.id, g]));

export function generatorProduction(g: GeneratorDef, level: number): ReturnType<typeof D> {
  return D(g.baseProduction).mul(level);
}
