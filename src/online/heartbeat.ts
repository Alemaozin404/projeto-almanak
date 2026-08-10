/**
 * Heartbeat — sinal oculto do app para o servidor.
 *
 * Enquanto um jogo está aberto, o app envia um POST /api/heartbeat a cada
 * 1 minuto (silencioso, sem UI). O servidor usa o sinal para:
 *   1. registrar a presença do jogador (quem está online agora);
 *   2. devolver um "ponteiro de atualização" (versão do conteúdo + timestamp
 *      de exportação) — se mudou, o app re-sincroniza o conteúdo remoto NA
 *      HORA (notícias, eventos, banners, códigos, manutenção), sem esperar o
 *      intervalo de 30 min do sync periódico.
 *
 * Sem backend configurado, o sistema não faz nada (jogo 100% local).
 * Falhas de rede são silenciosas — o heartbeat nunca atrapalha o jogo.
 */
import { GameConfig } from '../config/GameConfig';
import { pixBackendUrl, pixOnlineEnabled } from '../wallet/mp';
import { syncRemoteContent } from '../liveops/RemoteContent';

/** Intervalo do sinal — 1 minuto. */
export const HEARTBEAT_INTERVAL_MS = 60 * 1000;

interface HeartbeatDto {
  ok?: boolean;
  gameVersion?: string;
  contentUpdatedAt?: string | null;
  maintenance?: boolean;
}

/** Último ponteiro de atualização visto (evita re-sync repetido do mesmo conteúdo). */
let lastContentStamp: string | null = null;

/** Último flag de manutenção sinalizado pelo servidor (evita aviso repetido a cada minuto). */
let lastMaintenanceFlag: boolean | null = null;

/** Zera o estado interno (usado em testes — isolamento entre execuções). */
export function resetHeartbeatState(): void {
  lastContentStamp = null;
  lastMaintenanceFlag = null;
}

/** Envia um único sinal ao servidor. Falha → null (silencioso). */
async function sendHeartbeat(playerId: number): Promise<HeartbeatDto | null> {
  try {
    const res = await fetch(`${pixBackendUrl()}/api/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-secret': GameConfig.wallet.appSharedSecret,
      },
      body: JSON.stringify({ playerId, gameVersion: GameConfig.version }),
    });
    if (res.redirected) return null; // servidor protegido por login — ignora
    if (!res.ok) return null;
    const data = (await res.json()) as HeartbeatDto;
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

/**
 * Inicia o heartbeat oculto do jogador. Retorna a função que o encerra.
 * - `onChange` é chamado quando um sinal detecta conteúdo novo e o re-sync
 *   trouxe dados do servidor (para forçar re-render das telas);
 * - `onMaintenance` é chamado UMA vez quando o servidor passa a sinalizar
 *   manutenção (transição false → true) — o jogo avisa o jogador.
 */
export function startHeartbeat(playerId: number, onChange?: () => void, onMaintenance?: () => void): () => void {
  if (!pixOnlineEnabled()) return () => {};
  let stopped = false;
  let busy = false; // evita sobreposição: o sinal imediato e o do intervalo nunca correm juntos

  const beat = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const sig = await sendHeartbeat(playerId);
      if (!sig || stopped) return;
      // manutenção: aviso único na transição false → true (sem spam a cada minuto)
      const maintTransition = sig.maintenance === true && lastMaintenanceFlag !== true;
      lastMaintenanceFlag = sig.maintenance ?? false;
      // ponteiro de atualização: primeira leitura registra; mudança → re-sync na hora
      const stamp = `${sig.gameVersion ?? ''}:${sig.contentUpdatedAt ?? ''}`;
      const stampChanged = lastContentStamp !== null && stamp !== lastContentStamp;
      lastContentStamp = stamp;
      // sincroniza ANTES de avisar — o toast precisa das janelas já hidratadas
      if (maintTransition || stampChanged) {
        const r = await syncRemoteContent();
        if (r === 'online' && !stopped) onChange?.();
      }
      if (maintTransition && !stopped) onMaintenance?.();
    } finally {
      busy = false;
    }
  };

  // sinal imediato + repetição a cada minuto
  void beat();
  const iv = globalThis.setInterval(() => void beat(), HEARTBEAT_INTERVAL_MS);
  return () => {
    stopped = true;
    globalThis.clearInterval(iv);
  };
}
