export type ResourceId =
  | 'energy'
  | 'gold'
  | 'crystals'
  | 'fragments'
  | 'essence'
  | 'prestigeCoins'
  | 'ascensionCoins'
  | 'eventTokens'
  | 'fichas'
  | 'credits';

export interface ResourceDef {
  id: ResourceId;
  name: string;
  icon: string;
  source: string;
  use: string;
  cap: string | null; // null = ilimitado
  color: string;
}

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  energy: { id: 'energy', name: 'Energia', icon: '⚡', source: 'Cliques, geradores e automação', use: 'Recurso principal do Núcleo', cap: null, color: '#37f5ff' },
  gold: { id: 'gold', name: 'Moedas', icon: '🪙', source: 'Ganhas no jogo (cliques, geradores, missões e caixas)', use: 'Compra de upgrades, geradores e equipamentos', cap: null, color: '#ffd94d' },
  crystals: { id: 'crystals', name: 'Diamantes', icon: '💎', source: 'Compra com dinheiro real na loja (moeda paga)', use: 'Caixas e itens premium (moeda paga)', cap: null, color: '#b06cff' },
  fragments: { id: 'fragments', name: 'Fragmentos', icon: '🧩', source: 'Prestígio (reset estratégico)', use: 'Bônus permanentes de prestígio', cap: null, color: '#ff8a3d' },
  essence: { id: 'essence', name: 'Essência', icon: '✨', source: 'Transcendência', use: 'Árvore transcendente', cap: null, color: '#ff6bff' },
  prestigeCoins: { id: 'prestigeCoins', name: 'Moedas de Prestígio', icon: '🪙', source: 'Prestígios e missões', use: 'Loja de Prestígio', cap: null, color: '#ffe14d' },
  ascensionCoins: { id: 'ascensionCoins', name: 'Moedas de Ascensão', icon: '👑', source: 'Ascensão', use: 'Loja de Ascensão e mundos', cap: null, color: '#ff4d6d' },
  eventTokens: { id: 'eventTokens', name: 'Tokens de Evento', icon: '🎟️', source: 'Eventos e cliques durante eventos', use: 'Loja de Eventos e caixa especial', cap: null, color: '#3ddc84' },
  fichas: { id: 'fichas', name: 'Fichas', icon: '🎰', source: 'Compradas com dinheiro real via Pix', use: 'Convertidas em créditos (1 ficha = 1 crédito)', cap: null, color: '#ff9df5' },
  credits: { id: 'credits', name: 'Créditos', icon: '💳', source: 'Conversão de fichas (1 crédito = R$ 0,05)', use: 'Convertidos em diamantes (1 crédito = 1 diamante)', cap: null, color: '#5dff8a' },
};

export const RESOURCE_LIST = Object.values(RESOURCES);
