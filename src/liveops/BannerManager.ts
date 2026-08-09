/**
 * BannerManager — seleciona e ordena banners por prioridade + janela de datas,
 * com rotação determinística para banners de mesma prioridade.
 */
import {
  BANNERS, BANNER_PRIORITY_ORDER,
  type BannerDef, type BannerPriority,
} from '../content/banners';
import { eventById, eventRemaining, eventStatus } from '../content/events';
import { activeSeason, seasonRemaining } from '../content/seasons';

export interface ActiveBanner {
  def: BannerDef;
  /** ms até o fim do banner (ou do conteúdo vinculado). */
  countdown: number;
  /** Texto de countdown calculado (ex.: evento). */
  countdownText: string;
  priorityIndex: number;
}

export class BannerManager {
  /** Banners ativos no instante, ordenados por prioridade (maior primeiro). */
  static active(nowMs: number = Date.now()): ActiveBanner[] {
    const active: ActiveBanner[] = [];
    for (const b of BANNERS) {
      if (b.startAt && nowMs < b.startAt) continue;
      if (b.endAt && nowMs > b.endAt) continue;
      let countdown = b.endAt ? Math.max(0, b.endAt - nowMs) : 0;
      let countdownText = '';
      if (b.payload) {
        const ev = eventById(b.payload);
        if (ev && !ev.always) {
          const st = eventStatus(ev, nowMs);
          if (st === 'upcoming') {
            countdown = ev.startAt ? Math.max(0, ev.startAt - nowMs) : 0;
            countdownText = `Começa em ${EventCountdownText(countdown)}`;
          } else if (st === 'live' || st === 'ending_soon') {
            countdown = eventRemaining(ev, nowMs);
            countdownText = `Termina em ${EventCountdownText(countdown)}`;
          }
        }
      }
      if (b.destination === 'season' && b.payload === undefined) {
        const s = activeSeason(nowMs);
        if (s) countdownText = `Temporada termina em ${EventCountdownText(seasonRemaining(s, nowMs))}`;
      }
      active.push({
        def: b,
        countdown,
        countdownText,
        priorityIndex: BANNER_PRIORITY_ORDER.indexOf(b.priority),
      });
    }
    // prioridade primeiro (menor índice = mais importante), depois início mais recente
    active.sort((a, b) => a.priorityIndex - b.priorityIndex || (b.def.startAt ?? 0) - (a.def.startAt ?? 0));
    return active;
  }

  /** Banners do carrossel (top N por prioridade). */
  static carousel(nowMs: number = Date.now(), limit = 4): ActiveBanner[] {
    return BannerManager.active(nowMs).slice(0, limit);
  }

  /** Banner principal (prioridade mais alta). */
  static primary(nowMs: number = Date.now()): ActiveBanner | undefined {
    return BannerManager.active(nowMs)[0];
  }

  static priorityLabel(p: BannerPriority): string {
    switch (p) {
      case 'emergency': return '🔴 EMERGÊNCIA';
      case 'update': return '🚀 ATUALIZAÇÃO';
      case 'event': return '🎊 EVENTO';
      case 'season': return '🌟 TEMPORADA';
      case 'offer': return '🎁 OFERTA';
      case 'news': return '📰 NOTÍCIA';
    }
  }

}

function EventCountdownText(ms: number): string {
  if (ms <= 0) return 'agora';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}
