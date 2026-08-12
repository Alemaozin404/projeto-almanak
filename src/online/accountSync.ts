/**
 * accountSync — save automático da conta no servidor.
 *
 * Quando o jogador está conectado a uma conta, o save é enviado ao servidor
 * a cada 1 hora (intervalo em GameConfig.account.autoSaveHours), garantindo
 * backup periódico dos dados do sistema no servidor sem ação manual.
 *
 * Regras:
 * - Só envia com conta conectada, backend configurado e a sincronização
 *   automática ativa (settings.cloudSyncEnabled — mesmo interruptor da nuvem).
 * - Silencioso: falhas de rede nunca bloqueiam o jogo.
 * - O push manual (botão na tela de Conta) usa a mesma função com force.
 */
import { getSession, pushAccountSave, pullAccountSave, getAccountSlotPref } from './account';
import { onlineEnabled } from './api';
import { RESTORE_MIN_NEWER_MS } from './autoCloud';
import { GameConfig } from '../config/GameConfig';
import type { SaveManager, SaveSlot } from '../save/saveManager';
import type { GameEngine } from '../game/engine';

let timer: ReturnType<typeof setInterval> | null = null;
let nextSyncAt = 0;
let lastAutoPushAt = 0;

/** Intervalo entre envios automáticos (1 hora — configurável em GameConfig). */
export const ACCOUNT_SAVE_INTERVAL_MS = Math.max(1, Number(GameConfig.account.autoSaveHours) || 1) * 60 * 60 * 1000;

/** Intervalo mínimo entre pushes automáticos da conta (evita spam na API). */
const AUTO_PUSH_THROTTLE_MS = 60 * 1000;

// ── estado de sincronização (para a TopBar: enviando / sincronizado / erro) ──

export interface AccountSyncSnapshot {
  /** Há um envio do save da conta em andamento (rede). */
  syncing: boolean;
  /** Última sincronização bem-sucedida (timestamp; 0 = nunca). */
  lastSyncAt: number;
  /** Último erro de sincronização (null = sem erro recente). */
  lastError: string | null;
}

const syncListeners = new Set<() => void>();
let syncSnapshot: AccountSyncSnapshot = { syncing: false, lastSyncAt: 0, lastError: null };
/** Envios em andamento — suporta pushes concorrentes (timer + manual + auto-save). */
let inFlightSyncs = 0;

function notifySyncChanged(): void {
  syncListeners.forEach((fn) => fn());
}

/** Assina mudanças no estado de sincronização do save da conta (TopBar). */
export function subscribeAccountSync(fn: () => void): () => void {
  syncListeners.add(fn);
  return () => {
    syncListeners.delete(fn);
  };
}

/** Snapshot com referência ESTÁVEL (para useSyncExternalStore). */
export function getAccountSyncSnapshot(): AccountSyncSnapshot {
  return syncSnapshot;
}

/** Conta envios em andamento; notifica só quando cruza 0 ↔ 1 (evita re-render em excesso). */
function setSyncing(active: boolean): void {
  inFlightSyncs = Math.max(0, inFlightSyncs + (active ? 1 : -1));
  const next = inFlightSyncs > 0;
  if (next !== syncSnapshot.syncing) {
    syncSnapshot = { ...syncSnapshot, syncing: next };
    notifySyncChanged();
  }
}

/** Última sincronização bem-sucedida com a conta (timestamp). */
export function lastAccountSyncAt(): number {
  return syncSnapshot.lastSyncAt;
}

/** Próximo envio automático agendado (timestamp; 0 = sem timer ativo). */
export function getNextAccountSyncAt(): number {
  return nextSyncAt;
}

/** Zera o estado interno (testes — isolamento entre execuções). */
export function resetAccountSyncState(): void {
  stopAccountAutoSave();
  inFlightSyncs = 0;
  syncSnapshot = { syncing: false, lastSyncAt: 0, lastError: null };
  syncListeners.clear();
  nextSyncAt = 0;
  lastAutoPushAt = 0;
}

/** Liga o auto-save horário da conta (chamado ao anexar o jogo). */
export function startAccountAutoSave(engine: GameEngine, saveMgr: SaveManager): void {
  stopAccountAutoSave();
  nextSyncAt = Date.now() + ACCOUNT_SAVE_INTERVAL_MS;
  timer = setInterval(() => {
    // agenda o PRÓXIMO envio (o countdown da TopBar lê este valor)
    nextSyncAt = Date.now() + ACCOUNT_SAVE_INTERVAL_MS;
    void pushAccountSaveNow(engine, saveMgr);
  }, ACCOUNT_SAVE_INTERVAL_MS);
}

/** Desliga o auto-save horário (chamado ao desanexar o jogo). */
export function stopAccountAutoSave(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  nextSyncAt = 0;
}

/** Envia o save atual para a conta agora. Retorna ok/reason (sem lançar). */
export async function pushAccountSaveNow(
  engine: GameEngine,
  saveMgr: SaveManager,
): Promise<{ ok: boolean; reason?: string }> {
  const session = getSession();
  if (!session) return { ok: false, reason: 'Nenhuma conta conectada' };
  if (!onlineEnabled()) return { ok: false, reason: 'Backend não configurado' };
  if (engine.state.settings.cloudSyncEnabled === false) {
    return { ok: false, reason: 'Sincronização automática desativada' };
  }
  const text = saveMgr.exportText(engine);
  // slot de vínculo: o escolhido pelo jogador na tela de Conta, senão o slot atual
  const slot = getAccountSlotPref() || saveMgr.getSlot();
  // marca "sincronizando" na TopBar durante a chamada de rede (e grava o resultado)
  setSyncing(true);
  try {
    const r = await pushAccountSave(session.token, text, engine.state.name || 'Jogador', slot);
    if (r.ok) {
      syncSnapshot = { ...syncSnapshot, lastSyncAt: Date.now(), lastError: null };
      notifySyncChanged();
      return { ok: true };
    }
    syncSnapshot = { ...syncSnapshot, lastError: r.reason ?? 'Falha ao sincronizar' };
    notifySyncChanged();
    return { ok: false, reason: r.reason };
  } finally {
    setSyncing(false);
  }
}

/**
 * Envia o save atual para a conta (automático, com throttle). É chamado a cada
 * save local (auto-save, fechar o jogo, menu) — espelho do autoPushSave da nuvem,
 * mantendo a conta sempre fresca (o timer de 1h vira só a rede de segurança).
 * `force` ignora o throttle (usado ao fechar o jogo / sair / boot com local novo).
 */
export async function autoPushAccountSave(
  engine: GameEngine,
  saveMgr: SaveManager,
  force = false,
): Promise<{ ok: boolean; reason?: string }> {
  const now = Date.now();
  if (!force && now - lastAutoPushAt < AUTO_PUSH_THROTTLE_MS) return { ok: true, reason: 'throttled' };
  lastAutoPushAt = now;
  return pushAccountSaveNow(engine, saveMgr);
}

export type AccountSyncOnLoadResult =
  | 'no-session'
  | 'offline'
  | 'disabled'
  | 'restored'
  | 'pushed'
  | 'noop';

/** Candidato a restauração do save da conta (para o jogador confirmar antes). */
export interface AccountRestoreInfo {
  slot: SaveSlot;
  name: string;
  savedAt: number;
  localSavedAt: number;
  saveText: string;
}

export type AccountRestoreCheck =
  | { pending: true; info: AccountRestoreInfo }
  | { pending: false; reason: 'no-session' | 'offline' | 'disabled' | 'no-save' | 'network' | 'other-slot' | 'not-newer' | 'local-newer' };

/**
 * Verifica (SEM alterar nada) se há um save da conta a restaurar no slot atual:
 * sessão, backend, toggle, slot e a regra "conta mais nova que o local".
 * Retorna o candidato (com saveText para aplicar depois) ou o motivo de não haver.
 */
export async function checkAccountRestore(saveMgr: SaveManager, engine: GameEngine): Promise<AccountRestoreCheck> {
  const session = getSession();
  if (!session) return { pending: false, reason: 'no-session' };
  if (!onlineEnabled()) return { pending: false, reason: 'offline' };
  if (engine.state.settings.cloudSyncEnabled === false) return { pending: false, reason: 'disabled' };
  const slot = saveMgr.getSlot();

  const cloud = await pullAccountSave(session.token);
  if (!cloud.ok) {
    // SÓ há candidato quando o servidor TEM um save. Falha de rede/indisponibilidade
    // nunca vira candidato (evita que um jogo novo de outra máquina destrua o save real).
    if (cloud.status === 404) return { pending: false, reason: 'no-save' };
    return { pending: false, reason: 'network' };
  }
  const info = cloud.info;
  // saves antigos/não vinculados (slot '') restauram no slot atual — comportamento
  // de transição; o próximo push vincula o slot (legado do modelo de 1 save/conta).
  if (info.slot && info.slot !== slot) return { pending: false, reason: 'other-slot' };

  // timestamp do save local (para comparar com a conta)
  const metas = await saveMgr.listSlots();
  const local = metas.find((m) => m.slot === slot);
  const localAt = local?.savedAt ?? 0;

  if (info.savedAt > localAt + RESTORE_MIN_NEWER_MS) {
    // conta significativamente mais nova → candidato a restauração
    return { pending: true, info: { slot, name: info.name, savedAt: info.savedAt, localSavedAt: localAt, saveText: info.saveText } };
  }
  if (localAt > info.savedAt + RESTORE_MIN_NEWER_MS) {
    // local significativamente mais novo → a CONTA deve ser atualizada (não restaura)
    return { pending: false, reason: 'local-newer' };
  }
  return { pending: false, reason: 'not-newer' };
}

/**
 * Aplica uma restauração CONFIRMADA: backup do save local + import do save da
 * conta no slot. Retorna se a importação foi bem-sucedida.
 */
export async function applyAccountRestore(saveMgr: SaveManager, engine: GameEngine, info: AccountRestoreInfo): Promise<boolean> {
  await saveMgr.createBackup(engine);
  const imp = await saveMgr.importText(info.slot, info.saveText);
  return imp.ok;
}

/**
 * Sincroniza a CONTA no load: se há candidato, restaura (com backup); se a
 * conta não tem save (404), sobe o local como primeiro backup. Usado pelo boot
 * automático (sem confirmação) — os fluxos de LOGIN pedem confirmação via
 * checkAccountRestore + applyAccountRestore na UI.
 */
export async function syncAccountOnLoad(saveMgr: SaveManager, engine: GameEngine): Promise<AccountSyncOnLoadResult> {
  const check = await checkAccountRestore(saveMgr, engine);
  if (!check.pending) {
    switch (check.reason) {
      case 'no-session': return 'no-session';
      case 'offline': return 'offline';
      case 'disabled': return 'disabled';
      case 'no-save': {
        // SÓ sobe o local como primeiro backup quando o servidor diz que não há save
        const r = await pushAccountSaveNow(engine, saveMgr);
        return r.ok ? 'pushed' : 'noop';
      }
      case 'local-newer': {
        // local mais novo → sobe para a conta (o outro dispositivo restaura depois)
        const r = await pushAccountSaveNow(engine, saveMgr);
        return r.ok ? 'pushed' : 'noop';
      }
      default: return 'noop';
    }
  }
  const ok = await applyAccountRestore(saveMgr, engine, check.info);
  return ok ? 'restored' : 'noop';
}
