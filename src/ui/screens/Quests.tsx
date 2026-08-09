import { useState } from 'react';
import { useGame } from '../context';
import { Panel, TabBar } from '../kit';
import { questById, type QuestDef } from '../../quests/quests';
import type { QuestState } from '../../game/types';
import { D } from '../../core/bignum';
import { audio } from '../../audio/audio';

type QType = 'daily' | 'weekly' | 'permanent';

function RewardText({ def }: { def: QuestDef }) {
  const { fmt } = useGame();
  const parts: string[] = [];
  if (def.reward.gold) parts.push(`🪙 ${fmt(def.reward.gold, 0)}`);
  if (def.reward.xp) parts.push(`⭐ ${fmt(def.reward.xp, 0)} XP`);
  if (def.reward.fragments) parts.push(`🧩 ${fmt(def.reward.fragments, 0)}`);
  if (def.reward.prestigeCoins) parts.push(`🪙 ${fmt(def.reward.prestigeCoins, 0)}`);
  if (def.reward.eventTokens) parts.push(`🎟️ ${fmt(def.reward.eventTokens, 0)}`);
  if (def.reward.boxes) for (const [, n] of Object.entries(def.reward.boxes)) parts.push(`📦 ${n}×`);
  return <span className="reward-text">{parts.join(' + ')}</span>;
}

export function Quests() {
  const { engine, fmt } = useGame();
  const s = engine.state;
  const [type, setType] = useState<QType>('daily');

  const list: QuestState[] = s.quests[type];

  function renderQuest(qs: QuestState, i: number) {
    const def = questById(qs.id);
    if (!def) return null;
    const progress = engine.liveQuestProgress(def, qs);
    const target = D(def.target);
    const pct = progress.div(target).toNumber();
    const complete = progress.gte(target);
    return (
      <div key={qs.id} className={`quest-card ${complete ? 'complete' : ''}`}>
        <div className="quest-head">
          <span className="quest-icon">{def.icon}</span>
          <div>
            <strong>{def.name}</strong>
            <p className="muted small">{def.desc}</p>
          </div>
        </div>
        <div className="quest-progress">
          <div className="progress">
            <div className="progress-fill" style={{ width: `${Math.min(100, pct * 100)}%`, background: complete ? 'var(--success)' : undefined }} />
            <span className="progress-label">{fmt(progress.gt(1e9) ? progress : progress.toFixed(0), 0)} / {fmt(target, 0)}</span>
          </div>
        </div>
        <div className="quest-foot">
          <RewardText def={def} />
          {qs.claimed ? (
            <span className="claimed-tag">✔ Reivindicada</span>
          ) : (
            <button
              className={`btn btn-sm ${complete ? 'btn-primary' : ''}`}
              disabled={!complete}
              onClick={() => { if (engine.claimQuest(type, i).ok) audio.quest(); }}
            >
              {complete ? 'Reivindicar' : 'Em progresso'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <Panel title="Missões" icon="🎯" right={<span className="muted small">{fmt(s.stats.questsCompleted ?? '0', 0)} concluídas no total</span>}>
        <TabBar
          tabs={[
            { id: 'daily', name: 'Diárias', icon: '☀️' },
            { id: 'weekly', name: 'Semanais', icon: '📅' },
            { id: 'permanent', name: 'Permanentes', icon: '🏛️' },
          ]}
          active={type}
          onChange={setType}
        />
      </Panel>
      <div className="quest-list">{list.map(renderQuest)}</div>
    </div>
  );
}
