/**
 * Compatibilidade: o sistema de eventos agora vive em src/content/events.
 * Este módulo re-exporta para não quebrar imports existentes (tests/debug).
 */
export {
  EVENTS, EVENTS_ALL, DEMO_EVENT, activeEvents, eventById, eventsBonus,
  eventStatus, eventRemaining, eventUntilStart, upcomingEvents, pastEvents,
  activeEventsBonus, debugEventOverrides,
} from '../content/events';
export type {
  EventDef, EventStatus, EventTheme, EventShopItem, EventPassLevel, EventChapter,
} from '../content/events';
