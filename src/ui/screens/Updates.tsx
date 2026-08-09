import { useState } from 'react';
import { useGame } from '../context';
import { Panel, EmptyState } from '../kit';
import { UPDATES, latestUpdate, type PatchNote } from '../../content/updates';
import { UpdateManager } from '../../liveops/UpdateManager';
import { NEWS, NEWS_TYPE_META } from '../../content/news';
import { CODES } from '../../content/codes';
import { useNow } from '../hooks';
import { D } from '../../core/bignum';
import { audio } from '../../audio/audio';
import type { EventRewardSpec } from '../../content/rewards';

function RewardLine({ spec }: { spec: EventRewardSpec }) {
  const { fmt } = useGame();
  const parts: string[] = [];
  if (spec.gold) parts.push(`🪙 ${fmt(D(spec.gold), 0)} ouro`);
  if (spec.crystals) parts.push(`💎 ${spec.crystals} cristais`);
  if (spec.fragments) parts.push(`🌀 ${spec.fragments} fragmentos`);
  if (spec.boxes) parts.push(spec.boxes.map((b) => `📦 ${b.qty} caixa(s)`).join(' '));
  if (spec.skins) parts.push(`🎨 ${spec.skins.length} skin(s)`);
  if (spec.consumables) parts.push(`🧪 consumíveis`);
  if (spec.premiumPasses) parts.push(`💎 passe premium`);
  if (parts.length === 0) parts.push('sem recompensa');
  return <span className="muted small">{parts.join(' · ')}</span>;
}

function PatchCard({ patch, highlight }: { patch: PatchNote; highlight?: boolean }) {
  return (
    <div className={`patch-card ${highlight ? 'patch-highlight' : ''}`}>
      <div className="patch-head">
        <strong className="patch-version">{patch.hotfix ? '🩹' : '🚀'} v{patch.version}</strong>
        <span className="muted small">{new Date(patch.date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
      </div>
      <h4>{patch.title}</h4>
      <p className="muted small">{patch.description}</p>
      {patch.sections.map((sec) => (
        <div key={sec.tag} className="patch-section">
          <strong className="patch-tag">{sec.icon} {sec.tag}</strong>
          <ul>
            {sec.items.map((it, i) => <li key={i}>{it}</li>)}
          </ul>
        </div>
      ))}
      {patch.reward && <div className="patch-reward">🎁 Recompensa de atualização: <RewardLine spec={patch.reward} /></div>}
    </div>
  );
}

export function Updates() {
  const { engine, fmt } = useGame();
  const s = engine.state;
  const nowMs = useNow(1000);
  const [codeInput, setCodeInput] = useState('');
  const [codeMsg, setCodeMsg] = useState('');

  const latest = latestUpdate();
  const isLatest = s.lastSeenVersion === latest.version;
  const pendingReward = UpdateManager.pendingUpdateReward(s);
  const pendingComp = engine.pendingCompensations();
  const daily = s.dailyLogin;
  const dailyOk = engine.dailyLoginAvailable();

  const tryRedeem = () => {
    if (!codeInput.trim()) return;
    const r = engine.redeemCode(codeInput);
    setCodeMsg(r.ok ? `✅ Código ${r.name} resgatado!` : `❌ ${r.reason}`);
    setCodeInput('');
  };

  return (
    <div className="screen">
      <Panel title="Atualizações" icon="📰" right={<span className="muted small">versão atual: v{latest.version}</span>}>
        <p className="muted small">Patch notes, notícias, códigos e recompensas. Tudo data-driven em src/content/.</p>
      </Panel>

      {isLatest && (
        <PatchCard patch={latest} highlight />
      )}
      {pendingReward && (
        <Panel title="🎁 Presente de atualização" icon="🎁">
          <p className="muted small">Obrigado por jogar! Uma recompensa única da v{pendingReward.version} aguarda você.</p>
          <RewardLine spec={pendingReward.reward!} />
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={() => { if (engine.grantUpdateReward()) audio.levelUp(); }}>🎁 Resgatar presente</button>
          </div>
        </Panel>
      )}

      <Panel title="🎁 Compensação" icon="🩹">
        {pendingComp.length === 0 ? (
          <p className="muted small">Nenhuma compensação pendente. Bugs que afetam jogadores são compensados automaticamente aqui.</p>
        ) : (
          pendingComp.map((c) => (
            <div key={c.id} className="comp-row">
              <span>{c.icon} {c.name}</span>
              <span className="muted small">{c.desc}</span>
              <button className="btn btn-sm btn-primary" onClick={() => { if (engine.claimCompensation(c.id).ok) audio.levelUp(); }}>Resgatar</button>
            </div>
          ))
        )}
      </Panel>

      <Panel title="📅 Login diário" icon="📆" right={<span className="muted small">Resgates: {daily.count}</span>}>
        <div className="daily-grid">
          {Array.from({ length: 7 }, (_, i) => i).map((i) => {
            const claimed = daily.count > i;
            const isNext = daily.count === i;
            return (
              <div key={i} className={`daily-cell ${claimed ? 'claimed' : ''} ${isNext ? 'next' : ''}`}>
                <span className="muted small">Dia {i + 1}</span>
                <span>{['🪙', '💎', '📦', '🪙', '💎', '📦', '📦'][i]}</span>
                {claimed ? <span className="claimed-tag">✓</span> : isNext && dailyOk ? <span className="muted small">disponível</span> : <span className="muted small">—</span>}
              </div>
            );
          })}
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" disabled={!dailyOk} onClick={() => { const r = engine.claimDailyLogin(); if (r.ok) audio.quest(); }}>
            {dailyOk ? '🎁 Coletar recompensa de hoje' : `Volte em ${fmt(D(Math.max(0, daily.lastClaim + 20 * 3600 * 1000 - nowMs) / 1000), 0)}s`}
          </button>
        </div>
        <p className="muted small">Proteção anti-abuso: uma recompensa por janela de 20 horas.</p>
      </Panel>

      <Panel title="🎟️ Resgatar código" icon="🎫">
        <div className="code-row">
          <input
            className="wardrobe-search"
            placeholder="Digite o código (ex.: WELCOME2)"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') tryRedeem(); }}
            maxLength={24}
          />
          <button className="btn btn-primary" onClick={tryRedeem}>Resgatar</button>
        </div>
        {codeMsg && <p className="muted small">{codeMsg}</p>}
        <div className="code-list">
          {CODES.map((c) => {
            const used = s.codes.filter((x) => x === c.id).length >= (c.limit ?? 1);
            const expired = c.expiresAt ? nowMs > c.expiresAt : false;
            return (
              <div key={c.id} className={`code-chip ${used || expired ? 'used' : ''}`}>
                <strong>{c.id}</strong>
                <span className="muted small">{c.desc}</span>
                <span className="muted small">{used ? '✓ usado' : expired ? 'expirado' : 'ativo'}</span>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="📢 Novidades" icon="📣">
        {NEWS.length === 0 ? (
          <EmptyState icon="📰" text="Sem notícias por enquanto." />
        ) : (
          <div className="news-grid">
            {NEWS.map((n) => {
              const meta = NEWS_TYPE_META[n.type];
              return (
                <div key={n.id} className="news-card" style={{ background: n.gradient }}>
                  <span className="news-type" style={{ color: meta.color }}>{meta.icon} {meta.name}</span>
                  <strong>{n.title}</strong>
                  <p className="muted small">{n.summary}</p>
                  <details>
                    <summary className="muted small">Ver mais</summary>
                    <p className="muted small news-content">{n.content}</p>
                  </details>
                  <small className="muted">{new Date(n.date + 'T12:00:00').toLocaleDateString('pt-BR')}{n.version ? ` · v${n.version}` : ''}</small>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Histórico de atualizações" icon="🗂️">
        <div className="patch-list">
          {UPDATES.map((p) => <PatchCard key={p.version} patch={p} />)}
        </div>
      </Panel>
    </div>
  );
}
