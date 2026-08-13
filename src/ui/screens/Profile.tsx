import { useState, useSyncExternalStore } from 'react';
import { useGame } from '../context';
import { Panel, StatRow, TabBar } from '../kit';
import { TITLES, TITLE_MAP } from '../../progression/titles';
import { ACHIEVEMENTS } from '../../achievements/achievements';
import { formatDuration } from '../../core/notation';
import { audio } from '../../audio/audio';
import { equippedSkin } from '../../content/skins';
import { AVATAR_CATALOG, type AvatarItem } from '../../profile/avatars';
import { statusOf, STATUS_PRESETS } from '../../profile/status';
import { GameConfig } from '../../config/GameConfig';
import { getSessionSnapshot, subscribeAccountSession } from '../../online/account';
import { copyProfileLink } from '../../online/friends';
import { bus } from '../../core/events';

function AvatarPicker({ items, value, onPick, disabled, onBuy }: { items: AvatarItem[]; value: string; onPick: (id: string) => void; disabled: (id: string) => boolean; onBuy?: (id: string, currency: 'credits' | 'diamonds') => void }) {
  return (
    <div className="avatar-picker">
      {items.map((it) => {
        const locked = disabled(it.id);
        const active = value === it.id;
        const buyCredit = onBuy && it.creditCost && locked;
        const buyDiamond = onBuy && it.diamondCost && locked;
        return (
          <div key={it.id} className="avatar-slot">
            <button className={`avatar-option ${active ? 'active' : ''} ${locked ? 'locked' : ''}`} disabled={locked} onClick={() => onPick(it.id)} title={it.label}>
              {locked ? '🔒' : it.value || '·'}
            </button>
            {buyCredit && (
              <button className="avatar-buy-btn" title={`Comprar ${it.label} com ${it.creditCost} créditos 💳`} onClick={() => onBuy!(it.id, 'credits')}>
                💳{it.creditCost}
              </button>
            )}
            {buyDiamond && (
              <button className="avatar-buy-btn diamond" title={`Comprar ${it.label} com ${it.diamondCost} diamantes 💎`} onClick={() => onBuy!(it.id, 'diamonds')}>
                💎{it.diamondCost}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Profile() {
  const { engine, fmt } = useGame();
  const s = engine.state;
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('perfil');
  const [msg, setMsg] = useState('');
  const skin = equippedSkin(s);
  const pf = skin.visual.profile;
  const bn = skin.visual.banner;
  const [name, setName] = useState(s.name);

  const prof = s.profile;
  const st = statusOf(prof.status as Parameters<typeof statusOf>[0]);
  const equippedTitle = s.equippedTitle ? TITLE_MAP[s.equippedTitle] : undefined;
  const icon = AVATAR_CATALOG.icons.find((i) => i.id === prof.avatarIcon)?.value ?? '⚡';
  // link público do perfil: só existe para quem tem conta (o snapshot vai ao servidor com o save)
  const account = useSyncExternalStore(subscribeAccountSession, getSessionSnapshot);

  return (
    <div className="screen">
      {/* ── Cartão do jogador ── */}
      <div className="player-card">
        {bn && <div className="profile-banner" style={{ background: bn.bg, color: bn.text }}>⚡ BANNER DO JOGADOR</div>}
        <div className="profile-head">
          <div className={`avatar avatar-lg ${AVATAR_CATALOG.frames.find((f) => f.id === prof.avatarFrame)?.value ?? ''} ${AVATAR_CATALOG.effects.find((e) => e.id === prof.avatarEffect)?.value ?? ''}`} style={pf ? { borderColor: pf.border } : undefined}>
            {icon}
          </div>
          <div className="profile-info">
            {editing ? (
              <div className="name-edit">
                <input value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
                <button className="btn btn-sm" onClick={() => { engine.state.name = name || 'Jogador'; setEditing(false); engine.notify('profile'); }}>OK</button>
              </div>
            ) : (
              <h2>{s.name} <button className="btn btn-xs ghost" onClick={() => { setName(s.name); setEditing(true); }}>✏️</button></h2>
            )}
            <div className="profile-level">
              <span>Nível <strong>{s.level}</strong></span>
              {equippedTitle && <span className="title-chip">{equippedTitle.icon} {equippedTitle.name}</span>}
              {AVATAR_CATALOG.badges.find((b) => b.id === prof.avatarBadge)?.value && <span className="title-chip">{AVATAR_CATALOG.badges.find((b) => b.id === prof.avatarBadge)?.value} Badge</span>}
            </div>
            <div className="profile-status">
              <span className="status-dot" style={{ background: st.color }} />
              <strong>{st.icon} {st.label}</strong>
              {prof.statusMessage && <em className="muted small">“{prof.statusMessage}”</em>}
            </div>
          </div>
          {account && (
            <button
              className="btn btn-sm share-profile-btn"
              title="Copia o link do seu perfil público — amigos abrem direto no jogo"
              onClick={() => {
                void copyProfileLink(account.username).then((ok) => {
                  bus.emit('notify', {
                    kind: 'default',
                    title: ok ? '🔗 Link do perfil copiado!' : '⚠️ Não foi possível copiar',
                    desc: ok ? 'Compartilhe com amigos — eles abrem o seu perfil no jogo.' : `Copie a URL do jogo com ?profile=${account.username}`,
                  });
                });
              }}
            >
              🔗 Compartilhar perfil
            </button>
          )}
        </div>
      </div>

      <Panel title="Perfil" icon="👤" right={<span className="muted small">STATUS: {st.icon} {st.label.toUpperCase()} · somente local</span>}>
        <TabBar
          tabs={[
            { id: 'perfil', name: 'Perfil', icon: '👤' },
            { id: 'avatar', name: 'Avatar', icon: '🎨' },
            { id: 'status', name: 'Status', icon: '🟢' },
            { id: 'titulos', name: 'Títulos', icon: '🎖️' },
            { id: 'resumo', name: 'Resumo', icon: '📋' },
            { id: 'privacidade', name: 'Privacidade', icon: '🔒' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'perfil' && (
          <div>
            <StatRow label="Tempo jogado" value={formatDuration(s.playTimeSeconds)} icon="⏱️" />
            <StatRow label="Cliques totais" value={fmt(s.stats.clicks ?? '0', 0)} icon="🖱️" />
            <StatRow label="Energia produzida" value={fmt(s.stats.energyProduced ?? '0', 0)} icon="⚡" />
            <StatRow label="Moedas ganhas" value={fmt(s.stats.goldEarned ?? '0', 0)} icon="🪙" />
            <StatRow label="Prestígios" value={s.prestige.count} icon="🌀" />
            <StatRow label="Ascensões" value={s.ascension.count} icon="👑" />
            <StatRow label="Pets coletados" value={Object.keys(s.pets).length} icon="🐾" />
            <StatRow label="Conquistas" value={`${Object.keys(s.achievements).length}/${ACHIEVEMENTS.length}`} icon="🏆" />
            <StatRow label="Maior clique" value={fmt(s.stats.biggestClick ?? '0', 0)} icon="💥" />
          </div>
        )}

        {tab === 'avatar' && (
          <div className="avatar-custom">
            <h4>Ícone</h4>
            <AvatarPicker
              items={AVATAR_CATALOG.icons}
              value={prof.avatarIcon}
              onPick={(id) => engine.setAvatarIcon(id)}
              disabled={(id) => !engine.avatarItemAvailable(AVATAR_CATALOG.icons, id)}
              onBuy={(id, cur) => { const r = engine.buyAvatarItem('icons', id, cur); if (r.ok) audio.buy(); else setMsg(r.reason ?? ''); }}
            />
            <h4>Moldura</h4>
            <AvatarPicker
              items={AVATAR_CATALOG.frames}
              value={prof.avatarFrame}
              onPick={(id) => engine.setAvatarFrame(id)}
              disabled={(id) => !engine.avatarItemAvailable(AVATAR_CATALOG.frames, id)}
              onBuy={(id, cur) => { const r = engine.buyAvatarItem('frames', id, cur); if (r.ok) audio.buy(); else setMsg(r.reason ?? ''); }}
            />
            <h4>Efeito</h4>
            <AvatarPicker
              items={AVATAR_CATALOG.effects}
              value={prof.avatarEffect}
              onPick={(id) => engine.setAvatarEffect(id)}
              disabled={(id) => !engine.avatarItemAvailable(AVATAR_CATALOG.effects, id)}
              onBuy={(id, cur) => { const r = engine.buyAvatarItem('effects', id, cur); if (r.ok) audio.buy(); else setMsg(r.reason ?? ''); }}
            />
            <h4>Badge</h4>
            <AvatarPicker
              items={AVATAR_CATALOG.badges}
              value={prof.avatarBadge}
              onPick={(id) => engine.setAvatarBadge(id)}
              disabled={(id) => !engine.avatarItemAvailable(AVATAR_CATALOG.badges, id)}
              onBuy={(id, cur) => { const r = engine.buyAvatarItem('badges', id, cur); if (r.ok) audio.buy(); else setMsg(r.reason ?? ''); }}
            />
            <p className="muted small">Avatares premium podem ser <strong>comprados com créditos 💳</strong> ou <strong>diamantes 💎</strong> (botão abaixo do item) ou liberados com o Passe Premium (tela Passe). Itens 🔒 sem preço exigem progresso. Você tem {fmt(engine.getRes('credits'), 0)} 💳 e {fmt(engine.getRes('crystals'), 0)} 💎.</p>
          </div>
        )}

        {tab === 'status' && (
          <div>
            <h4>Selecione seu status</h4>
            <div className="status-grid">
              {STATUS_PRESETS.map((p) => (
                <button key={p.id} className={`chip-btn ${prof.status === p.id ? 'active' : ''}`} onClick={() => { engine.setStatus(p.id); audio.ui(); }}>
                  {p.icon} {p.label}
                </button>
              ))}
            </div>
            <h4 style={{ marginTop: 14 }}>Mensagem personalizada (máx. {GameConfig.status.maxMessageLength} caracteres)</h4>
            <div className="name-edit">
              <input value={msg} maxLength={GameConfig.status.maxMessageLength} placeholder="Farmando para o próximo Prestígio…" onChange={(e) => setMsg(e.target.value)} />
              <button className="btn btn-sm" onClick={() => { engine.setStatusMessage(msg); audio.ui(); }}>Salvar</button>
            </div>
            {prof.statusMessage && <p className="muted small">Atual: “{prof.statusMessage}”</p>}
            <p className="muted small">⚠ O status é exibido apenas localmente — este jogo é offline e não envia nada.</p>
          </div>
        )}

        {tab === 'titulos' && (
          <div className="title-grid">
            {TITLES.map((t) => {
              const unlocked = s.titles.includes(t.id);
              const equipped = s.equippedTitle === t.id;
              return (
                <div key={t.id} className={`title-card ${unlocked ? '' : 'locked'} ${equipped ? 'equipped' : ''}`}>
                  <span className="title-icon">{t.icon}</span>
                  <strong>{t.name}</strong>
                  <p className="muted small">{t.desc}</p>
                  {unlocked ? (
                    <button className={`btn btn-xs ${equipped ? 'ghost' : 'btn-primary'}`} disabled={equipped} onClick={() => { engine.equipTitle(equipped ? null : t.id); audio.levelUp(); }}>
                      {equipped ? 'Equipado' : 'Equipar'}
                    </button>
                  ) : (
                    <span className="locked-text">🔒 Bloqueado</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {tab === 'resumo' && (
          <div>
            <StatRow label="Prestígio — fragmentos totais" value={fmt(s.prestige.totalFragments ?? '0', 0)} icon="🌀" />
            <StatRow label="Ascensões — mundos desbloqueados" value={s.ascension.worldsUnlocked} icon="🌍" />
            <StatRow label="Transcendências" value={s.transcendence.count} icon="✨" />
            <StatRow label="Títulos desbloqueados" value={`${s.titles.length}/${TITLES.length}`} icon="🎖️" />
            <StatRow label="Skins reveladas" value={`${s.skins.owned.length}`} icon="🎨" />
            <StatRow label="Passe Premium" value={s.premiumPass.owned ? `Ativo · Nível ${engine.premiumPassLevel()}` : 'Não adquirido'} icon="💎" />
            <p className="muted small">Estatísticas detalhadas na tela 📊 Estatísticas.</p>
          </div>
        )}

        {tab === 'privacidade' && (
          <div>
            <p className="muted small">Escolha quem poderá ver cada parte do seu perfil quando o jogo ganhar recursos online. Hoje tudo é local.</p>
            {([['profile', 'Perfil'], ['stats', 'Estatísticas'], ['achievements', 'Conquistas'], ['title', 'Título'], ['collection', 'Coleção'], ['pass', 'Passe'], ['status', 'Status']] as const).map(([key, name]) => (
              <label key={key} className="setting-row">
                <span>{name}</span>
                <select value={s.settings.privacy[key]} onChange={(e) => engine.updateSettingsBlock('privacy', { [key]: e.target.value as any })}>
                  <option value="public">Público</option>
                  <option value="private">Privado</option>
                  <option value="local">Somente local</option>
                </select>
              </label>
            ))}
            <p className="muted small">🛡️ Nenhuma credencial é armazenada no cliente além do seu PIN de administrador (hash local, tela Admin).</p>
          </div>
        )}
      </Panel>
    </div>
  );
}
