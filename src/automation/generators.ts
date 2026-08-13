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
    baseCost: '75', currency: 'gold', costMult: 1.17, baseProduction: '0.5', type: 'clicks', unlockLevel: 1,
  },
  // ENERGIA é ESCASSA por design: custos altos e produção reduzida — a energia
  // compra upgrades de CLIQUE e quem quer mais depende de cliques manuais.
  {
    id: 'generator_i', name: 'Gerador Mk. I', icon: '🔋',
    desc: 'Gera energia de forma constante (produção reduzida).',
    baseCost: '1500', currency: 'gold', costMult: 1.16, baseProduction: '0.5', type: 'energy', unlockLevel: 1,
  },
  {
    id: 'generator_ii', name: 'Gerador Mk. II', icon: '🔌',
    desc: 'Geração ampliada de energia.',
    baseCost: '24000', currency: 'gold', costMult: 1.17, baseProduction: '2', type: 'energy', unlockLevel: 6,
  },
  {
    id: 'drone', name: 'Drone de Energia', icon: '🚁',
    desc: 'Drones que captam energia do ambiente.',
    baseCost: '180000', currency: 'gold', costMult: 1.18, baseProduction: '8', type: 'energy', unlockLevel: 12,
  },
  {
    id: 'robot', name: 'Robô Coletor', icon: '🤖',
    desc: 'Robôs industriais de coleta.',
    baseCost: '1800000', currency: 'gold', costMult: 1.19, baseProduction: '40', type: 'energy', unlockLevel: 20,
  },
  {
    id: 'farm', name: 'Fazenda Solar', icon: '☀️',
    desc: 'Painéis solares em larga escala.',
    baseCost: '18000000', currency: 'gold', costMult: 1.2, baseProduction: '250', type: 'energy', unlockLevel: 30,
  },
  {
    id: 'reactor', name: 'Reator de Plasma', icon: '☢️',
    desc: 'Reação de plasma controlada.',
    baseCost: '240000000', currency: 'gold', costMult: 1.21, baseProduction: '1500', type: 'energy', unlockLevel: 42,
  },
  {
    id: 'plant', name: 'Usina Orbital', icon: '🛰️',
    desc: 'Coleta energia direto da estrela.',
    baseCost: '3600000000', currency: 'gold', costMult: 1.22, baseProduction: '10000', type: 'energy', unlockLevel: 55,
  },
  {
    id: 'gold_miner', name: 'Minerador de Ouro', icon: '⛏️',
    desc: 'Extrai ouro automaticamente.',
    baseCost: '600000', currency: 'gold', costMult: 1.2, baseProduction: '0.08', type: 'gold', unlockLevel: 18,
  },
];

export const GENERATOR_MAP: Record<string, GeneratorDef> = Object.fromEntries(GENERATOR_DEFS.map((g) => [g.id, g]));

export function generatorProduction(g: GeneratorDef, level: number): ReturnType<typeof D> {
  return D(g.baseProduction).mul(level);
}
