import { RESOURCE_LIST, type ResourceId } from '../economy/resources';
import { NumText, Tooltip } from './kit';
import { useGame } from './context';
import { xpForLevel } from '../economy/formulas';
import { D } from '../core/bignum';

export function TopBar({ onMenu, worldName }: { onMenu: () => void; worldName: string }) {
  const { engine } = useGame();
  const s = engine.state;
  const need = xpForLevel(s.level);
  const xpPct = Math.min(100, (D(s.xp).div(need).toNumber()) * 100);

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

      <button className="icon-btn menu-btn" onClick={onMenu} title="Menu">☰</button>
    </header>
  );
}
