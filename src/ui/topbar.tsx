import { useSyncExternalStore } from 'react';
import { RESOURCE_LIST, type ResourceId } from '../economy/resources';
import { NumText, Tooltip } from './kit';
import { useGame } from './context';
import { xpForLevel } from '../economy/formulas';
import { D } from '../core/bignum';
import { formatDuration } from '../core/notation';
import { getCloudStatus, subscribeCloudStatus } from '../online/status';
import { getSessionSnapshot, subscribeAccountSession } from '../online/account';
import { getNextAccountSyncAt, getAccountSyncSnapshot, subscribeAccountSync } from '../online/accountSync';
import { useNow } from './hooks';

const CLOUD_LABEL: Record<string, { icon: string; text: string }> = {
  online: { icon: '🟢', text: 'Online — sincronizado com o servidor' },
  offline: { icon: '🔴', text: 'Offline — sem conexão com o servidor' },
  disabled: { icon: '⚪', text: 'Modo local — backend não configurado' },
  unknown: { icon: '🟡', text: 'Verificando conexão…' },
};

export function TopBar({ onMenu, worldName, onAccountClick }: { onMenu: () => void; worldName: string; onAccountClick?: () => void }) {
  const { engine } = useGame();
  const s = engine.state;
  const need = xpForLevel(s.level);
  const xpPct = Math.min(100, (D(s.xp).div(need).toNumber()) * 100);
  const cloud = useSyncExternalStore(subscribeCloudStatus, getCloudStatus);
  const cloudMeta = CLOUD_LABEL[cloud] ?? CLOUD_LABEL.unknown;

  // conta conectada: reage a login/logout via store (mesmo padrão do status da nuvem)
  const account = useSyncExternalStore(subscribeAccountSession, getSessionSnapshot);
  // estado do save da conta: sincronizando agora / última sincronização / último erro
  const accountSync = useSyncExternalStore(subscribeAccountSync, getAccountSyncSnapshot);
  // relógio para o countdown (1s quando logado; 1min quando não — sem custo)
  const now = useNow(account ? 1000 : 60_000);
  const nextSyncAt = getNextAccountSyncAt();
  const remaining = Math.max(0, nextSyncAt - now);
  // "✅ sincronizado" por alguns segundos após um envio bem-sucedido
  const justSynced = !accountSync.syncing && accountSync.lastSyncAt > now - 30_000;

  return (
    <header className="topbar">
      <div className="player-chip" title={`Nível ${s.level} — ${D(s.xp).toFixed(0)}/${need.toFixed(0)} XP`}>
        <span className="chip-level">{s.level}</span>
        <div className="chip-xp">
          <div className="progress slim">
            <div className="progress-fill" style={{ width: `${xpPct}%` }} />
          </div>
          <small>{s.skillPoints > 0 ? `${s.skillPoints} pts` : ''}</small>
        </div>
        <span className="chip-world" title="Mundo atual">{worldName}</span>
      </div>

      <div className="resources">
        {RESOURCE_LIST.map((r) => (
          <Tooltip key={r.id} text={`${r.name} — ${r.source}\nUso: ${r.use}`}>
            <div className="resource">
              <span className="res-icon" style={{ color: r.color }}>{r.icon}</span>
              <span className="res-value"><NumText v={engine.getRes(r.id as ResourceId)} /></span>
            </div>
          </Tooltip>
        ))}
      </div>

      <span className={`cloud-status cloud-${cloud}`} title={cloudMeta.text}>
        <span className="cloud-dot" />
        <span className="cloud-text">{cloudMeta.text}</span>
      </span>
      {account ? (
        <button
          className={`account-chip${accountSync.syncing ? ' syncing' : ''}`}
          onClick={onAccountClick}
          title={
            (accountSync.syncing
              ? `Conta: ${account.username} · sincronizando o save…`
              : justSynced
                ? `Conta: ${account.username} · save sincronizado`
                : nextSyncAt > 0
                  ? `Conta: ${account.username} · próximo save automático em ${formatDuration(Math.ceil(remaining / 1000))}`
                  : `Conta: ${account.username} · clique para gerenciar`) +
            (accountSync.lastSyncAt > 0 ? `\nÚltima sincronização: ${new Date(accountSync.lastSyncAt).toLocaleTimeString('pt-BR')}` : '') +
            (accountSync.lastError ? `\n⚠️ ${accountSync.lastError}` : '')
          }
        >
          <span className="account-chip-icon">👤</span>
          <span className="account-chip-name">{account.username}</span>
          {accountSync.syncing ? (
            <span className="account-chip-count account-chip-sync"><span className="account-sync-spin">↻</span> sincronizando…</span>
          ) : justSynced ? (
            <span className="account-chip-count account-chip-done">✅ sincronizado</span>
          ) : nextSyncAt > 0 ? (
            <span className="account-chip-count">save em {formatDuration(Math.ceil(remaining / 1000))}</span>
          ) : null}
        </button>
      ) : (
        <button
          className="account-chip guest"
          onClick={onAccountClick}
          title="Modo sem conta (convidado) — seu mundo fica só neste dispositivo. Clique para criar ou entrar em uma conta."
        >
          <span className="account-chip-icon">🎮</span>
          <span className="account-chip-name">Convidado</span>
        </button>
      )}
      <button className="icon-btn menu-btn" onClick={onMenu} title="Menu">☰</button>
    </header>
  );
}
