import { useCallback, useEffect, useState } from 'react';
import { useGame } from '../context';
import { Panel, ConfirmModal, Modal } from '../kit';
import { GAME_PASS_LEVELS, PASS_EXCLUSIVE, summarizePass } from '../../pass/GamePass';
import { GameConfig } from '../../config/GameConfig';
import { pixOnlineEnabled, testPixBackend } from '../../wallet/mp';
import { PixOrderModal, type ActivePixOrder } from '../PixOrderModal';
import { fmtBRL } from '../../wallet/pix';
import { audio } from '../../audio/audio';
import { formatNumber } from '../../core/notation';
import { premiumLockLabel } from '../../content/skins';

function rewardSummary(spec: { gold?: string; energy?: string; credits?: number; crystals?: number; fragments?: number; essence?: number; prestigeCoins?: number; ascensionCoins?: number; eventTokens?: number; xp?: string; skillPoints?: number; boxes?: { boxId: string; qty: number }[]; skins?: string[]; pets?: string[]; titles?: string[]; avatarItems?: string[]; consumables?: { id: string; qty: number }[] }): string {
  const parts: string[] = [];
  if (spec.gold) parts.push(`🪙 ${formatNumber(spec.gold, 'short')}`);
  if (spec.credits) parts.push(`💳 ${spec.credits}`);
  if (spec.crystals) parts.push(`💎 ${spec.crystals}`);
  if (spec.fragments) parts.push(`🧩 ${spec.fragments}`);
  if (spec.essence) parts.push(`✨ ${spec.essence}`);
  if (spec.prestigeCoins) parts.push(`👑 ${spec.prestigeCoins}`);
  if (spec.eventTokens) parts.push(`🎟️ ${spec.eventTokens}`);
  if (spec.xp) parts.push(`⚡ ${formatNumber(spec.xp, 'short')} XP`);
  if (spec.skillPoints) parts.push(`🧠 +${spec.skillPoints} SP`);
  if (spec.boxes) parts.push(`📦 ${spec.boxes.map((b) => `${b.qty}×${boxLabel(b.boxId)}`).join(' ')}`);
  if (spec.skins) parts.push('🎨 Skin');
  if (spec.pets) parts.push('🐾 Pet');
  if (spec.titles) parts.push('🎖️ Título');
  if (spec.avatarItems) parts.push(`🖼️ ${spec.avatarItems.map(avatarLabel).join(', ')}`);
  if (spec.consumables) parts.push(`🍖 ${spec.consumables.map((c) => `${c.qty}×`).join(' ')}`);
  return parts.join(' · ') || '—';
}

/** Rótulo curto por id de caixa (para o resumo). */
function boxLabel(id: string): string {
  return { basic: 'Básica', rare: 'Rara', event: 'Evento', legendary: 'Lendária', celestial: 'Celestial' }[id] ?? id;
}

/** Nome do item de avatar (para o resumo). */
function avatarLabel(id: string): string {
  return {
    av_cyber: 'Avatar Netrunner',
    fr_premium: 'Moldura Premium',
    fx_premium: 'Aura Premium',
    bd_premium: 'Badge Premium',
  }[id] ?? id;
}

/** Nome da skin do passe (para o resumo). */
function passSkinName(id: string): string {
  return {
    pass_echo: 'Eco Prisma 🔷',
    pass_core: 'Núcleo Imperial 👑',
    pass_glitch: 'Glitch Temporal 🕹️',
    pass_divine: 'Aura Divina 😇',
    pass_omega: 'Omega Supremo ⏳',
    pass_omega_alt: 'Omega Eterno 🌌',
  }[id] ?? id;
}

/** Resumo visual do passe: o que você ganha em cada trilha (topo da tela). */
function PassSummaryGrid({ owned }: { owned: boolean }) {
  const sum = summarizePass();
  return (
    <div className="pass-summary">
      <div className="pass-summary-head">
        <strong>🎁 O que você ganha nesta temporada</strong>
        <span className="muted small">{sum.freeRewards} recompensas grátis · {sum.premiumRewards} premium</span>
      </div>
      <div className="pass-summary-grid">
        <div className="pass-summary-card free">
          <h4>🆓 Trilha Grátis</h4>
          <ul>
            <li>💎 <b>+{sum.totalCrystals.toLocaleString('pt-BR')}</b> diamantes</li>
            <li>📦 <b>+{sum.totalBoxes}</b> caixas (básicas, raras e de evento)</li>
            <li>🪙 Ouro progressivo em todos os 100 níveis</li>
            <li>🧩 Fragmentos e consumíveis ao longo da trilha</li>
          </ul>
        </div>
        <div className="pass-summary-card premium">
          <h4>💎 Trilha Premium {!owned && '🔒'}</h4>
          <ul>
            <li>💳 <b>+{sum.totalCredits.toLocaleString('pt-BR')}</b> créditos (moeda da loja)</li>
            <li>💎 <b>+{sum.totalCrystals.toLocaleString('pt-BR')}</b> diamantes extras</li>
            <li>🎨 <b>{sum.skins.length} skins exclusivas</b>: {sum.skins.map((s) => passSkinName(s.skin)).join(', ')}</li>
            {sum.hasPet && <li>🐾 Pet exclusivo <b>Cronos</b> (nível 100)</li>}
            {sum.hasTitles && <li>🎖️ Títulos exclusivos (Premium + Omega)</li>}
            {sum.hasAvatarItems && <li>🖼️ Avatar, moldura, aura e badge premium</li>}
            <li>📦 Caixas de evento nos marcos</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function Pass() {
  const { engine } = useGame();
  const s = engine.state;
  const p = s.premiumPass;
  const [confirmBuy, setConfirmBuy] = useState(false);
  const [confirmCredits, setConfirmCredits] = useState(false);
  const [buying, setBuying] = useState(false);
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState<{ level: number; which: 'free' | 'premium' } | null>(null);
  const [activeOrder, setActiveOrder] = useState<ActivePixOrder | null>(null);
  const [conn, setConn] = useState<{ ok: boolean; label: string } | null>(null);
  const online = pixOnlineEnabled();

  const lvl = engine.premiumPassLevel();
  const next = engine.premiumPassProgress();
  const reveal = s.settings.revealPremiumRewards;

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  }

  // status da conexão com o backend de pagamentos (aviso claro quando offline)
  const applyConn = useCallback((r: { ok: boolean; mp?: string; reason?: string }) => {
    setConn(r.ok
      ? { ok: true, label: r.mp === 'configured' ? 'Mercado Pago configurado' : 'Servidor ok, mas Mercado Pago não configurado no servidor' }
      : { ok: false, label: r.reason ?? 'Sem conexão' });
  }, []);

  useEffect(() => {
    if (!online) { setConn(null); return; }
    let alive = true;
    void testPixBackend().then((r) => { if (alive) applyConn(r); });
    return () => { alive = false; };
  }, [online, applyConn]);

  // retoma um pagamento do passe pendente ao abrir a tela
  useEffect(() => {
    if (!online) return;
    const pend = engine.pendingPixOrders().find((o) => o.packId === 'premium_pass');
    if (!pend) return;
    setActiveOrder({
      orderId: pend.orderId,
      packId: pend.packId,
      label: pend.label,
      pixCode: pend.pixCode ?? '',
      amountBRL: pend.amountBRL ?? 0,
    });
  }, [engine, online]);

  async function doBuyCredits() {
    const r = await engine.buyPremiumPass({ withCredits: true });
    if (r.ok) {
      flash('💎 Passe Premium adquirido com créditos!');
      audio.levelUp();
    } else {
      flash(`❌ ${r.reason ?? 'Falha'}`);
    }
    setConfirmCredits(false);
  }

  async function doBuy() {
    setBuying(true);
    const r = await engine.buyPremiumPass();
    setBuying(false);
    if (r.ok && r.pending) {
      // cobrança real criada (Mercado Pago) — exibe o QR e inicia o polling
      setActiveOrder({ orderId: r.orderId ?? '', packId: 'premium_pass', label: 'Passe Premium', pixCode: r.pixCode ?? '', qrCodeBase64: r.qrCodeBase64, amountBRL: GameConfig.pass.priceBRL });
    } else if (r.ok) {
      flash('💎 Passe Premium adquirido!');
      audio.levelUp();
    } else {
      flash(`❌ ${r.reason ?? 'Falha'}`);
    }
    setConfirmBuy(false);
  }

  /** Pagamento aprovado pelo Mercado Pago — o engine já concedeu o passe. */
  function handlePixApproved() {
    setActiveOrder(null);
    flash('💎 Passe Premium adquirido!');
    audio.levelUp();
  }

  function handlePixRejected(status: string) {
    setActiveOrder(null);
    flash(`❌ Pagamento ${status}.`);
  }

  return (
    <div className="screen">
      <Panel title="Passe Premium" icon="🎟️">
        <div className="pass-hero">
          {online && conn && (
            <div className={`pix-conn-banner ${conn.ok ? 'ok' : 'err'}`}>
              <strong>{conn.ok ? '🟢 Pagamentos reais ativos' : '🔴 Sem conexão com o servidor de pagamentos'}</strong>
              <span className="muted small">{conn.label}</span>
              <button className="btn btn-xs" onClick={() => void testPixBackend().then(applyConn)}>↻ Verificar</button>
            </div>
          )}
          <div className="pass-hero-icon">💎</div>
          <div>
            <h3>Passe Premium — Temporada atual</h3>
            <p className="muted small">
              {p.owned
                ? 'Trilha premium desbloqueada! Reivindique as recompensas exclusivas de cada nível.'
                : `100 níveis · 50+ recompensas exclusivas · Skins, pet, avatar, títulos e efeitos premium. Adquira por ${fmtBRL(GameConfig.pass.priceBRL)} via Pix ${online ? '💳 (Mercado Pago)' : '(simulação local)'}.`}
            </p>
          </div>
          {!p.owned && (
            <div className="pass-buy-buttons">
              <button className="btn btn-primary" onClick={() => setConfirmBuy(true)}>🎟️ Adquirir via Pix · {fmtBRL(GameConfig.pass.priceBRL)}</button>
              <button className="btn" onClick={() => setConfirmCredits(true)} disabled={engine.getRes('credits').lt(GameConfig.pass.creditsPrice)}>
                💳 Com créditos · {GameConfig.pass.creditsPrice}
              </button>
              <span className="muted small">Você tem {engine.getRes('credits').toFixed(0)} 💳</span>
            </div>
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
          <div className="pass-xp-buy">
            <span className="muted small">💎 Compre XP com diamantes (1💎 = {GameConfig.pass.xpPerDiamond} XP):</span>
            <button className="btn btn-xs" disabled={engine.getRes('crystals').lt(1)} onClick={() => { const r = engine.buyPassXp(GameConfig.pass.xpPerDiamond); if (r.ok) audio.levelUp(); else flash(`❌ ${r.reason ?? 'Falha'}`); }}>
              +{GameConfig.pass.xpPerDiamond} XP · 💎1
            </button>
            <span className="muted small">Você tem {engine.getRes('crystals').toFixed(0)} 💎</span>
          </div>
        </div>

        <PassSummaryGrid owned={p.owned} />

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
            const isSkinLevel = isExclusive;
            const isBigMilestone = l.level % 10 === 0;
            const cls = [
              'pass-row',
              isSkinLevel ? 'milestone-skin' : '',
              isBigMilestone ? 'milestone' : '',
            ].filter(Boolean).join(' ');
            return (
              <div key={l.level} className={cls}>
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
        open={confirmCredits}
        onClose={() => setConfirmCredits(false)}
        onConfirm={() => { void doBuyCredits(); }}
        title="Adquirir Passe Premium com créditos"
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
            <p className="muted small">
              💳 Você pagará <strong>{GameConfig.pass.creditsPrice} créditos</strong> (1 crédito = R$ 0,05 → valor de referência {fmtBRL(GameConfig.pass.creditsPrice * 0.05)}).
              Você tem <strong>{engine.getRes('credits').toFixed(0)} 💳</strong>.
            </p>
          </div>
        }
        confirmLabel={`💳 Adquirir · ${GameConfig.pass.creditsPrice} créditos`}
      />

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
            <p className="muted small">
              💳 Você pagará <strong>{fmtBRL(GameConfig.pass.priceBRL)}</strong> via Pix.{online
                ? ' Cobrança real pelo Mercado Pago — QR Code na tela, passe liberado após a aprovação (recibo assinado pelo servidor).'
                : ' Compra simulada localmente (modo de teste) — nada será cobrado.'}
            </p>
          </div>
        }
        confirmLabel={buying ? 'Processando…' : `💎 Adquirir · ${fmtBRL(GameConfig.pass.priceBRL)}`}
      />

      {/* QR / pagamento em andamento (compartilhado com a Carteira e a Loja) */}
      <PixOrderModal
        order={activeOrder}
        onClose={() => setActiveOrder(null)}
        onApproved={handlePixApproved}
        onRejected={handlePixRejected}
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
