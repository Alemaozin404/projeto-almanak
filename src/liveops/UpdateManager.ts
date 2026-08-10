/**
 * UpdateManager — controla versionamento (MAJOR.MINOR.PATCH), o popup
 * "nova atualização" (uma vez por versão), o changelog, a recompensa de
 * atualização e janelas de manutenção.
 *
 * As janelas de manutenção agora são conteúdo ONLINE (server/content.json →
 * GET /api/meta): basta editar, rodar `npm run content:export` e commitar —
 * todos os jogadores veem a tela de manutenção sem atualizar o app.
 */
import { GAME_VERSION, UPDATES, latestUpdate, type PatchNote } from '../content/updates';
import { MAINTENANCE_WINDOWS } from '../content/maintenance';
import type { GameState } from '../game/types';
import type { GameEngine } from '../game/engine';

export type { MaintenanceWindow } from '../content/maintenance';

/** Janela de manutenção simulada pelo modo Debug. */
let debugMaintenance: import('../content/maintenance').MaintenanceWindow | null = null;

export class UpdateManager {
  static readonly version: string = GAME_VERSION;

  static latest(): PatchNote {
    return latestUpdate();
  }

  static changelog(): PatchNote[] {
    return UPDATES;
  }

  /** Mostrar popup se o jogador ainda não viu a versão atual. */
  static shouldShowPopup(state: GameState): boolean {
    return state.lastSeenVersion !== GAME_VERSION;
  }

  static markSeen(state: GameState): void {
    state.lastSeenVersion = GAME_VERSION;
  }

  /** Recompensa de atualização pendente (uma vez por versão). */
  static pendingUpdateReward(state: GameState): PatchNote | undefined {
    const latest = latestUpdate();
    if (!latest.reward) return undefined;
    if ((state.flags.updateRewardsGranted ?? 0) >= 1) return undefined;
    // concede apenas quando o jogador já viu esta versão (evita popup duplo)
    if (state.lastSeenVersion !== GAME_VERSION) return undefined;
    return latest;
  }

  /** Compara versões semver: retorna >0 se a > b. */
  static compare(a: string, b: string): number {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const x = pa[i] ?? 0;
      const y = pb[i] ?? 0;
      if (x !== y) return x - y;
    }
    return 0;
  }

  /** Janela de manutenção ativa no instante (se houver). */
  static maintenanceActive(nowMs: number = Date.now()): import('../content/maintenance').MaintenanceWindow | undefined {
    if (debugMaintenance && nowMs >= debugMaintenance.startAt && nowMs <= debugMaintenance.endAt) return debugMaintenance;
    return MAINTENANCE_WINDOWS.find((m) => m.startAt <= nowMs && nowMs <= m.endAt);
  }

  /** Próxima janela de manutenção programada (futura, ainda não iniciada) — ou undefined. */
  static nextMaintenance(nowMs: number = Date.now()): import('../content/maintenance').MaintenanceWindow | undefined {
    return MAINTENANCE_WINDOWS
      .filter((m) => m.startAt > nowMs)
      .sort((a, b) => a.startAt - b.startAt)[0];
  }

  static setDebugMaintenance(window: import('../content/maintenance').MaintenanceWindow | null): void {
    debugMaintenance = window;
  }

  /** Simula uma janela de manutenção (debug). */
  static simulateMaintenance(durationMs = 5 * 60 * 1000, nowMs: number = Date.now()): import('../content/maintenance').MaintenanceWindow {
    return {
      id: 'debug_maint',
      reason: 'Manutenção simulada pelo modo Debug.',
      eta: `${Math.round(durationMs / 60000)} minutos`,
      startAt: nowMs - 1000,
      endAt: nowMs + durationMs,
    };
  }

  /** Migração de save + gravação imediata antes de atualizações (backup automático). */
  static async preUpdateBackup(engine: GameEngine, save: { save(engine: GameEngine): Promise<boolean>; createBackup(engine: GameEngine): Promise<string | null> }): Promise<void> {
    await save.save(engine);
    await save.createBackup(engine);
  }
}
