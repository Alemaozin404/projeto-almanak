/**
 * Personalização de perfil — data-driven.
 * Avatar (ícone), moldura, efeito e badge. Itens marcados como premium
 * só aparecem no catálogo após o passe premium ser adquirido.
 */
export interface AvatarItem {
  id: string;
  label: string;
  value: string; // emoji ou classe CSS
  premium?: boolean;
  /** Preço em CRÉDITOS 💳 quando comprável individualmente (item pago, sem passe). */
  creditCost?: number;
  /** Condição de progresso (opcional). */
  unlock?: (p: { prestige: number; ascension: number; levels: number; pets: number }) => boolean;
}

export interface AvatarCatalog {
  icons: AvatarItem[];
  frames: AvatarItem[];
  effects: AvatarItem[];
  badges: AvatarItem[];
}

const none = (): boolean => true;

export const AVATAR_CATALOG: AvatarCatalog = {
  icons: [
    { id: 'av_default', label: 'Núcleo', value: '⚡', unlock: none },
    { id: 'av_hero', label: 'Herói', value: '🦸', unlock: (p) => p.levels >= 10 },
    { id: 'av_robot', label: 'Robô', value: '🤖', unlock: (p) => p.levels >= 25 },
    { id: 'av_dragon', label: 'Dragão', value: '🐉', unlock: (p) => p.pets >= 5 },
    { id: 'av_phoenix', label: 'Fênix', value: '🦅', unlock: (p) => p.pets >= 15 },
    { id: 'av_king', label: 'Rei', value: '🤴', unlock: (p) => p.prestige >= 3 },
    { id: 'av_angel', label: 'Anjo', value: '😇', unlock: (p) => p.ascension >= 1 },
    { id: 'av_god', label: 'Divindade', value: '👑', unlock: (p) => p.ascension >= 2 },
    { id: 'av_cyber', label: 'Netrunner', value: '🧑‍💻', premium: true, creditCost: 150 },
    { id: 'av_star', label: 'Estelar', value: '🌟', premium: true, creditCost: 250 },
  ],
  frames: [
    { id: 'fr_none', label: 'Nenhuma', value: '', unlock: none },
    { id: 'fr_gold', label: 'Dourada', value: 'fr-gold', unlock: (p) => p.levels >= 20 },
    { id: 'fr_neon', label: 'Neon', value: 'fr-neon', unlock: (p) => p.prestige >= 1 },
    { id: 'fr_royal', label: 'Real', value: 'fr-royal', unlock: (p) => p.prestige >= 5 },
    { id: 'fr_celestial', label: 'Celestial', value: 'fr-celestial', unlock: (p) => p.ascension >= 1 },
    { id: 'fr_premium', label: 'Premium', value: 'fr-premium', premium: true, creditCost: 120 },
  ],
  effects: [
    { id: 'fx_none', label: 'Nenhum', value: '', unlock: none },
    { id: 'fx_pulse', label: 'Pulso', value: 'avfx-pulse', unlock: (p) => p.levels >= 15 },
    { id: 'fx_glow', label: 'Brilho', value: 'avfx-glow', unlock: (p) => p.prestige >= 2 },
    { id: 'fx_spin', label: 'Giro', value: 'avfx-spin', unlock: (p) => p.pets >= 10 },
    { id: 'fx_rainbow', label: 'Arco-íris', value: 'avfx-rainbow', unlock: (p) => p.ascension >= 1 },
    { id: 'fx_premium', label: 'Aura Premium', value: 'avfx-premium', premium: true, creditCost: 200 },
  ],
  badges: [
    { id: 'bd_none', label: 'Nenhum', value: '', unlock: none },
    { id: 'bd_clicker', label: 'Clicador', value: '🖱️', unlock: (p) => p.levels >= 5 },
    { id: 'bd_veteran', label: 'Veterano', value: '⭐', unlock: (p) => p.prestige >= 1 },
    { id: 'bd_master', label: 'Mestre', value: '🏅', unlock: (p) => p.prestige >= 5 },
    { id: 'bd_legend', label: 'Lenda', value: '🌟', unlock: (p) => p.ascension >= 1 },
    { id: 'bd_premium', label: 'Premium', value: '💎', premium: true, creditCost: 100 },
  ],
};

export function avatarItemUnlocked(cat: AvatarItem[], id: string, prog: { prestige: number; ascension: number; levels: number; pets: number }): boolean {
  const item = cat.find((i) => i.id === id);
  if (!item) return false;
  if (item.premium) return false; // premium liberado apenas com passe (verificado na engine)
  return item.unlock ? item.unlock(prog) : false;
}
