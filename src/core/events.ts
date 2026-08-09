type Handler<T> = (payload: T) => void;

export type GameEventMap = {
  notify: { kind: string; title: string; desc?: string };
  floating: { amount: string; x: number; y: number; crit?: boolean; label?: string };
  particle: { x: number; y: number; color: string; count?: number };
  stateChange: { reason: string };
  achievement: { id: string; name: string };
  petFound: { id: string; name: string; rarity: string };
  levelUp: { level: number };
  prestige: { fragments: string };
  ascension: { coins: string };
  boxOpened: { boxId: string; results: { label: string; rarity: string }[] };
  questDone: { id: string; name: string };
  save: { slot: string };
};

const handlers = new Map<keyof GameEventMap, Set<Handler<any>>>();

export const bus = {
  on<K extends keyof GameEventMap>(event: K, fn: Handler<GameEventMap[K]>): () => void {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(fn);
    return () => handlers.get(event)?.delete(fn);
  },
  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]): void {
    handlers.get(event)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[bus:${event}]`, err);
      }
    });
  },
  clear(): void {
    handlers.clear();
  },
};
