/**
 * autoRank — publicação automática dos melhores ciclos no ranking global.
 *
 * Quando o jogador conclui um Prestígio / Ascensão / Transcendência, o melhor
 * ciclo de cada tipo é publicado no ranking global automaticamente (online por
 * padrão) — sem botão manual. A função compartilhada também é usada pela tela
 * de Ranking ("Publicar meus recordes").
 *
 * Só publica o RECORDE (ganho + contagem + nome), nunca o save inteiro.
 */
import { D } from '../core/bignum';
import { onlineEnabled, submitGlobalRank, type RankEntry } from './api';
import { cloudPlayerId } from './cloudSave';
import { cloudSyncEnabled } from './autoCloud';
import type { GameState, RunRecord } from '../game/types';

const RANK_KINDS: RankEntry['kind'][] = ['prestige', 'ascension', 'transcendence'];

/** Melhor ciclo de um tipo no ranking local do save. */
export function bestRunOfKind(state: GameState, kind: RunRecord['kind']): RunRecord | undefined {
  return state.ranking
    .filter((r) => r.kind === kind)
    .sort((a, b) => D(b.gain).cmp(D(a.gain)))[0];
}

export interface PublishResult {
  kind: RankEntry['kind'];
  ok: boolean;
  position?: number | null;
  reason?: string;
}

/** Cooldown entre publicações automáticas (evita rajadas em ações rápidas). */
const AUTO_COOLDOWN_MS = 10 * 1000;
let lastAutoPublishAt = 0;

/** Zera o estado interno (usado em testes — isolamento entre execuções). */
export function resetAutoRankState(): void {
  lastAutoPublishAt = 0;
}

/**
 * Publica o melhor ciclo de cada tipo no ranking global. Sempre silencioso:
 * sem backend, sem save válido ou sem ciclos → não faz nada.
 */
export async function publishBestRuns(state: GameState): Promise<PublishResult[]> {
  if (!onlineEnabled()) return [];
  const playerId = cloudPlayerId(state);
  if (!playerId) return [];
  const name = state.name || 'Jogador';
  return doPublish(state, playerId, name);
}

/** Publica o melhor de cada tipo — compartilhado entre manual e automático. */
async function doPublish(state: GameState, playerId: number, name: string): Promise<PublishResult[]> {
  const results: PublishResult[] = [];
  for (const kind of RANK_KINDS) {
    const best = bestRunOfKind(state, kind);
    if (!best) continue;
    const r = await submitGlobalRank({
      playerId: String(playerId),
      name,
      kind,
      gain: best.gain,
      count: best.count,
    });
    results.push({ kind, ok: r.ok, position: r.position, reason: r.reason });
  }
  return results;
}

/**
 * Publicação AUTOMÁTICA (após prestígio/ascensão/transcendência): respeita o
 * toggle de sincronização automática e tem cooldown para evitar rajadas.
 * Silenciosa — o Ranking mostra o resultado quando o jogador abre a tela.
 */
export async function autoPublishBestRuns(state: GameState): Promise<void> {
  if (!onlineEnabled()) return;
  if (!cloudSyncEnabled(state)) return;
  const now = Date.now();
  if (now - lastAutoPublishAt < AUTO_COOLDOWN_MS) return;
  lastAutoPublishAt = now;
  await publishBestRuns(state);
}
