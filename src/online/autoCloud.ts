/**
 * autoCloud — sincronização automática do save com a nuvem (online por padrão).
 *
 * - `autoPushSave`: envia o save atual para a nuvem após cada save local
 *   (auto-save, sair do jogo, menu) — sem botão manual.
 * - `autoSyncOnLoad`: no boot, compara o save local com o da nuvem:
 *     * nuvem mais nova → restaura automaticamente (com backup local antes);
 *     * sem save na nuvem → envia o local (primeiro backup);
 *     * local mais novo → envia o local (nuvem nunca é sobrescrita com dados
 *       mais velhos).
 *
 * Tudo é silencioso e seguro: falhas de rede nunca bloqueiam o jogo, e o save
 * da nuvem passa pela MESMA validação de um save local (importText).
 */
import { cloudPlayerId, pushCloudSave, pullCloudSave } from './cloudSave';
import { onlineEnabled } from './api';
import { setCloudStatus } from './status';
import type { SaveManager } from '../save/saveManager';
import type { GameEngine } from '../game/engine';
import type { GameState } from '../game/types';

/** Intervalo mínimo entre pushes automáticos (evita spam na API). */
const PUSH_THROTTLE_MS = 60 * 1000;
/**
 * Margem mínima para considerar a nuvem "mais nova". O push acontece logo
 * depois do save local, então o savedAt da nuvem é naturalmente alguns ms
 * maior que o do arquivo — sem esta margem, o app "restauraria" (e recarregaria)
 * em todo boot, mesmo sem diferença real de conteúdo.
 */
const RESTORE_MIN_NEWER_MS = 60 * 1000;
let lastPushAt = 0;

/** Zera o estado interno (usado em testes — isolamento entre execuções). */
export function resetAutoCloudState(): void {
  lastPushAt = 0;
}

/** Sincronização automática está habilitada nas configurações? (padrão: sim). */
export function cloudSyncEnabled(engineOrState: GameEngine | GameState): boolean {
  const engine = engineOrState as GameEngine;
  const state = engine.state ?? (engineOrState as GameState);
  return state.settings.cloudSyncEnabled !== false;
}

/**
 * Envia o save atual para a nuvem. Silencioso — nunca lança.
 * `force` ignora o throttle (usado ao fechar o jogo / sair).
 */
export async function autoPushSave(engine: GameEngine, saveMgr: SaveManager, force = false): Promise<{ ok: boolean; reason?: string }> {
  if (!onlineEnabled()) return { ok: false, reason: 'Backend não configurado' };
  if (!cloudSyncEnabled(engine)) return { ok: false, reason: 'Sincronização automática desativada' };
  const playerId = cloudPlayerId(engine.state);
  if (!playerId) return { ok: false, reason: 'Save sem identificador' };
  const now = Date.now();
  if (!force && now - lastPushAt < PUSH_THROTTLE_MS) return { ok: true, reason: 'throttled' };
  lastPushAt = now;
  const text = saveMgr.exportText(engine);
  const r = await pushCloudSave(playerId, text, engine.state.name || 'Jogador');
  setCloudStatus(r.ok ? 'online' : 'offline');
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}

export type CloudSyncOnLoadResult =
  | 'offline'
  | 'disabled'
  | 'pushed'
  | 'restored'
  | 'noop';

/**
 * Sincroniza no boot: restaura a nuvem se mais nova, senão empurra o local.
 * Retorna o que foi feito (para a UI avisar quando algo foi restaurado).
 */
export async function autoSyncOnLoad(saveMgr: SaveManager, engine: GameEngine): Promise<CloudSyncOnLoadResult> {
  if (!onlineEnabled()) return 'offline';
  if (!cloudSyncEnabled(engine)) return 'disabled';
  const playerId = cloudPlayerId(engine.state);
  if (!playerId) return 'noop';

  // timestamp do save local (para comparar com a nuvem)
  const metas = await saveMgr.listSlots();
  const local = metas.find((m) => m.slot === saveMgr.getSlot());
  const localAt = local?.savedAt ?? 0;

  const cloud = await pullCloudSave(playerId);
  if (!cloud.ok || !cloud.info) {
    // sem save na nuvem (404) → sobe o local como primeiro backup
    setCloudStatus('online');
    const r = await autoPushSave(engine, saveMgr, true);
    return r.ok ? 'pushed' : 'offline';
  }
  setCloudStatus('online');

  if (cloud.info.savedAt > localAt + RESTORE_MIN_NEWER_MS) {
    // nuvem significativamente mais nova → backup local + restaura (o App recarrega depois)
    await saveMgr.createBackup(engine);
    const imp = await saveMgr.importText(saveMgr.getSlot(), cloud.info.saveText);
    return imp.ok ? 'restored' : 'noop';
  }
  if (localAt > cloud.info.savedAt + RESTORE_MIN_NEWER_MS) {
    // local significativamente mais novo → sobe o local (nuvem nunca recebe dados mais velhos)
    const r = await autoPushSave(engine, saveMgr, true);
    return r.ok ? 'pushed' : 'offline';
  }
  // timestamps equivalentes (mesma sessão) → nada a fazer; o auto-save continua sincronizando
  return 'noop';
}
