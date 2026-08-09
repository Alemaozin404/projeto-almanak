import { useGame } from '../context';
import { Panel } from '../kit';
import { ACHIEVEMENTS, isAchievementUnlocked } from '../../achievements/achievements';
import { D } from '../../core/bignum';
import { formatDate } from '../../core/utils';

export function Achievements() {
  const { engine, fmt } = useGame();
  const s = engine.state;
  const unlockedCount = Object.keys(s.achievements).length;

  return (
    <div className="screen">
      <Panel
        title="Conquistas"
        icon="🏆"
        right={<span className="muted small">{unlockedCount}/{ACHIEVEMENTS.length} desbloqueadas</span>}
      >
        <div className="progress">
          <div className="progress-fill" style={{ width: `${(unlockedCount / ACHIEVEMENTS.length) * 100}%`, background: 'var(--gold)' }} />
          <span className="progress-label">{Math.round((unlockedCount / ACHIEVEMENTS.length) * 100)}%</span>
        </div>
      </Panel>

      <div className="ach-grid">
        {ACHIEVEMENTS.map((a) => {
          const unlockedAt = s.achievements[a.id];
          const unlocked = unlockedAt !== undefined || isAchievementUnlocked(s, a);
          if (a.secret && unlockedAt === undefined) {
            return (
              <div key={a.id} className="ach-card locked secret">
                <span className="ach-icon">🤫</span>
                <strong>???</strong>
                <p className="muted small">Conquista secreta</p>
              </div>
            );
          }
          const progress = a.stat ? D(s.stats[a.stat] ?? '0') : null;
          const target = a.target ? D(a.target) : null;
          const pct = progress && target ? Math.min(100, progress.div(target).toNumber() * 100) : null;
          const rewards: string[] = [];
          if (a.reward.gold) rewards.push(`🪙 ${fmt(a.reward.gold, 0)}`);
          if (a.reward.fragments) rewards.push(`🧩 ${fmt(a.reward.fragments, 0)}`);
          if (a.reward.skillPoints) rewards.push(`🔮 ${a.reward.skillPoints}`);
          if (a.reward.title) rewards.push(`🎖️ Título`);
          return (
            <div key={a.id} className={`ach-card ${unlocked ? 'unlocked' : ''}`}>
              <span className="ach-icon">{unlocked ? a.icon : '🔒'}</span>
              <strong>{a.name}</strong>
              <p className="muted small">{a.desc}</p>
              {!unlocked && pct !== null && (
                <div className="progress slim">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                  <span className="progress-label">{fmt(progress!, 0)}/{fmt(target!, 0)}</span>
                </div>
              )}
              {rewards.length > 0 && <span className="reward-text">{rewards.join(' + ')}</span>}
              {unlockedAt !== undefined && <small className="ach-date">Desbloqueada em {formatDate(unlockedAt)}</small>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
