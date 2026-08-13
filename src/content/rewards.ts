/**
 * Especificação de recompensa — formato data-driven compartilhado por
 * eventos, event pass, temporadas, códigos, compensações e atualizações.
 * A engine (GameEngine.grantRewards) sabe aplicar cada campo.
 */
export interface EventRewardSpec {
  gold?: string;
  energy?: string;
  /** Créditos 💳 — moeda principal (passe, avatares, caixas premium, eventos). */
  credits?: number;
  crystals?: number;
  fragments?: number;
  essence?: number;
  prestigeCoins?: number;
  ascensionCoins?: number;
  eventTokens?: number;
  xp?: string;
  skillPoints?: number;
  boxes?: { boxId: string; qty: number }[];
  skins?: string[];
  /** Pets concedidos diretamente (não por caixa). */
  pets?: string[];
  titles?: string[];
  /** Itens de perfil (avatar/molduras/efeitos/badges) concedidos. */
  avatarItems?: string[];
  consumables?: { id: string; qty: number }[];
  premiumPasses?: string[]; // ids de evento/temporada com passe premium liberado
  /** Bônus global permanente (flags) — ex.: { 'natal_perma': 1 } */
  flags?: Record<string, number>;
}
