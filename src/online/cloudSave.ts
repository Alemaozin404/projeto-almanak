/**
 * Save na nuvem — o save codificado (NC1.base64) é enviado/baixado do servidor
 * (Vercel + Upstash Redis). A identidade do jogador é o `createdAt` do save
 * (um número único por save — imutável), exibida nas Configurações.
 *
 * Segurança: a rota exige `x-app-secret` e o playerId é difícil de adivinhar.
 * O save baixado passa pela MESMA validação/checksum de um save local
 * (SaveManager.importText) — nada corrompido ou adulterado entra no jogo.
 */
import { apiFetch, apiJson } from './api';
import type { GameState } from '../game/types';

/** Identidade do jogador para a nuvem (imutável por save). */
export function cloudPlayerId(state: GameState): number {
  return typeof state.createdAt === 'number' && Number.isFinite(state.createdAt) ? state.createdAt : 0;
}

export interface CloudSaveInfo {
  saveText: string;
  name: string;
  savedAt: number;
}

export async function pushCloudSave(playerId: number, saveText: string, name: string): Promise<{ ok: boolean; savedAt?: number; reason?: string }> {
  try {
    const res = await apiFetch(`/api/save/${playerId}`, {
      method: 'PUT',
      body: JSON.stringify({ saveText, name: name.slice(0, 40), savedAt: Date.now() }),
    });
    const data = await apiJson<{ ok?: boolean; savedAt?: number; reason?: string }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})` };
    return { ok: true, savedAt: data.savedAt };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

export async function pullCloudSave(playerId: number): Promise<{ ok: boolean; info?: CloudSaveInfo; reason?: string }> {
  try {
    const res = await apiFetch(`/api/save/${playerId}`);
    const data = await apiJson<{ ok?: boolean; saveText?: string; name?: string; savedAt?: number; reason?: string }>(res);
    if (!res.ok || data?.ok !== true || typeof data.saveText !== 'string') {
      return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})` };
    }
    return { ok: true, info: { saveText: data.saveText, name: data.name ?? '', savedAt: data.savedAt ?? 0 } };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}
