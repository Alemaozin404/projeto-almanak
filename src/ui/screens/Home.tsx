import { useRef } from 'react';
import { useGame } from '../context';
import { useFloatingNumbers, useParticles } from '../effects';
import { NumText, Panel, Tooltip } from '../kit';
import { BannerCarousel } from '../BannerCarousel';
import { SyncStatus } from '../SyncStatus';
import { GENERATOR_DEFS } from '../../automation/generators';
import { D } from '../../core/bignum';
import { CRIT_LABELS, type CritTier } from '../../game/engine';
import { audio } from '../../audio/audio';
import { RESOURCES, type ResourceId } from '../../economy/resources';
import { hapticImpact } from '../../core/platform';
import { equippedSkin, SKINS } from '../../content/skins';
import { NEWS, NEWS_TYPE_META } from '../../content/news';
import type { Screen } from '../sidebar';

const CRIT_COLORS: Record<CritTier, string> = {
  normal: '#ffd94d',
  crit: '#ff8a3d',
  super: '#ff4d6d',
  mega: '#b06cff',
  ultra: '#ff6bff',
};

export function Home({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const { engine, fmt } = useGame();
  const s = engine.state;
  const floats = useFloatingNumbers(45);
  const particles = useParticles(150);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const lastClickRef = useRef(0);

  const skin = equippedSkin(s);
  // skins não-núcleo mantêm o visual clássico do orbe
  const core = skin.visual.core ?? SKINS[0].visual.core;
  const particleColor = skin.visual.particle;
  const numbersClass = skin.visual.numbers;

  const b = engine.bonuses();
  const clickPower = D(1).plus(b.energyPerClick).mul(b.clickPower);
  const comboMult = D(1).plus(D(s.combo.count).mul(0.01));
  const eps = engine.energyPerSec();
  const gps = engine.goldPerSec();
  const critChance = Math.min(1, b.critChance.toNumber() + engine.critBoost());

  function handleClick(e: React.MouseEvent) {
    // anti-automação: ignora cliques sintéticos mais rápidos que ~33/s
    const t = performance.now();
    if (t - lastClickRef.current < 30) return;
    lastClickRef.current = t;
    hapticImpact(); // vibração no toque do Núcleo (app Android)
    const res = engine.click('manual');
    const rect = areaRef.current?.getBoundingClientRect();
    const x = e.clientX - (rect?.left ?? 0);
    const y = e.clientY - (rect?.top ?? 0);
    floats.add(fmt(res.gain, 0), res.tier !== 'normal', x, y, CRIT_LABELS[res.tier] || undefined);
    const color = res.tier === 'normal' && particleColor ? particleColor : CRIT_COLORS[res.tier];
    particles.burst(x, y, color, res.tier === 'normal' ? 8 : 16);
    if (res.tier !== 'normal') audio.crit(res.tier);
    else audio.click(s.combo.count);
  }

  return (
    <div className="home">
      <BannerCarousel onNavigate={onNavigate} />

      <SyncStatus />

      <div className="home-top">
        <Panel title="Núcleo de Energia" icon="⚡" className="home-main" right={<span className="muted small">Clique · Espaço · Enter</span>}>
          <div className={`core-area ${numbersClass ?? ''}`} ref={areaRef} onMouseDown={handleClick}>
            {particles.canvas}
            <div className="core-orb-wrap">
              <span className="core-ring ring-1" aria-hidden="true" />
              <span className="core-ring ring-2" aria-hidden="true" />
              <button
                className="core-orb"
                style={{
                  background: core ? `radial-gradient(circle at 32% 30%, ${core.color}, ${core.color2})` : undefined,
                  boxShadow: core ? `0 0 40px ${core.glow}, 0 0 90px ${core.glow}` : undefined,
                }}
                title="Clique para gerar energia"
              >
                <span className="core-bolt">{skin.icon === '❓' ? '⚡' : skin.icon}</span>
              </button>
            </div>
            <div className="core-stats">
              <div className="click-power">
                <NumText v={clickPower.mul(comboMult)} digits={2} />
              </div>
              <span className="muted small">energia por clique</span>
            </div>
            {floats.layer}
          </div>

          <div className="home-hud">
            <div className="hud-item">
              <span className="muted">Energia</span>
              <strong className="hud-big" style={{ color: RESOURCES.energy.color }}>
                <NumText v={engine.getRes('energy' as ResourceId)} digits={2} />
              </strong>
            </div>
            <div className="hud-row">
              <span>⚡ {fmt(eps, 2)}/s</span>
              <span>🪙 {fmt(gps, 2)}/s</span>
              <span>🎯 {fmt(critChance * 100, 1)}% crítico</span>
              <span>💥 {fmt(b.critDamage, 1)}x dano crítico</span>
            </div>
          </div>

          {s.combo.count >= 2 && (
            <div className={`combo-badge ${s.combo.count >= 50 ? 'hot' : ''}`}>
              <strong>COMBO x{s.combo.count}</strong>
              <span>+{fmt(comboMult.minus(1).mul(100), 1)}% clique</span>
            </div>
          )}

          <div className="buffs-row">
            {Object.entries(s.activeEffects).filter(([, e]) => e.until > Date.now()).map(([id, e]) => {
              const label = id.startsWith('pet_skill_') ? '🐾 Skill de pet' : { click_x2: '🧪 Clique x2', prod_x2: '⚗️ Produção x2', gold_x2: '🫙 Ouro x2', crit_boost: '🍀 +25% crítico' }[id] ?? id;
              const secs = Math.max(0, Math.ceil((e.until - Date.now()) / 1000));
              return <span key={id} className="buff-chip">{label} · {secs}s</span>;
            })}
          </div>
        </Panel>

        <div className="home-side">
          <Panel title="Estilo do Núcleo" icon="🎨" className="home-skin">
            <div className="skin-preview" style={{ background: core ? `radial-gradient(circle at 30% 30%, ${core.color}, ${core.color2})` : undefined, boxShadow: core ? `0 0 20px ${core.glow}` : undefined }}>
              {skin.icon === '❓' ? '⚡' : skin.icon}
            </div>
            <p className="muted small">{skin.name}</p>
            <button className="btn btn-sm" onClick={() => onNavigate('wardrobe')}>Abrir Armário</button>
          </Panel>

          <Panel title="Login diário" icon="📆" className="home-daily">
            <div className="daily-inline">
              {Array.from({ length: 7 }, (_, i) => i).map((i) => {
                const r = engine.dailyLoginReward(i);
                return (
                  <span
                    key={i}
                    className={`daily-dot ${s.dailyLogin.count > i ? 'claimed' : ''} ${s.dailyLogin.count === i ? 'next' : ''}`}
                    title={`Dia ${i + 1}: ${r.credits ? `+${r.credits} créditos 💳` : ''}${r.gold ? ` · +${fmt(D(r.gold), 0)} moedas` : ''}${r.boxes ? ` · ${r.boxes.map((b) => `${b.qty} caixa`).join(' ')}` : ''}`}
                  >{i + 1}</span>
                );
              })}
            </div>
            <p className="muted small daily-today">Hoje: +{fmt(engine.dailyLoginReward().credits ?? 0, 0)} 💳</p>
            <button className="btn btn-sm" disabled={!engine.dailyLoginAvailable()} onClick={() => engine.claimDailyLogin()}>
              {engine.dailyLoginAvailable() ? '🎁 Coletar' : 'Em breve'}
            </button>
          </Panel>
        </div>
      </div>

      <Panel title="Produção automática" icon="🏭" className="home-gens">
        <div className="gen-grid">
          {GENERATOR_DEFS.map((g) => {
            const lvl = engine.generatorLevel(g.id);
            const unlocked = s.level >= g.unlockLevel;
            const cost = engine.generatorCost(g.id);
            const can = engine.canAfford(g.currency, cost);
            return (
              <div key={g.id} className={`gen-card ${unlocked ? '' : 'locked'}`}>
                <span className="gen-icon">{g.icon}</span>
                <div className="gen-info">
                  <strong>{g.name}</strong>
                  <small>{lvl > 0 ? `Nv ${lvl} · +${fmt(D(g.baseProduction).mul(lvl), 1)}${g.type === 'clicks' ? ' cliques/s' : g.type === 'gold' ? ' ouro/s' : '/s'}` : g.desc}</small>
                  {!unlocked && <small className="locked-text">🔒 Requer nível {g.unlockLevel}</small>}
                </div>
                <div className="gen-actions">
                  <Tooltip text={`Custo: ${fmt(cost)} ${g.currency === 'gold' ? 'ouro' : 'cristais'}`}>
                    <button className="btn btn-sm" disabled={!unlocked || !can} onClick={() => { if (engine.buyGenerator(g.id, 1).ok) audio.buy(); }}>
                      {fmt(cost, 0)}
                    </button>
                  </Tooltip>
                  <button className="btn btn-sm ghost" disabled={!unlocked || !can} onClick={() => { if (engine.buyGenerator(g.id, 10).ok) audio.buy(); }}>
                    ×10
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="📢 Novidades" icon="📣" className="home-news">
        <div className="news-strip">
          {NEWS.slice(0, 3).map((n) => {
            const meta = NEWS_TYPE_META[n.type];
            return (
              <button key={n.id} className="news-strip-card" style={{ background: n.gradient }} onClick={() => onNavigate('updates')}>
                <span className="news-type" style={{ color: meta.color }}>{meta.icon} {meta.name}</span>
                <strong>{n.title}</strong>
                <p className="muted small">{n.summary}</p>
              </button>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
