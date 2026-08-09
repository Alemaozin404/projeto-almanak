/**
 * EventManager — controla o ciclo de vida dos eventos.
 * Responsável por: verificar datas, ativar/encerrar, status (upcoming/live/ending_soon/
 * ended/archived), contagens regressivas, moeda do evento, passe e recompensas diárias.
 */
import {
  EVENTS_ALL, eventById, eventStatus, eventRemaining, eventUntilStart,
  activeEvents, type EventDef, type EventStatus,
} from '../content/events';
import type { GameState } from '../game/types';

export class EventManager {
  static all(): EventDef[] {
    return EVENTS_ALL;
  }

  static byId(id: string): EventDef | undefined {
    return eventById(id);
  }

  static active(nowMs: number = Date.now()): EventDef[] {
    return activeEvents(new Date(nowMs), true);
  }

  static status(def: EventDef, nowMs: number = Date.now()): EventStatus {
    return eventStatus(def, nowMs);
  }

  static remaining(def: EventDef, nowMs: number = Date.now()): number {
    return eventRemaining(def, nowMs);
  }

  static untilStart(def: EventDef, nowMs: number = Date.now()): number {
    return eventUntilStart(def, nowMs);
  }

  /** Moeda do evento no estado do jogador (Decimal string). */
  static currencyOf(state: GameState, eventId: string): string {
    const st = state.events[eventId];
    return st ? st.tokens : '0';
  }

  /** Nível atual do passe do evento (0..max). */
  static passLevel(state: GameState, eventId: string): number {
    const track = state.passTracks?.[`ev_${eventId}`];
    const def = eventById(eventId);
    if (!track || !def?.pass) return 0;
    const xp = track.xp;
    let level = 0;
    for (const l of def.pass.levels) {
      if (parseFloat(xp) >= parseFloat(l.xp)) level = l.level;
      else break;
    }
    return level;
  }

  static passMaxLevel(eventId: string): number {
    const def = eventById(eventId);
    return def?.pass ? def.pass.levels.length : 0;
  }

  /** Contagem de recompensas diárias coletadas. */
  static dailyClaimed(state: GameState, eventId: string): number {
    const st = state.events[eventId];
    return st ? (st.dailyClaimed?.length ?? 0) : 0;
  }

  /** Formata ms em '3d 14h 28m' (countdown). */
  static formatRemaining(ms: number): string {
    if (ms <= 0) return '0s';
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

}
