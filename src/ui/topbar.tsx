import { useSyncExternalStore } from 'react';
import { RESOURCE_LIST, type ResourceId } from '../economy/resources';
import { NumText, Tooltip } from './kit';
import { useGame } from './context';
import { xpForLevel } from '../economy/formulas';
import { D } from '../core/bignum';
import { formatDuration } from '../core/notation';
import { getCloudStatus, subscribeCloudStatus } from '../online/status';
import { getSessionSnapshot, subscribeAccountSession } from '../online/account';
import { getNextAccountSyncAt } from '../online/accountSync';
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
  // relógio para o countdown (1s quando logado; 1min quando não — sem custo)
  const now = useNow(account ? 1000 : 60_000);
  const nextSyncAt = getNextAccountSyncAt();
  const remaining = Math.max(0, nextSyncAt - now);

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
      {account && (
        <button
          className="account-chip"
          onClick={onAccountClick}
          title={
            nextSyncAt > 0
              ? `Conta: ${account.username} · próximo save automático em ${formatDuration(Math.ceil(remaining / 1000))}`
              : `Conta: ${account.username} · clique para gerenciar`
          }
        >
          <span className="account-chip-icon">👤</span>
          <span className="account-chip-name">{account.username}</span>
          {nextSyncAt > 0 && (
            <span className="account-chip-count">save em {formatDuration(Math.ceil(remaining / 1000))}</span>
          )}
        </button>
      )}
      <button className="icon-btn menu-btn" onClick={onMenu} title="Menu">☰</button>
    </header>
  );
}
