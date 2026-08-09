import { useState } from 'react';
import { useGame } from '../context';
import { RarityBadge, Panel, TabBar, EmptyState } from '../kit';
import { UPGRADE_CATEGORIES, upgradesByCategory, type UpgradeCategory } from '../../shop/upgrades';
import { bulkCost } from '../../economy/formulas';
import { audio } from '../../audio/audio';

function maxAffordable(
  engine: ReturnType<typeof useGame>['engine'],
  currency: 'gold' | 'crystals' | 'prestigeCoins' | 'ascensionCoins',
  baseCost: string,
  costMult: number,
  level: number,
  maxLevel: number,
): number {
  const budget = engine.getRes(currency);
  const factor = engine.costFactor();
  let q = 0;
  for (let step = 512; step >= 1; step = Math.floor(step / 2)) {
    if (level + q + step <= maxLevel && bulkCost(baseCost, costMult, level, q + step).mul(factor).lte(budget)) q += step;
  }
  return q;
}

export function Upgrades() {
  const { engine, fmt } = useGame();
  const [cat, setCat] = useState<UpgradeCategory>('click');
  const defs = upgradesByCategory(cat);

  return (
    <div className="screen">
      <Panel title="Upgrades" icon="⬆️" right={<span className="muted small">{defs.length} melhorias disponíveis</span>}>
        <TabBar
          tabs={UPGRADE_CATEGORIES.map((c) => ({ id: c.id, name: c.name, icon: c.icon }))}
          active={cat}
          onChange={setCat}
        />
      </Panel>

      {defs.length === 0 && <EmptyState icon="📭" text="Nenhum upgrade nesta categoria." />}

      <div className="upgrade-grid">
        {defs.map((def) => {
          const lvl = engine.upgradeLevel(def.id);
          const maxed = lvl >= def.maxLevel;
          const locked = engine.state.level < def.unlockLevel;
          const cost = engine.upgradeCost(def.id);
          const affordable = cost.gte(0) && engine.canAfford(def.currency, cost);
          const maxQ = maxAffordable(engine, def.currency, def.baseCost, def.costMult, lvl, def.maxLevel);
          const currencyIcon = { gold: '🪙', crystals: '💎', prestigeCoins: '🪙', ascensionCoins: '👑' }[def.currency];

          return (
            <div key={def.id} className={`upgrade-card ${locked ? 'locked' : ''}`}>
              <div className="upgrade-head">
                <span className="upgrade-icon">{def.icon}</span>
                <div className="upgrade-title">
                  <strong>{def.name}</strong>
                  <RarityBadge rarity={def.rarity} size="sm" />
                </div>
                <span className="upgrade-level">Nv {lvl}/{def.maxLevel}</span>
              </div>
              <p className="muted small">{def.desc}</p>
              <div className="upgrade-effects">
                <span className="effect-now">{lvl > 0 ? def.effectDesc(lvl) : 'Sem efeito ainda'}</span>
                {!maxed && <span className="effect-next">→ {def.effectDesc(lvl + 1)}</span>}
              </div>
              {locked ? (
                <div className="locked-text">🔒 Requer nível {def.unlockLevel}</div>
              ) : maxed ? (
                <div className="maxed-text">✔ NÍVEL MÁXIMO</div>
              ) : (
                <div className="upgrade-buy">
                  <button
                    className={`btn ${affordable ? 'btn-primary' : ''}`}
                    disabled={!affordable}
                    onClick={() => { if (engine.buyUpgrade(def.id, 1).ok) audio.buy(); }}
                  >
                    {currencyIcon} {fmt(cost, 0)}
                  </button>
                  {maxQ > 1 && (
                    <button className="btn" disabled={maxQ <= 0} onClick={() => { if (engine.buyUpgrade(def.id, maxQ).ok) audio.buy(); }}>
                      ×{Math.min(maxQ, 99)}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
