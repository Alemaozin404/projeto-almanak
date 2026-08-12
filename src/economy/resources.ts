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
  energy: { id: 'energy', name: 'Energia', icon: '⚡', source: 'Cliques, geradores e automação', use: 'Recurso ESCASSO — compra upgrades de clique no jogo', cap: null, color: '#37f5ff' },
  gold: { id: 'gold', name: 'Moedas', icon: '🪙', source: 'Ganhas no jogo (cliques, geradores, missões e caixas)', use: 'Moeda de troca grátis — itens comuns, melhorias e geradores', cap: null, color: '#ffd94d' },
  crystals: { id: 'crystals', name: 'Diamantes', icon: '💎', source: 'Exclusivamente via Pix ou conversão de créditos', use: 'Itens de loja premium, XP do passe e itens de evento', cap: null, color: '#b06cff' },
  fragments: { id: 'fragments', name: 'Fragmentos', icon: '🧩', source: 'Prestígio (reset estratégico)', use: 'Bônus permanentes de prestígio', cap: null, color: '#ff8a3d' },
  essence: { id: 'essence', name: 'Essência', icon: '✨', source: 'Transcendência', use: 'Árvore transcendente', cap: null, color: '#ff6bff' },
  prestigeCoins: { id: 'prestigeCoins', name: 'Moedas de Prestígio', icon: '🪙', source: 'Prestígios e missões', use: 'Loja de Prestígio', cap: null, color: '#ffe14d' },
  ascensionCoins: { id: 'ascensionCoins', name: 'Moedas de Ascensão', icon: '👑', source: 'Ascensão', use: 'Loja de Ascensão e mundos', cap: null, color: '#ff4d6d' },
  eventTokens: { id: 'eventTokens', name: 'Tokens de Evento', icon: '🎟️', source: 'Eventos e cliques durante eventos', use: 'Loja de Eventos e caixa especial', cap: null, color: '#3ddc84' },
  fichas: { id: 'fichas', name: 'Fichas', icon: '🎰', source: 'Compradas com dinheiro real via Pix', use: 'Moeda exclusiva de eventos premium (sem usar moedas grátis)', cap: null, color: '#ff9df5' },
  credits: { id: 'credits', name: 'Créditos', icon: '💳', source: 'Pacotes via Pix (1 crédito = R$ 0,05)', use: 'Moeda universal: passe, avatares pagos, entrada em eventos e conversão em diamantes', cap: null, color: '#5dff8a' },
};

export const RESOURCE_LIST = Object.values(RESOURCES);
