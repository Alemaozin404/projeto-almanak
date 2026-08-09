import { useGame } from '../context';
import { Panel, StatRow } from '../kit';
import { STAT_DEFAULTS, statLabel } from '../../game/stats';
import { formatDuration } from '../../core/notation';

export function Stats() {
  const { engine, fmt } = useGame();
  const s = engine.state;
  const order = [
    'clicks', 'clicksAuto', 'crits', 'superCrits', 'megaCrits', 'ultraCrits',
    'energyProduced', 'goldEarned', 'crystalsEarned', 'xpEarned', 'goldDrops',
    'biggestClick', 'biggestCrit', 'energyPerSecMax',
    'upgradesBought', 'generatorsBought', 'boxesOpened', 'petsFound', 'equipmentFound',
    'questsCompleted', 'achievementsUnlocked', 'prestigeCount', 'ascensionCount', 'transcendenceCount',
    'comboMax', 'skillPointsSpent', 'titles', 'eventTokens',
  ];

  return (
    <div className="screen">
      <Panel title="Estatísticas" icon="📊" right={<span className="muted small">{formatDuration(s.playTimeSeconds)} jogados</span>}>
        <div className="stats-grid">
          {order.map((k) => {
            const v = s.stats[k] ?? STAT_DEFAULTS[k] ?? '0';
            const isTime = k === 'playTime';
            return (
              <div key={k} className="stat-card">
                <span className="stat-label">{statLabel(k)}</span>
                <strong>{isTime ? formatDuration(Number(v)) : fmt(v, 2)}</strong>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Detalhes de produção" icon="⚙️">
        <StatRow label="Energia por segundo" value={`${fmt(engine.energyPerSec(), 2)}/s`} icon="⚡" />
        <StatRow label="Moedas por segundo" value={`${fmt(engine.goldPerSec(), 2)}/s`} icon="🪙" />
        <StatRow label="Auto-cliques por segundo" value={`${fmt(engine.autoClicksPerSec(), 2)}/s`} icon="🖱️" />
        <StatRow label="Combo atual" value={`×${s.combo.count}`} icon="🔥" />
        <StatRow label="Combo máximo" value={`×${fmt(s.stats.comboMax ?? '0', 0)}`} icon="🌋" />
      </Panel>
    </div>
  );
}
