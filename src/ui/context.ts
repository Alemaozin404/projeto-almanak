import { createContext, useContext } from 'react';
import { GameEngine } from '../game/engine';
import type { Num } from '../core/bignum';

export interface GameContextValue {
  engine: GameEngine;
  fmt: (v: Num, digits?: number) => string;
  fmtFull: (v: Num) => string;
}

export const GameContext = createContext<GameContextValue | null>(null);

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame fora do GameContext');
  return ctx;
}
