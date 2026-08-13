import { useSyncExternalStore } from 'react';
import { getCloudStatus, subscribeCloudStatus } from '../online/status';
import { getAccountSyncSnapshot, subscribeAccountSync } from '../online/accountSync';
import { getSessionSnapshot, subscribeAccountSession } from '../online/account';
import { useNow } from './hooks';

/** Tempo relativo curto ("há 20s" / "há 3min"). */
function relTime(now: number, at: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return 'agora mesmo';
  if (s < 60) return `há ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m}min`;
  return `há ${Math.floor(m / 60)}h`;
}

/**
 * Indicador de sincronização ao vivo — mostra na tela inicial quando o
 * progresso foi sincronizado com o servidor (conta conectada) ou o estado
 * da nuvem (sem conta). Reage em tempo real (stores + relógio de 5s).
 */
export function SyncStatus() {
  const cloud = useSyncExternalStore(subscribeCloudStatus, getCloudStatus);
  const account = useSyncExternalStore(subscribeAccountSession, getSessionSnapshot);
  const accountSync = useSyncExternalStore(subscribeAccountSync, getAccountSyncSnapshot);
  const now = useNow(5000);

  let icon = '';
  let text = '';
  let cls = 'waiting';

  if (account) {
    if (accountSync.syncing) {
      icon = '↻'; text = 'Sincronizando…'; cls = 'syncing';
    } else if (accountSync.lastSyncAt > 0) {
      icon = '☁️'; text = `Sincronizado ${relTime(now, accountSync.lastSyncAt)}`; cls = 'ok';
    } else {
      icon = '☁️'; text = 'Aguardando primeira sincronização'; cls = 'waiting';
    }
  } else if (cloud === 'online') {
    icon = '🟢'; text = 'Online'; cls = 'ok';
  } else if (cloud === 'offline') {
    icon = '🔴'; text = 'Offline'; cls = 'off';
  } else {
    icon = '⚪'; text = cloud === 'disabled' ? 'Modo local' : 'Verificando…'; cls = 'waiting';
  }

  return (
    <div className={`sync-status sync-${cls}`} title="Estado da sincronização com o servidor">
      <span className={`sync-dot ${cls === 'ok' ? 'dot-ok' : cls === 'off' ? 'dot-off' : cls === 'syncing' ? 'dot-syncing' : ''}`} />
      <span className="sync-label">{icon} {text}</span>
    </div>
  );
}
