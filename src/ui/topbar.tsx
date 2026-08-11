import { useSyncExternalStore } from 'react';
import { RESOURCE_LIST, type ResourceId } from '../economy/resources';
import { NumText, Tooltip } from './kit';
import { useGame } from './context';
import { xpForLevel } from '../economy/formulas';
import { D } from '../core/bignum';
import { getCloudStatus, subscribeCloudStatus } from '../online/status';

const CLOUD_LABEL: Record<string, { icon: string; text: string }> = {
  online: { icon: '🟢', text: 'Online — sincronizado com o servidor' },
  offline: { icon: '🔴', text: 'Offline — sem conexão com o servidor' },
  disabled: { icon: '⚪', text: 'Modo local — backend não configurado' },
  unknown: { icon: '🟡', text: 'Verificando conexão…' },
};

export function TopBar({ onMenu, worldName }: { onMenu: () => void; worldName: string }) {
  const { engine } = useGame();
  const s = engine.state;
  const need = xpForLevel(s.level);
  const xpPct = Math.min(100, (D(s.xp).div(need).toNumber()) * 100);
  const cloud = useSyncExternalStore(subscribeCloudStatus, getCloudStatus);
  const cloudMeta = CLOUD_LABEL[cloud] ?? CLOUD_LABEL.unknown;

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
      <button className="icon-btn menu-btn" onClick={onMenu} title="Menu">☰</button>
    </header>
  );
}
