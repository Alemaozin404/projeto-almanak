import { useGame } from '../context';
import { Panel, TabBar } from '../kit';
import { SKILL_CATEGORIES, nodesByCategory, canUnlock, type SkillCategory } from '../../progression/skillTree';
import { useState } from 'react';
import { audio } from '../../audio/audio';

export function Skills() {
  const { engine } = useGame();
  const s = engine.state;
  const [cat, setCat] = useState<SkillCategory>('poder');

  return (
    <div className="screen">
      <Panel
        title="Árvore de Habilidades"
        icon="⚔️"
        right={<span className="skill-points">🔮 {s.skillPoints} pontos</span>}
      >
        <TabBar tabs={SKILL_CATEGORIES.map((c) => ({ id: c.id, name: c.name, icon: c.icon }))} active={cat} onChange={setCat} />
        <p className="muted small">Ganhe +1 ponto por nível, +5 por prestígio, +10 por ascensão e +20 por transcendência.</p>
      </Panel>

      <div className="skill-grid">
        {nodesByCategory(cat).map((node) => {
          const lvl = engine.skillLevel(node.id);
          const maxed = lvl >= node.maxLevel;
          const prereq = canUnlock(node, s.skills);
          const cost = node.cost(lvl);
          const can = s.skillPoints >= cost && prereq.ok && !maxed;
          return (
            <div key={node.id} className={`skill-card ${prereq.ok ? '' : 'locked'} ${maxed ? 'maxed' : ''}`}>
              <div className="skill-head">
                <span className="skill-icon">{node.icon}</span>
                <div>
                  <strong>{node.name}</strong>
                  <div className="muted small">{SKILL_CATEGORIES.find((c) => c.id === node.category)?.name}</div>
                </div>
                <span className="upgrade-level">Nv {lvl}/{node.maxLevel}</span>
              </div>
              <p className="muted small">{node.desc}</p>
              <div className="upgrade-effects">
                <span className="effect-now">{lvl > 0 ? node.effectDesc(lvl) : 'Sem efeito'}</span>
                {!maxed && <span className="effect-next">→ {node.effectDesc(lvl + 1)}</span>}
              </div>
              {node.prereq && !prereq.ok && <div className="locked-text">🔒 Requer "{node.prereq.id.replace(/_/g, ' ')}" nível {node.prereq.level}</div>}
              {!maxed ? (
                <button className={`btn ${can ? 'btn-primary' : ''}`} disabled={!can} onClick={() => { if (engine.buySkill(node.id).ok) audio.levelUp(); }}>
                  Melhorar · {cost} pt
                </button>
              ) : (
                <div className="maxed-text">✔ MÁXIMO</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
