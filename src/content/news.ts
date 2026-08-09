/**
 * Notícias — conteúdo data-driven.
 * Tipos: update | event | announcement | community | hotfix | maintenance.
 */
export type NewsType = 'update' | 'event' | 'announcement' | 'community' | 'hotfix' | 'maintenance';

export interface NewsItem {
  id: string;
  type: NewsType;
  title: string;
  summary: string;
  content: string;
  date: string; // 'YYYY-MM-DD'
  version?: string;
  icon: string;
  gradient: string;
}

export const NEWS_TYPE_META: Record<NewsType, { name: string; icon: string; color: string }> = {
  update: { name: 'Update', icon: '🚀', color: '#37f5ff' },
  event: { name: 'Evento', icon: '🎊', color: '#3ddc84' },
  announcement: { name: 'Anúncio', icon: '📢', color: '#ffd94d' },
  community: { name: 'Comunidade', icon: '💬', color: '#b06cff' },
  hotfix: { name: 'Hotfix', icon: '🩹', color: '#ff8a3d' },
  maintenance: { name: 'Manutenção', icon: '🔧', color: '#ff4d6d' },
};

export let NEWS: NewsItem[] = [
  {
    id: 'n_update20',
    type: 'update',
    title: 'Update 2.0: CLICKMASTER LiveOps',
    summary: 'Skins, eventos, temporadas, banners e patch notes chegaram.',
    content: 'A 2.0 transforma o jogo em plataforma de conteúdo contínuo. Explore o novo Armário, participe do Cyber Overdrive e suba no passe da Temporada 4.',
    date: '2026-08-07',
    version: '2.0.0',
    icon: '🚀',
    gradient: 'linear-gradient(120deg, rgba(55,245,255,0.25), rgba(77,166,255,0.1))',
  },
  {
    id: 'n_skins',
    type: 'announcement',
    title: '28 skins em 9 categorias',
    summary: 'Núcleo, fundo, cursor, números, efeitos, pets, perfil, banner e interface.',
    content: 'As skins agora são cosméticas por padrão, com raridades próprias. Skins de evento ficam indisponíveis após o término — corra para coletá-las.',
    date: '2026-08-07',
    version: '2.0.0',
    icon: '🎨',
    gradient: 'linear-gradient(120deg, rgba(255,107,255,0.22), rgba(176,108,255,0.1))',
  },
  {
    id: 'n_cyber',
    type: 'event',
    title: 'Cyber Overdrive está no ar',
    summary: '2x energia, Fragmentos Cyber e a skin Núcleo Cyber.',
    content: 'Durante o evento, cada clique gera XP de evento e Fragmentos Cyber. Complete o passe (10 níveis) para garantir a skin exclusiva.',
    date: '2026-08-05',
    version: '2.0.0',
    icon: '🤖',
    gradient: 'linear-gradient(120deg, rgba(61,220,132,0.25), rgba(4,18,12,0.6))',
  },
  {
    id: 'n_season4',
    type: 'announcement',
    title: 'Temporada 4: Cyber Genesis',
    summary: 'Novo passe de temporada com skins e título exclusivo.',
    content: 'A Temporada 4 vai até 15 de setembro. Ganhe XP de temporada clicando e complete os 10 níveis do passe.',
    date: '2026-08-01',
    version: '2.0.0',
    icon: '🌟',
    gradient: 'linear-gradient(120deg, rgba(176,108,255,0.25), rgba(55,245,255,0.08))',
  },
  {
    id: 'n_codes',
    type: 'community',
    title: 'Códigos de lançamento',
    summary: 'WELCOME2 · CYBER2026 · UPDATE210',
    content: 'Resgate os códigos na tela de Atualizações → Códigos. Cada código pode ser usado uma vez.',
    date: '2026-08-07',
    version: '2.0.0',
    icon: '🎟️',
    gradient: 'linear-gradient(120deg, rgba(255,217,77,0.22), rgba(255,138,61,0.08))',
  },
];

/** Hidrata as notícias com dados do servidor (GET /api/content). */
export function hydrateNews(items: NewsItem[]): void {
  NEWS = Array.isArray(items)
    ? items.filter((n) => n && typeof n.id === 'string' && typeof n.title === 'string')
    : NEWS;
}
