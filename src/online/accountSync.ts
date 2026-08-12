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
let lastSyncAt = 0;
let nextSyncAt = 0;

/** Intervalo entre envios automáticos (1 hora — configurável em GameConfig). */
export const ACCOUNT_SAVE_INTERVAL_MS = Math.max(1, Number(GameConfig.account.autoSaveHours) || 1) * 60 * 60 * 1000;

/** Última sincronização bem-sucedida com a conta (timestamp). */
export function lastAccountSyncAt(): number {
  return lastSyncAt;
}

/** Próximo envio automático agendado (timestamp; 0 = sem timer ativo). */
export function getNextAccountSyncAt(): number {
  return nextSyncAt;
}

/** Zera o estado interno (testes — isolamento entre execuções). */
export function resetAccountSyncState(): void {
  stopAccountAutoSave();
  lastSyncAt = 0;
  nextSyncAt = 0;
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
  const r = await pushAccountSave(session.token, text, engine.state.name || 'Jogador', slot);
  if (r.ok) lastSyncAt = Date.now();
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
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
  | { pending: false; reason: 'no-session' | 'offline' | 'disabled' | 'no-save' | 'network' | 'other-slot' | 'not-newer' };

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

  if (!(info.savedAt > localAt + RESTORE_MIN_NEWER_MS)) return { pending: false, reason: 'not-newer' };
  return { pending: true, info: { slot, name: info.name, savedAt: info.savedAt, localSavedAt: localAt, saveText: info.saveText } };
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
      default: return 'noop';
    }
  }
  const ok = await applyAccountRestore(saveMgr, engine, check.info);
  return ok ? 'restored' : 'noop';
}
