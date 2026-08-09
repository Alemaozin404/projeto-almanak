import { useGame } from '../context';
import { Panel, EmptyState } from '../kit';
import { SEASONS, activeSeason, seasonStatus, seasonRemaining, type SeasonDef } from '../../content/seasons';
import { useNow, countdownParts } from '../hooks';
import { EventManager } from '../../liveops/EventManager';
import { audio } from '../../audio/audio';
import { D } from '../../core/bignum';
import type { EventRewardSpec } from '../../content/rewards';

function RewardChips({ spec }: { spec: EventRewardSpec }) {
  const { fmt } = useGame();
  const parts: string[] = [];
  if (spec.gold) parts.push(`🪙 ${fmt(D(spec.gold), 0)}`);
  if (spec.crystals) parts.push(`💎 ${spec.crystals}`);
  if (spec.boxes) parts.push(spec.boxes.map((b) => `📦 ${b.qty}×`).join(' '));
  if (spec.skins) parts.push(`🎨 ${spec.skins.length} skin(s)`);
  if (spec.consumables) parts.push(`🧪 consumíveis`);
  if (spec.premiumPasses) parts.push(`💎 premium`);
  if (parts.length === 0) parts.push('—');
  return <span className="reward-text">{parts.join(' · ')}</span>;
}

function SeasonPass({ season }: { season: SeasonDef }) {
  const { engine } = useGame();
  const trackId = `season_${season.id}`;
  const xp = engine.passXp(trackId);
  const level = engine.passLevel(trackId, season.pass);
  const max = season.pass.length;
  const next = season.pass.find((l) => l.level === level + 1);
  const premium = engine.hasPremiumPass(trackId);
  const xpToNext = next ? Math.max(0, parseFloat(next.xp) - parseFloat(xp.toString())) : 0;

  return (
    <div className="pass-box">
      <div className="pass-head">
        <strong>PASSE DA TEMPORADA</strong>
        <span className={premium ? 'pass-premium' : 'muted small'}>{premium ? '💎 Premium' : 'Trilha grátis'}</span>
        <span className="muted small">Nível {level}/{max} · {xp.toFixed(0)} XP{next ? ` · +${xpToNext.toFixed(0)} p/ ${level + 1}` : ''}</span>
      </div>
      <div className="progress slim"><div className="progress-fill" style={{ width: `${(level / max) * 100}%` }} /></div>
      <div className="pass-levels">
        {season.pass.map((l) => {
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
                  <button className="btn btn-xs" disabled={!canClaim('free')} onClick={() => { if (engine.claimPassReward(trackId, season.pass, l.level, 'free').ok) audio.quest(); }}>
                    {canClaim('free') ? 'Coletar' : '—'}
                  </button>
                )}
                {l.premium && (
                  <button className="btn btn-xs btn-primary" disabled={!premium || !canClaim('premium')} title={premium ? '' : 'Adquira o passe premium'} onClick={() => { if (engine.claimPassReward(trackId, season.pass, l.level, 'premium').ok) audio.levelUp(); }}>
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

export function SeasonHub() {
  const { engine } = useGame();
  const nowMs = useNow(1000);
  const season = activeSeason(nowMs) ?? SEASONS[0];
  const status = seasonStatus(season, nowMs);
  const remaining = seasonRemaining(season, nowMs);
  const p = countdownParts(remaining);

  if (status === 'upcoming') {
    return (
      <div className="screen">
        <Panel title="Temporada" icon="🌟">
          <EmptyState icon="🌟" text={`A Temporada ${season.number} — ${season.name} começa em ${p.d}d ${p.h}h ${p.m}m.`} />
        </Panel>
      </div>
    );
  }

  return (
    <div className="screen">
      <Panel title={`Temporada ${season.number} — ${season.name}`} icon={season.icon} className="season-hero" right={<span className={`status-chip ${status === 'live' ? 'st-live' : 'st-ended'}`}>{status === 'live' ? 'ATIVA' : 'ENCERRADA'}</span>}>
        <div className="season-hero-inner" style={{ background: season.gradient }}>
          <span className="season-icon">{season.icon}</span>
          <div>
            <h3>{season.theme}</h3>
            <p className="muted small">{season.desc}</p>
            <p className="muted small">🏆 Título da temporada: <strong>{season.titleReward}</strong> · Skins: {season.skinIds.length}</p>
          </div>
        </div>
        {status === 'live' && (
          <div className="season-countdown">
            <span className="muted small">Faltam</span>
            <div className="countdown-big">
              {([['DIAS', p.d], ['HORAS', p.h], ['MIN', p.m], ['SEG', p.s]] as [string, number][]).map(([label, v]) => (
                <div key={label} className="countdown-cell"><strong>{String(v).padStart(2, '0')}</strong><span>{label}</span></div>
              ))}
            </div>
            <p className="muted small">Ganhe XP de temporada clicando no Núcleo.</p>
          </div>
        )}
      </Panel>

      {status === 'live' && <SeasonPass season={season} />}

      <Panel title="Skins da temporada" icon="🎨">
        <div className="season-skins">
          {season.skinIds.map((id) => {
            const owned = engine.isSkinOwned(id);
            const name = id.replace(/_/g, ' ').toUpperCase();
            return (
              <div key={id} className={`season-skin ${owned ? '' : 'locked'}`}>
                <span>{owned ? '✅' : '🔒'}</span>
                <strong className="muted small">{name}</strong>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Lore" icon="📖">
        <p className="muted small">
          Na Temporada 4, a rede global despertou: servidores ganharam vida e o Núcleo precisa de você para sobreviver à sobrecarga.
          Complete o passe até o nível 10 para garantir o título <strong>{season.titleReward}</strong> e as skins exclusivas.
        </p>
      </Panel>

      <p className="muted small center">Temporadas futuras são cadastradas em src/content/seasons.ts. Countdown: {EventManager.formatRemaining(remaining)}.</p>
    </div>
  );
}
