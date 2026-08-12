import { useState } from 'react';
import { useGame } from '../context';
import { Panel, TabBar, EmptyState } from '../kit';
import { EventManager } from '../../liveops/EventManager';
import { EVENTS_ALL, eventStatus, eventUntilStart, eventRemaining, type EventDef, type EventStatus } from '../../content/events';
import { useNow, countdownParts } from '../hooks';
import { D } from '../../core/bignum';
import { audio } from '../../audio/audio';
import type { EventRewardSpec } from '../../content/rewards';

const STATUS_META: Record<EventStatus, { label: string; cls: string }> = {
  upcoming: { label: 'EM BREVE', cls: 'st-upcoming' },
  live: { label: 'AO VIVO', cls: 'st-live' },
  ending_soon: { label: 'TERMINA EM BREVE', cls: 'st-ending' },
  ended: { label: 'ENCERRADO', cls: 'st-ended' },
  archived: { label: 'ARQUIVADO', cls: 'st-ended' },
};

function BigCountdown({ ms }: { ms: number }) {
  const p = countdownParts(ms);
  const cells: [string, number][] = [['DIAS', p.d], ['HORAS', p.h], ['MIN', p.m], ['SEG', p.s]];
  return (
    <div className="countdown-big">
      {cells.map(([label, v]) => (
        <div key={label} className="countdown-cell">
          <strong>{String(v).padStart(2, '0')}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function RewardChips({ spec }: { spec: EventRewardSpec }) {
  const { fmt } = useGame();
  const parts: string[] = [];
  if (spec.gold) parts.push(`🪙 ${fmt(D(spec.gold), 0)}`);
  if (spec.energy) parts.push(`⚡ ${fmt(D(spec.energy), 0)}`);
  if (spec.crystals) parts.push(`💎 ${spec.crystals}`);
  if (spec.fragments) parts.push(`🌀 ${spec.fragments}`);
  if (spec.essence) parts.push(`💜 ${spec.essence}`);
  if (spec.skillPoints) parts.push(`🆙 ${spec.skillPoints}`);
  if (spec.boxes) parts.push(spec.boxes.map((b) => `📦 ${b.qty}×`).join(' '));
  if (spec.skins) parts.push(`🎨 ${spec.skins.length} skin(s)`);
  if (spec.titles) parts.push(`🎖️ título`);
  if (spec.consumables) parts.push(`🧪 ${spec.consumables.map((c) => `${c.qty}×`).join(' ')}`);
  if (spec.premiumPasses) parts.push(`💎 passe premium`);
  if (parts.length === 0) parts.push('—');
  return <span className="reward-text">{parts.join(' · ')}</span>;
}

function EventPassPanel({ ev }: { ev: EventDef }) {
  const { engine } = useGame();
  if (!ev.pass) return null;
  const trackId = `ev_${ev.id}`;
  const xp = engine.passXp(trackId);
  const level = engine.passLevel(trackId, ev.pass.levels);
  const max = ev.pass.levels.length;
  const next = ev.pass.levels.find((l) => l.level === level + 1);
  const premium = engine.hasPremiumPass(trackId);
  const xpToNext = next ? Math.max(0, parseFloat(next.xp) - parseFloat(xp.toString())) : 0;

  return (
    <div className="pass-box">
      <div className="pass-head">
        <strong>EVENT PASS</strong>
        <span className={premium ? 'pass-premium' : 'muted small'}>{premium ? '💎 Passe Premium' : 'Trilha grátis'}</span>
        <span className="muted small">Nível {level}/{max} · {xp.toFixed(0)} XP{next ? ` · +${xpToNext.toFixed(0)} p/ nível ${level + 1}` : ''}</span>
      </div>
      <div className="progress slim"><div className="progress-fill" style={{ width: `${(level / max) * 100}%` }} /></div>
      <div className="pass-levels">
        {ev.pass.levels.map((l) => {
          const reached = l.level <= level;
          const canClaim = (which: 'free' | 'premium') => {
            if (!reached) return false;
            const t = engine.state.passTracks[trackId];
            if (!t) return true;
            return !t[which === 'free' ? 'claimedFree' : 'claimedPremium'].includes(l.level);
          };
          return (
            <div key={l.level} className={`pass-row ${reached ? '' : 'locked'}`}>
              <span className="pass-lvl">{l.level}</span>
              <div className="pass-rewards">
                {l.free && <div className="pass-reward free"><small>GRÁTIS</small><RewardChips spec={l.free} /></div>}
                {l.premium && <div className="pass-reward premium"><small>PREMIUM</small><RewardChips spec={l.premium} /></div>}
              </div>
              <div className="pass-claim">
                {l.free && (
                  <button
                    className="btn btn-xs"
                    disabled={!canClaim('free')}
                    onClick={() => { if (engine.claimPassReward(trackId, ev.pass!.levels, l.level, 'free').ok) audio.quest(); }}
                  >
                    {canClaim('free') ? 'Coletar' : '—'}
                  </button>
                )}
                {l.premium && (
                  <button
                    className="btn btn-xs btn-primary"
                    disabled={!premium || !canClaim('premium')}
                    title={premium ? '' : 'Adquira o passe premium'}
                    onClick={() => { if (engine.claimPassReward(trackId, ev.pass!.levels, l.level, 'premium').ok) audio.levelUp(); }}
                  >
                    {premium ? (canClaim('premium') ? 'Coletar' : '—') : '🔒'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EventDetail({ ev }: { ev: EventDef }) {
  const { engine, fmt } = useGame();
  const nowMs = useNow(1000);
  const st = engine.eventState(ev);
  const status = eventStatus(ev, nowMs);
  const meta = STATUS_META[status];
  const box = ev.boxId;

  return (
    <Panel title={`${ev.icon} ${ev.name}`} className={`event-banner ${ev.lightning ? 'event-lightning' : ''} ${ev.global ? 'event-global' : ''}`}
      right={<span className={`status-chip ${meta.cls}`}>{meta.label}</span>}>
      <p className="muted">{ev.desc}</p>

      <div className="event-countdown-row">
        {status === 'upcoming' ? (
          <>
            <div className="muted small">Começa em:</div>
            <BigCountdown ms={eventUntilStart(ev, nowMs)} />
          </>
        ) : (status === 'live' || status === 'ending_soon') ? (
          <>
            <div className="muted small">Termina em:</div>
            <BigCountdown ms={eventRemaining(ev, nowMs)} />
          </>
        ) : (
          <span className="locked-text">EVENTO {meta.label}</span>
        )}
        {ev.lightning && <span className="locked-text">⚡ EVENTO RELÂMPAGO</span>}
        {ev.global && <span className="locked-text">🌍 EVENTO GLOBAL</span>}
        {ev.entry && <span className="locked-text">💎 EVENTO PREMIUM ({ev.entry === 'fichas' ? 'Fichas 🎰' : 'Créditos 💳'})</span>}
      </div>

      <div className="event-bonus"><span>Bônus ativo:</span> <strong>{ev.bonusText}</strong></div>
      {(status === 'live' || status === 'ending_soon') && (
        <div className="event-currency">
          {ev.entry === 'fichas' ? (
            <>
              <span>🎰 Fichas</span>
              <strong>{fmt(engine.getRes('fichas'), 0)}</strong>
              <small className="muted">Moeda premium do evento — sem moedas grátis (compre na Carteira)</small>
            </>
          ) : ev.entry === 'credits' ? (
            <>
              <span>💳 Créditos</span>
              <strong>{fmt(engine.getRes('credits'), 0)}</strong>
              <small className="muted">Moeda premium do evento — sem moedas grátis (compre na Carteira)</small>
            </>
          ) : (
            <>
              <span>{ev.currency.icon} {ev.currency.name}</span>
              <strong>{fmt(D(st.tokens), 0)}</strong>
              <small className="muted">+{fmt(D(1).plus(D(Math.max(0, engine.bonuses().luck.toNumber()))), 1)} por clique</small>
            </>
          )}
        </div>
      )}

      {status !== 'upcoming' && status !== 'ended' && status !== 'archived' && ev.dailyRewards && (
        <div className="event-daily">
          <strong className="muted small">🎁 Recompensas diárias do evento</strong>
          <div className="event-daily-grid">
            {ev.dailyRewards.map((r, i) => {
              const claimed = st.dailyClaimed.includes(String(i));
              return (
                <div key={i} className={`event-daily-cell ${claimed ? 'claimed' : ''} ${i === st.dailyClaimed.length && !claimed ? 'ready' : ''}`}>
                  <span className="muted small">Dia {i + 1}</span>
                  <RewardChips spec={r} />
                  {claimed ? <span className="claimed-tag">✓</span> : (
                    <button className="btn btn-xs" disabled={i !== st.dailyClaimed.length} onClick={() => { if (engine.claimEventDaily(ev.id, i).ok) audio.quest(); }}>
                      Coletar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {ev.story && status !== 'ended' && status !== 'archived' && (
        <div className="event-story">
          <strong className="muted small">📖 História do evento</strong>
          {ev.story.map((ch) => {
            const unlock = ch.unlockLevel ?? 1;
            const trackId = `ev_${ev.id}`;
            const lvl = engine.passLevel(trackId, ev.pass?.levels ?? []);
            const read = st.progress[`story_${ch.id}`] === '1';
            return (
              <div key={ch.id} className={`story-chapter ${read ? 'read' : ''}`}>
                <div className="story-head">
                  <strong>{ch.title}</strong>
                  {unlock > 1 && <span className="muted small">Nível {unlock} do passe</span>}
                  {read ? <span className="claimed-tag">✓ Lido</span> : (
                    <button
                      className="btn btn-xs"
                      disabled={lvl < unlock}
                      onClick={() => {
                        st.progress[`story_${ch.id}`] = '1';
                        if (ch.reward) engine.grantRewards(ch.reward);
                        engine.notify('event');
                        audio.quest();
                      }}
                    >
                      {lvl < unlock ? `🔒 Nv ${unlock}` : 'Ler capítulo'}
                    </button>
                  )}
                </div>
                {read && <p className="muted small story-text">{ch.text}</p>}
                {ch.reward && <RewardChips spec={ch.reward} />}
              </div>
            );
          })}
        </div>
      )}

      {(status === 'live' || status === 'ending_soon') && <EventPassPanel ev={ev} />}

      {(status === 'live' || status === 'ending_soon') && (
        <div className="event-shop">
          <strong className="muted small">🛒 Loja do evento</strong>
          <div className="item-grid">
            {ev.shop.map((item) => {
              const can = item.diamondCost
                ? engine.canAfford('crystals', D(item.diamondCost))
                : ev.entry === 'fichas'
                  ? engine.canAfford('fichas', D(item.cost))
                  : ev.entry === 'credits'
                    ? engine.canAfford('credits', D(item.cost))
                    : D(st.tokens).gte(D(item.cost));
              return (
                <div key={item.id} className="item-card">
                  <div className="item-head">
                    <span className="item-icon">{item.icon}</span>
                    <div className="item-title"><strong>{item.name}</strong></div>
                  </div>
                  <p className="muted small">{item.desc}</p>
                  <button className="btn btn-sm" disabled={!can} onClick={() => { if (engine.buyEventItem(ev.id, item.id).ok) audio.buy(); }}>
                    {item.diamondCost
                      ? `💎 ${fmt(D(item.diamondCost), 0)}`
                      : `${ev.entry === 'fichas' ? '🎰' : ev.entry === 'credits' ? '💳' : ev.currency.icon} ${fmt(D(item.cost), 0)}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {box && (status === 'live' || status === 'ending_soon') && (
        <div className="event-box">
          <span>📦 Caixa do Evento: você tem {engine.boxCount(box)}</span>
        </div>
      )}
    </Panel>
  );
}

function Calendar() {
  const { fmt } = useGame();
  const nowMs = useNow(1000);
  const rows = EVENTS_ALL.map((ev) => {
    const status = eventStatus(ev, nowMs);
    const meta = STATUS_META[status];
    return { ev, status, meta };
  });
  const upcoming = rows.filter((r) => r.status === 'upcoming');
  const live = rows.filter((r) => r.status === 'live' || r.status === 'ending_soon');
  const past = rows.filter((r) => r.status === 'ended' || r.status === 'archived');

  const Section = ({ title, icon, list }: { title: string; icon: string; list: typeof rows }) => (
    <div className="calendar-section">
      <h4>{icon} {title}</h4>
      {list.length === 0 && <p className="muted small">Nada por aqui.</p>}
      {list.map(({ ev, status, meta }) => (
        <div key={ev.id} className={`calendar-row ${ev.lightning ? 'cal-lightning' : ''}`}>
          <span className="cal-icon">{ev.icon}</span>
          <div className="cal-info">
            <strong>{ev.name}</strong>
            <small className="muted">{ev.startLabel ?? '—'} → {ev.endLabel ?? '—'}{ev.lightning ? ' · ⚡ relâmpago' : ''}{ev.entry ? ' · 💎 premium' : ''}</small>
          </div>
          {status === 'upcoming' ? (
            <span className="muted small cal-count">{EventManager.formatRemaining(eventUntilStart(ev, nowMs))}</span>
          ) : (status === 'live' || status === 'ending_soon') ? (
            <span className="muted small cal-count">{EventManager.formatRemaining(eventRemaining(ev, nowMs))}</span>
          ) : null}
          <span className={`status-chip ${meta.cls}`}>{meta.label}</span>
        </div>
      ))}
    </div>
  );

  return (
    <Panel title="Calendário de eventos" icon="📅">
      <Section title="Evento atual" icon="🔴" list={live} />
      <Section title="Próximos eventos" icon="⏭️" list={upcoming} />
      <Section title="Encerrados" icon="🗃️" list={past} />
      <p className="muted small">Novos eventos são cadastrados em src/content/events.ts — sem tocar no resto do jogo. Eventos encerrados viram arquivados após 30 dias. Balanceamento de {fmt(D(1), 0)} XP por clique.</p>
    </Panel>
  );
}

export function Events() {
  const nowMs = useNow(5000);
  const actives = EventManager.active(nowMs);
  const [tab, setTab] = useState<'live' | 'calendar'>('live');

  return (
    <div className="screen">
      <Panel title="Eventos" icon="🎊" right={<span className="muted small">{actives.length} ativo(s)</span>}>
        <TabBar
          tabs={[
            { id: 'live', name: 'Eventos', icon: '🎊' },
            { id: 'calendar', name: 'Calendário', icon: '📅' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </Panel>

      {tab === 'live' && (
        actives.length === 0 ? (
          <EmptyState icon="🌙" text="Nenhum evento no momento. Veja o calendário para os próximos!" />
        ) : (
          actives.map((ev) => <EventDetail key={ev.id} ev={ev} />)
        )
      )}

      {tab === 'calendar' && <Calendar />}
    </div>
  );
}
