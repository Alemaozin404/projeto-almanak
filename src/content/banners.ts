/**
 * Banners — conteúdo data-driven.
 * O BannerManager seleciona por prioridade + janela de datas + rotação.
 */
export type BannerPriority = 'emergency' | 'update' | 'event' | 'season' | 'offer' | 'news';
export type BannerDestination =
  | 'events' | 'updates' | 'season' | 'news' | 'shop' | 'boxes'
  | 'skins' | 'codes' | 'profile' | 'modal';

export interface BannerDef {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  /** Gradiente do banner (CSS). */
  gradient: string;
  glow: string;
  priority: BannerPriority;
  startAt?: number;
  endAt?: number;
  destination: BannerDestination;
  /** Payload opcional (ex.: id de evento/notícia para o modal). */
  payload?: string;
  cta: string;
  tags: string[];
}

/** Converte 'YYYY-MM-DD HH:mm' em timestamp UTC (determinístico em qualquer máquina/fuso —
 *  o server/content.json exportado precisa ser byte-idêntico no CI, no dev e no Vercel). */
function at(dateStr: string): number {
  const [date, time = '00:00'] = dateStr.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mi] = time.split(':').map(Number);
  return Date.UTC(y, m - 1, d, hh || 0, mi || 0);
}

export const BANNER_PRIORITY_ORDER: BannerPriority[] = ['emergency', 'update', 'event', 'season', 'offer', 'news'];

export let BANNERS: BannerDef[] = [
  {
    id: 'update_20',
    title: 'UPDATE 2.0',
    subtitle: 'Skins, eventos, temporadas e LiveOps — um novo jogo.',
    icon: '🚀',
    gradient: 'linear-gradient(120deg, rgba(55,245,255,0.28), rgba(77,166,255,0.12))',
    glow: 'rgba(55,245,255,0.5)',
    priority: 'update',
    startAt: at('2026-08-07 00:00'),
    endAt: at('2026-08-21 23:59'),
    destination: 'updates',
    cta: 'VER UPDATE',
    tags: ['update', 'novo'],
  },
  {
    id: 'evt_cyber',
    title: '⚡ CYBER OVERDRIVE ⚡',
    subtitle: '2x produção de energia durante o evento. Skins exclusivas!',
    icon: '🤖',
    gradient: 'linear-gradient(120deg, rgba(61,220,132,0.3), rgba(4,18,12,0.6))',
    glow: 'rgba(61,220,132,0.6)',
    priority: 'event',
    startAt: at('2026-08-05 12:00'),
    endAt: at('2026-08-12 23:59'),
    destination: 'events',
    payload: 'cyber',
    cta: 'PARTICIPAR',
    tags: ['evento', 'live'],
  },
  {
    id: 'season4',
    title: '🌟 TEMPORADA 4 — CYBER GENESIS',
    subtitle: 'Novo passe, novas skins, novo mundo. Faltam semanas!',
    icon: '🌐',
    gradient: 'linear-gradient(120deg, rgba(176,108,255,0.3), rgba(55,245,255,0.1))',
    glow: 'rgba(176,108,255,0.5)',
    priority: 'season',
    startAt: at('2026-08-01 00:00'),
    endAt: at('2026-09-15 23:59'),
    destination: 'season',
    cta: 'VER TEMPORADA',
    tags: ['temporada', 'live'],
  },
  {
    id: 'evt_lunar',
    title: '🌙 FESTIVAL LUNAR',
    subtitle: 'Em breve: sorte +30% e o Núcleo Lunar celestial.',
    icon: '🌙',
    gradient: 'linear-gradient(120deg, rgba(232,232,255,0.22), rgba(107,107,255,0.12))',
    glow: 'rgba(232,232,255,0.5)',
    priority: 'news',
    startAt: at('2026-08-14 00:00'),
    endAt: at('2026-08-20 12:00'),
    destination: 'events',
    payload: 'lunar',
    cta: 'VER EVENTO',
    tags: ['evento', 'futuro'],
  },
  {
    id: 'news_skins',
    title: '🎨 NOVAS SKINS',
    subtitle: '28 skins em 9 categorias — Núcleo, fundo, cursor, números e mais.',
    icon: '🎨',
    gradient: 'linear-gradient(120deg, rgba(255,107,255,0.25), rgba(176,108,255,0.1))',
    glow: 'rgba(255,107,255,0.5)',
    priority: 'news',
    startAt: at('2026-08-07 00:00'),
    endAt: at('2026-09-01 23:59'),
    destination: 'skins',
    cta: 'ABRIR ARMÁRIO',
    tags: ['novidade', 'skins'],
  },
  {
    id: 'codes_welcome',
    title: '🎁 CÓDIGOS ATIVOS',
    subtitle: 'WELCOME2 · CYBER2026 · UPDATE210 — resgate em Atualizações.',
    icon: '🎟️',
    gradient: 'linear-gradient(120deg, rgba(255,217,77,0.25), rgba(255,138,61,0.1))',
    glow: 'rgba(255,217,77,0.5)',
    priority: 'offer',
    startAt: at('2026-08-07 00:00'),
    endAt: at('2026-09-30 23:59'),
    destination: 'codes',
    cta: 'RESGATAR',
    tags: ['oferta', 'código'],
  },
  {
    id: 'news_compensation',
    title: '🎁 COMPENSAÇÃO DISPONÍVEL',
    subtitle: 'Uma recompensa aguarda você pelos ajustes da 2.0.',
    icon: '📦',
    gradient: 'linear-gradient(120deg, rgba(61,220,132,0.2), rgba(55,245,255,0.08))',
    glow: 'rgba(61,220,132,0.5)',
    priority: 'offer',
    startAt: at('2026-08-07 00:00'),
    endAt: at('2026-08-14 23:59'),
    destination: 'updates',
    payload: 'compensation',
    cta: 'RESGATAR',
    tags: ['oferta'],
  },
];

/** Hidrata os banners com dados do servidor (GET /api/content). */
export function hydrateBanners(items: BannerDef[]): void {
  BANNERS = Array.isArray(items)
    ? items.filter((b) => b && typeof b.id === 'string' && typeof b.title === 'string')
    : BANNERS;
}
