export interface ConsumableDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cost: string;
  currency: 'gold' | 'crystals';
  durationMs: number; // 0 = efeito instantâneo
  buffId?: string; // efeito de duração
  buffMult?: number; // multiplicador do buff
  instant: 'gold' | 'energy' | 'petxp' | 'box';
  instantAmountHours?: number; // horas de produção para instantâneos
  unlockLevel: number;
}

export const CONSUMABLE_DEFS: ConsumableDef[] = [
  {
    id: 'power_potion', name: 'Poção de Força', icon: '🧪',
    desc: 'Dobra o poder de clique por 1 minuto.',
    cost: '500', currency: 'gold', durationMs: 60000, buffId: 'click_x2', buffMult: 2, instant: 'box', unlockLevel: 3,
  },
  {
    id: 'prod_potion', name: 'Poção de Produção', icon: '⚗️',
    desc: 'Dobra a produção de energia por 5 minutos.',
    cost: '2500', currency: 'gold', durationMs: 300000, buffId: 'prod_x2', buffMult: 2, instant: 'box', unlockLevel: 5,
  },
  {
    id: 'gold_potion', name: 'Poção de Ouro', icon: '🫙',
    desc: 'Dobra o ganho de ouro por 5 minutos.',
    cost: '2500', currency: 'gold', durationMs: 300000, buffId: 'gold_x2', buffMult: 2, instant: 'box', unlockLevel: 6,
  },
  {
    id: 'luck_elixir', name: 'Elixir da Sorte', icon: '🍀',
    desc: '+25% de chance crítica por 2 minutos.',
    cost: '5000', currency: 'gold', durationMs: 120000, buffId: 'crit_boost', buffMult: 1, instant: 'box', unlockLevel: 8,
  },
  {
    id: 'gold_chest', name: 'Baú de Ouro', icon: '📦',
    desc: 'Concede ouro equivalente a 1 hora de produção.',
    cost: '10000', currency: 'gold', durationMs: 0, instant: 'gold', instantAmountHours: 1, unlockLevel: 10,
  },
  {
    id: 'energy_cell', name: 'Bateria de Emergência', icon: '🔋',
    desc: 'Concede energia equivalente a 30 minutos de produção.',
    cost: '7500', currency: 'gold', durationMs: 0, instant: 'energy', instantAmountHours: 0.5, unlockLevel: 12,
  },
  {
    id: 'pet_food', name: 'Ração Mágica', icon: '🍖',
    desc: 'Dá XP ao primeiro pet equipado.',
    cost: '1500', currency: 'gold', durationMs: 0, instant: 'petxp', instantAmountHours: 0, unlockLevel: 7,
  },
  {
    id: 'box_ticket', name: 'Ticket de Caixa', icon: '🎫',
    desc: 'Concede uma Caixa Básica.',
    cost: '2000', currency: 'gold', durationMs: 0, instant: 'box', instantAmountHours: 0, unlockLevel: 9,
  },

  // ── Premium (custam Diamantes 💎 — moeda paga) ──────────
  {
    id: 'diamond_click', name: 'Elixir de Diamante', icon: '💎',
    desc: 'Triplica o poder de clique por 10 minutos.',
    cost: '400', currency: 'crystals', durationMs: 600000, buffId: 'click_x2', buffMult: 3, instant: 'box', unlockLevel: 15,
  },
  {
    id: 'diamond_prod', name: 'Reator Portátil', icon: '🟣',
    desc: 'Triplica a produção de energia por 15 minutos.',
    cost: '600', currency: 'crystals', durationMs: 900000, buffId: 'prod_x2', buffMult: 3, instant: 'box', unlockLevel: 20,
  },
  {
    id: 'diamond_gold', name: 'Manancial de Ouro', icon: '👑',
    desc: 'Triplica o ganho de moedas por 15 minutos.',
    cost: '600', currency: 'crystals', durationMs: 900000, buffId: 'gold_x2', buffMult: 3, instant: 'box', unlockLevel: 20,
  },
];

export const CONSUMABLE_MAP: Record<string, ConsumableDef> = Object.fromEntries(CONSUMABLE_DEFS.map((c) => [c.id, c]));
