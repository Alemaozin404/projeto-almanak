/**
 * status.ts — estado reativo da conexão com o backend online.
 *
 * O heartbeat, o sync de conteúdo remoto e o auto-sync da nuvem reportam
 * aqui o estado da conexão; a UI (TopBar, Configurações) assina e mostra
 * um indicador de online/offline sem precisar de polling próprio.
 */
export type CloudStatus = 'online' | 'offline' | 'disabled' | 'unknown';

let status: CloudStatus = 'unknown';
const listeners = new Set<() => void>();

/** Estado atual da conexão. */
export function getCloudStatus(): CloudStatus {
  return status;
}

/** Atualiza o estado e notifica os assinantes (no-op se igual). */
export function setCloudStatus(s: CloudStatus): void {
  if (s === status) return;
  status = s;
  listeners.forEach((fn) => fn());
}

/** Assina mudanças de status. Retorna a função que cancela a assinatura. */
export function subscribeCloudStatus(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Zera o estado (usado em testes — isolamento entre execuções). */
export function resetCloudStatus(): void {
  setCloudStatus('unknown');
  listeners.clear();
}
