import { useState } from 'react';
import { useGame } from '../context';
import { ConfirmModal, Panel, RarityBadge, TabBar, Tooltip } from '../kit';
import { UPGRADE_DEFS } from '../../shop/upgrades';
import { D, ONE } from '../../core/bignum';
import { audio } from '../../audio/audio';

type PrestigeTab = 'prestige' | 'ascension' | 'transcendence' | 'prestigeShop' | 'essence';

export function Prestige() {
  const { engine, fmt } = useGame();
  const s = engine.state;
  const [tab, setTab] = useState<PrestigeTab>('prestige');
  const [confirm, setConfirm] = useState<'prestige' | 'ascension' | 'transcendence' | null>(null);

  const frags = engine.prestigePreview();
  const ascCoins = engine.ascensionPreview();
  const ess = engine.transcendencePreview();

  const canPrestige = frags.gte(1);
  const canAscend = ascCoins.gte(1);
  const canTranscend = ess.gte(1);

  const prestigeUpgrades = UPGRADE_DEFS.filter((u) => u.currency === 'prestigeCoins');
  const ascensionUpgrades = UPGRADE_DEFS.filter((u) => u.currency === 'ascensionCoins');

  function renderUpgradeRow(u: (typeof prestigeUpgrades)[number]) {
    const lvl = engine.upgradeLevel(u.id);
    const maxed = lvl >= u.maxLevel;
    const cost = engine.upgradeCost(u.id);
    const can = engine.canAfford(u.currency, cost) && !maxed;
    return (
      <div key={u.id} className="upgrade-row">
        <span className="upgrade-icon">{u.icon}</span>
        <div className="upgrade-title">
          <strong>{u.name}</strong>
          <RarityBadge rarity={u.rarity} size="sm" />
          <span className="muted small">· Nv {lvl}/{u.maxLevel}</span>
        </div>
        <div className="upgrade-effects">
          <span className="effect-now">{lvl > 0 ? u.effectDesc(lvl) : u.desc}</span>
          {!maxed && <span className="effect-next">→ {u.effectDesc(lvl + 1)}</span>}
        </div>
        {maxed ? (
          <span className="maxed-text">✔</span>
        ) : (
          <button className="btn btn-sm" disabled={!can} onClick={() => { if (engine.buyUpgrade(u.id).ok) audio.buy(); }}>
            {fmt(cost, 0)}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="screen">
      <Panel title="Evolução" icon="🌟">
        <TabBar
          tabs={[
            { id: 'prestige', name: 'Prestígio', icon: '🌀' },
            { id: 'ascension', name: 'Ascensão', icon: '👑' },
            { id: 'transcendence', name: 'Transcendência', icon: '✨' },
            { id: 'prestigeShop', name: 'Loja de Prestígio', icon: '🪙' },
            { id: 'essence', name: 'Essência', icon: '💜' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </Panel>

      {tab === 'prestige' && (
        <Panel title="Prestígio / Rebirth" icon="🌀">
          <div className="layer-card">
            <p className="muted">Reset estratégico da camada normal. Você perde energia, ouro, upgrades e geradores, mas ganha <b>Fragmentos</b> — moeda permanente.</p>
            <div className="layer-stats">
              <div><span>Energia no ciclo</span><strong>{fmt(s.prestige.energyThisCycle, 0)}</strong></div>
              <div><span>Fragmentos ganhos</span><strong style={{ color: 'var(--gold)' }}>+{fmt(frags, 0)}</strong></div>
              <div><span>Moedas de prestígio</span><strong>+{fmt(D(frags).div(10).floor().plus(s.prestige.count * 2 + 1), 0)}</strong></div>
              <div><span>Prestígios realizados</span><strong>{s.prestige.count}</strong></div>
              <div><span>Fragmentos totais</span><strong>{fmt(s.prestige.totalFragments, 0)}</strong></div>
              <div><span>Bônus atual</span><strong>+{s.prestige.count * 25}%</strong></div>
            </div>
            <p className="muted small">Requisito: produzir 1M de energia no ciclo · Mantém: cristais, pets, equipamentos, habilidades, conquistas, títulos e skins · Ganha: +5 pontos de habilidade.</p>
            <button className="btn btn-primary btn-big" disabled={!canPrestige} onClick={() => setConfirm('prestige')}>
              {canPrestige ? `🌀 PRESTIGIAR — +${fmt(frags, 0)} fragmentos` : '🌀 Requer 1M de energia no ciclo'}
            </button>
          </div>
        </Panel>
      )}

      {tab === 'ascension' && (
        <Panel title="Ascensão" icon="👑">
          <div className="layer-card">
            <p className="muted">Reset da camada de prestígio. Ganhe <b>Moedas de Ascensão</b> e desbloqueie um novo mundo: +100% de produção e clique por mundo, além de raridades mais altas nas caixas.</p>
            <div className="layer-stats">
              <div><span>Fragmentos no ciclo</span><strong>{fmt(s.ascension.fragmentsThisCycle, 0)}</strong></div>
              <div><span>Moedas de ascensão</span><strong style={{ color: 'var(--rose)' }}>+{fmt(ascCoins, 0)}</strong></div>
              <div><span>Ascensões</span><strong>{s.ascension.count}</strong></div>
              <div><span>Mundo atual</span><strong>{engine.worldName()} (×{s.ascension.worldsUnlocked} produção)</strong></div>
            </div>
            <p className="muted small">Requisito: 25 fragmentos no ciclo · Mantém: pets, equipamentos, habilidades, conquistas · Ganha: +10 pontos de habilidade.</p>
            <button className="btn btn-primary btn-big" disabled={!canAscend} onClick={() => setConfirm('ascension')}>
              {canAscend ? `👑 ASCENDER — +${fmt(ascCoins, 0)} moedas` : '👑 Requer 25 fragmentos no ciclo'}
            </button>
          </div>
        </Panel>
      )}

      {tab === 'transcendence' && (
        <Panel title="Transcendência" icon="✨">
          <div className="layer-card">
            <p className="muted">Reset da camada de ascensão. Ganhe <b>Essência</b> para comprar bônus permanentes no fim de jogo.</p>
            <div className="layer-stats">
              <div><span>Moedas de ascensão no ciclo</span><strong>{fmt(s.transcendence.ascensionCoinsThisCycle, 0)}</strong></div>
              <div><span>Essência</span><strong style={{ color: 'var(--magenta)' }}>+{fmt(ess, 0)}</strong></div>
              <div><span>Transcendências</span><strong>{s.transcendence.count}</strong></div>
              <div><span>Multiplicador de essência</span><strong>×{fmt(ONE.plus(D(s.flags.essenceSpentTotal ?? 0).mul(0.05)), 2)}</strong></div>
            </div>
            <p className="muted small">Requisito: 5 moedas de ascensão no ciclo · Ganha: +20 pontos de habilidade.</p>
            <button className="btn btn-primary btn-big" disabled={!canTranscend} onClick={() => setConfirm('transcendence')}>
              {canTranscend ? `✨ TRANSCENDER — +${fmt(ess, 0)} essência` : '✨ Requer 5 moedas de ascensão no ciclo'}
            </button>
          </div>
        </Panel>
      )}

      {tab === 'prestigeShop' && (
        <>
          <Panel title="Loja de Prestígio" icon="🪙" right={<span className="muted small">{fmt(s.prestigeCoins, 0)} moedas</span>}>
            <p className="muted small">Compre melhorias permanentes com Moedas de Prestígio (ganhas a cada prestígio e em missões).</p>
          </Panel>
          <div className="upgrade-rows">{prestigeUpgrades.map(renderUpgradeRow)}</div>
          <Panel title="Loja de Ascensão" icon="👑" right={<span className="muted small">{fmt(s.ascensionCoins, 0)} moedas</span>}>
            <p className="muted small">Melhorias ainda mais poderosas com Moedas de Ascensão.</p>
          </Panel>
          <div className="upgrade-rows">{ascensionUpgrades.map(renderUpgradeRow)}</div>
        </>
      )}

      {tab === 'essence' && (
        <>
          <Panel title="Bônus de Essência" icon="💜" right={<span className="muted small">{fmt(s.essence, 0)} essência</span>}>
            <p className="muted small">Compre melhorias permanentes de fim de jogo. O preço dobra a cada compra.</p>
          </Panel>
          <div className="item-grid">
            {engine.essenceBoosts().map((b) => {
              const owned = engine.essenceBoostOwned(b.id);
              const cost = D(b.cost(owned));
              const can = engine.canAfford('essence', cost);
              return (
                <div key={b.id} className="item-card">
                  <div className="item-head">
                    <span className="item-icon">{b.icon}</span>
                    <div className="item-title"><strong>{b.name}</strong><span className="item-count">×{owned}</span></div>
                  </div>
                  <p className="muted small">{b.desc}</p>
                  <Tooltip text="Custo em essência">
                    <button className="btn btn-sm" disabled={!can} onClick={() => { if (engine.buyEssenceBoost(b.id).ok) audio.levelUp(); }}>
                      💜 {fmt(cost, 0)}
                    </button>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </>
      )}

      <ConfirmModal
        open={confirm === 'prestige'}
        onClose={() => setConfirm(null)}
        onConfirm={() => { engine.prestige(); }}
        title="Realizar Prestígio?"
        desc={<>Você perderá energia, moedas, upgrades e geradores, mas ganhará <b>+{fmt(frags, 0)} fragmentos</b> e <b>+{fmt(D(frags).div(10).floor().plus(s.prestige.count * 2 + 1), 0)} moedas de prestígio</b>. Diamantes, pets, equipamentos e habilidades são mantidos.</>}
        confirmLabel="Prestigiar"
      />
      <ConfirmModal
        open={confirm === 'ascension'}
        onClose={() => setConfirm(null)}
        onConfirm={() => { engine.ascend(); }}
        title="Realizar Ascensão?"
        desc={<>Você perderá fragmentos e moedas de prestígio não gastos, mas ganhará <b>+{fmt(ascCoins, 0)} moedas de ascensão</b> e desbloqueará um <b>novo mundo</b> (×2 produção).</>}
        confirmLabel="Ascender"
      />
      <ConfirmModal
        open={confirm === 'transcendence'}
        onClose={() => setConfirm(null)}
        onConfirm={() => { engine.transcend(); }}
        title="Realizar Transcendência?"
        desc={<>Você perderá moedas de ascensão não gastas, mas ganhará <b>+{fmt(ess, 0)} essência</b> para bônus permanentes.</>}
        confirmLabel="Transcender"
      />
    </div>
  );
}
