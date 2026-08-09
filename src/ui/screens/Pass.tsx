import { useState } from 'react';
import { useGame } from '../context';
import { Panel, ConfirmModal, Modal } from '../kit';
import { GAME_PASS_LEVELS, PASS_EXCLUSIVE } from '../../pass/GamePass';
import { GameConfig } from '../../config/GameConfig';
import { audio } from '../../audio/audio';
import { formatNumber } from '../../core/notation';
import { premiumLockLabel } from '../../content/skins';

function rewardSummary(spec: { gold?: string; crystals?: number; boxes?: { boxId: string; qty: number }[]; skins?: string[]; pets?: string[]; titles?: string[]; consumables?: { id: string; qty: number }[] }): string {
  const parts: string[] = [];
  if (spec.gold) parts.push(`🪙 ${formatNumber(spec.gold, 'short')}`);
  if (spec.crystals) parts.push(`💎 ${spec.crystals}`);
  if (spec.boxes) parts.push(`📦 ${spec.boxes.map((b) => `${b.qty}×`).join(' ')}`);
  if (spec.skins) parts.push('🎨 Skin');
  if (spec.pets) parts.push('🐾 Pet');
  if (spec.titles) parts.push('🎖️ Título');
  if (spec.consumables) parts.push('🍖 Consumível');
  return parts.join(' · ') || '—';
}

export function Pass() {
  const { engine } = useGame();
  const s = engine.state;
  const p = s.premiumPass;
  const [confirmBuy, setConfirmBuy] = useState(false);
  const [buying, setBuying] = useState(false);
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<{ level: number; which: 'free' | 'premium' } | null>(null);

  const lvl = engine.premiumPassLevel();
  const next = engine.premiumPassProgress();
  const reveal = s.settings.revealPremiumRewards;

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  }

  async function doBuy() {
    setBuying(true);
    const r = await engine.buyPremiumPass();
    setBuying(false);
    flash(r.ok ? '💎 Passe Premium adquirido!' : `❌ ${r.reason ?? 'Falha'}`);
    if (r.ok) audio.levelUp();
  }

  return (
    <div className="screen">
      <Panel title="Passe Premium" icon="🎟️">
        <div className="pass-hero">
          <div className="pass-hero-icon">💎</div>
          <div>
            <h3>Passe Premium — Temporada atual</h3>
            <p className="muted small">
              {p.owned
                ? 'Trilha premium desbloqueada! Reivindique as recompensas exclusivas de cada nível.'
                : '100 níveis · 50+ recompensas exclusivas · Skins, pet, avatar, títulos e efeitos premium.'}
            </p>
          </div>
          {!p.owned && (
            <button className="btn btn-primary" onClick={() => setConfirmBuy(true)}>🎟️ Adquirir passe</button>
          )}
        </div>

        <div className="pass-progress">
          <div>
            <span className="muted small">Nível atual</span>
            <strong style={{ fontSize: 26 }}>{lvl}</strong>
            <span className="muted small"> / 100</span>
          </div>
          <div className="progress pass-bar">
            <div className="progress-fill" style={{ width: `${Math.min(100, (lvl / GameConfig.pass.maxLevel) * 100)}%` }} />
            {next && <span className="progress-label">Nível {next.level}: {formatNumber(next.progress, 'short', { digits: 1 })}%</span>}
          </div>
          <p className="muted small">
            XP: {formatNumber(p.xp, 'short')} · Ganhe XP por cliques, missões e tempo jogado · Limite diário: {formatNumber(GameConfig.pass.dailyXpCap, 'short')}
          </p>
        </div>

        <div className="pass-tracks">
          <div className="pass-track-head">
            <span>Nível</span>
            <span>Recompensa grátis</span>
            <span className={p.owned ? '' : 'muted'}>Recompensa premium {!p.owned && '🔒'}</span>
            <span />
          </div>
          {GAME_PASS_LEVELS.map((l) => {
            const freeClaimed = p.claimedFree.includes(l.level);
            const premClaimed = p.claimedPremium.includes(l.level);
            const reachable = lvl >= l.level;
            const premiumSpec = p.owned && l.premium;
            const isExclusive = PASS_EXCLUSIVE.some((e) => e.atLevel === l.level);
            return (
              <div key={l.level} className={`pass-row ${l.level === 5 || l.level === 10 || l.level === 20 || l.level === 50 || l.level === 100 ? 'milestone' : ''}`}>
                <strong className="pass-lvl">{l.level}</strong>
                <span className="pass-reward">{l.free ? rewardSummary(l.free) : '—'}</span>
                <span className={`pass-reward ${premiumSpec ? '' : 'muted'}`}>
                  {p.owned
                    ? (l.premium ? rewardSummary(l.premium) : '—')
                    : '💎 Premium'}
                </span>
                <span className="pass-actions">
                  {reachable && !freeClaimed && l.free && (
                    <button className="btn btn-xs" onClick={() => { const r = engine.claimPassFree(l.level); if (r.ok) audio.buy(); else flash(`❌ ${r.reason}`); }}>
                      Coletar
                    </button>
                  )}
                  {freeClaimed && <span className="pass-checked">✓</span>}
                  {reachable && p.owned && l.premium && !premClaimed && (
                    <button className="btn btn-xs btn-primary" onClick={() => setModal({ level: l.level, which: 'premium' })}>
                      Coletar 💎
                    </button>
                  )}
                  {premClaimed && <span className="pass-checked gold">✓</span>}
                  {isExclusive && p.owned && !premClaimed && <span className="pass-exclusive">EXCLUSIVO</span>}
                </span>
              </div>
            );
          })}
        </div>

        {notice && <div className="menu-toast">{notice}</div>}
      </Panel>

      <ConfirmModal
        open={confirmBuy}
        onClose={() => setConfirmBuy(false)}
        onConfirm={() => { void doBuy(); }}
        title="Adquirir Passe Premium"
        desc={
          <div>
            <p className="muted">Desbloqueie:</p>
            <ul className="update-popup-list">
              <li>✓ 100 níveis de recompensas premium</li>
              <li>✓ 5 skins exclusivas do passe</li>
              <li>✓ Pet exclusivo Cronos (nível 100)</li>
              <li>✓ Avatares, moldura, efeito e badge premium</li>
              <li>✓ Títulos exclusivos</li>
            </ul>
            <p className="muted small">⚠ Compra local de teste (PaymentGateway separado). Nenhum dado de pagamento é armazenado. Futura integração online via camada própria.</p>
          </div>
        }
        confirmLabel={buying ? 'Processando…' : '💎 Adquirir'}
      />

      <Modal open={modal !== null} onClose={() => setModal(null)} title="Recompensa Premium" width={440}>
        {modal && (() => {
          const l = GAME_PASS_LEVELS.find((x) => x.level === modal.level);
          const spec = l?.premium;
          const locked = !reveal;
          return (
            <div className="skin-modal">
              <div className="premium-reward-box">
                <span style={{ fontSize: 44 }}>{locked ? '🔒' : '💎'}</span>
                {locked ? (
                  <>
                    <strong>{premiumLockLabel()}</strong>
                    <p className="muted small">Nível {modal.level} — recompensa premium exclusiva.</p>
                    <p className="muted small">Ative “Revelar recompensas premium” nas Configurações para ver o conteúdo.</p>
                  </>
                ) : (
                  <>
                    <strong>Nível {modal.level}</strong>
                    <p className="muted small">{spec ? rewardSummary(spec) : 'Recompensa premium'}</p>
                  </>
                )}
              </div>
              <div className="modal-actions">
                <button className="btn" onClick={() => setModal(null)}>Fechar</button>
                {spec && !locked && (
                  <button className="btn btn-primary" onClick={() => { const r = engine.claimPassPremium(modal.level); setModal(null); if (r.ok) audio.levelUp(); else flash(`❌ ${r.reason}`); }}>
                    Coletar recompensa
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
