/**
 * Amigos — lista de amigos da conta com presença ao vivo e perfil público
 * (visível apenas para amigos).
 *
 * - Adicionar por nome de usuário (solicitação → aceite → amizade mútua);
 * - Presença ao vivo: o amigo fica "online" enquanto o heartbeat dele sinaliza
 *   (TTL de 3 min no servidor) e "offline" com o último horário visto;
 * - Perfil do amigo: avatar, status, mensagem, nível e prestígios — snapshot
 *   público enviado junto do save da conta (sem dados sensíveis).
 *
 * A lista se atualiza a cada 30s e após cada ação.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Panel, Modal, EmptyState } from '../kit';
import { useGame } from '../context';
import { audio } from '../../audio/audio';
import { getSessionSnapshot, subscribeAccountSession } from '../../online/account';
import { onlineEnabled } from '../../online/api';
import {
  fetchFriends, addFriend, acceptFriend, declineFriend, removeFriend, sendGift, claimGift,
  type FriendsData, type FriendInfo, type GiftItem,
} from '../../online/friends';
import { AVATAR_CATALOG } from '../../profile/avatars';
import { STATUS_PRESETS, type StatusPreset } from '../../profile/status';

/** Intervalo do refresh da presença (mesmo ritmo do heartbeat do amigo: 3 min de TTL). */
const REFRESH_MS = 30_000;

function avatarEmoji(id: string): string {
  return AVATAR_CATALOG.icons.find((i) => i.id === id)?.value ?? '⚡';
}

function statusColor(id: string): string {
  return STATUS_PRESETS.find((s) => s.id === (id as StatusPreset))?.color ?? '#9aa5b1';
}

function formatWhen(ts: number): string {
  if (!ts) return 'nunca';
  return new Date(ts).toLocaleString('pt-BR');
}

export function Friends() {
  const session = useSyncExternalStore(subscribeAccountSession, getSessionSnapshot);
  const online = onlineEnabled();
  const [data, setData] = useState<FriendsData | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [addName, setAddName] = useState('');
  const [selected, setSelected] = useState<FriendInfo | null>(null);
  /** Alvo da confirmação de remover/cancelar: nome de exibição + se é só solicitação. */
  const [removing, setRemoving] = useState<{ username: string; label: string; isRequest: boolean } | null>(null);
  // ── presentes entre amigos ──
  const { engine } = useGame();
  const [giftTarget, setGiftTarget] = useState<FriendInfo | null>(null);
  const [giftKind, setGiftKind] = useState<'credits' | 'box'>('credits');
  const [giftQty, setGiftQty] = useState(10);
  const [giftBox, setGiftBox] = useState<'basic' | 'rare' | 'event'>('basic');
  const [claiming, setClaiming] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!session || !online) return;
    const r = await fetchFriends();
    if (r.ok) setData(r);
    else if (r.status === 401) setData({ friends: [], incoming: [], outgoing: [], inbox: [], giftCooldownLeftMs: 0 });
  }, [session, online]);

  // ao trocar de conta, zera a lista ANTES do fetch novo — nunca exibe os
  // amigos da conta anterior (janela de stale data)
  useEffect(() => {
    setData(null);
    setMsg(null);
  }, [session]);

  useEffect(() => {
    if (!session) return; // sem sessão não há o que buscar
    void refresh();
    const iv = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(iv);
  }, [refresh, session]);

  function flash(kind: 'ok' | 'err', text: string) {
    setMsg({ kind, text });
  }

  async function handleAdd() {
    const name = addName.trim().toLowerCase();
    if (!name) { flash('err', 'Digite o nome de usuário.'); return; }
    setBusy(true);
    setMsg(null);
    const r = await addFriend(name);
    setBusy(false);
    if (!r.ok) { flash('err', r.reason ?? 'Falha ao adicionar'); return; }
    flash('ok', r.status === 'friends'
      ? `${name} já tinha te adicionado — vocês agora são amigos! 🎉`
      : `Solicitação enviada para ${name}.`);
    setAddName('');
    void refresh();
  }

  async function handleAccept(username: string) {
    const r = await acceptFriend(username);
    if (!r.ok) flash('err', r.reason ?? 'Falha ao aceitar');
    void refresh();
  }

  async function handleDecline(username: string) {
    const r = await declineFriend(username);
    if (!r.ok) flash('err', r.reason ?? 'Falha ao recusar');
    void refresh();
  }

  async function handleRemove() {
    if (!removing) return;
    const target = removing;
    setRemoving(null);
    setBusy(true);
    const r = await removeFriend(target.username);
    setBusy(false);
    if (!r.ok) { flash('err', r.reason ?? 'Falha ao remover'); return; }
    void refresh();
  }

  async function handleSendGift() {
    if (!giftTarget) return;
    setBusy(true);
    setMsg(null);
    const r = await sendGift(giftTarget.username, giftKind, giftQty, giftKind === 'box' ? giftBox : undefined);
    setBusy(false);
    if (!r.ok) { flash('err', r.reason ?? 'Falha ao enviar presente'); return; }
    audio.ui();
    flash('ok', giftKind === 'credits'
      ? `🎁 ${giftQty} créditos 💳 enviados para ${giftTarget.name || giftTarget.username}!`
      : `🎁 ${giftQty} caixa(s) 📦 enviadas para ${giftTarget.name || giftTarget.username}!`);
    setGiftTarget(null);
    void refresh();
  }

  async function handleClaimGift(g: GiftItem) {
    setClaiming(g.id);
    const r = await claimGift(g.id);
    setClaiming(null);
    if (!r.ok) { flash('err', r.reason ?? 'Falha ao resgatar presente'); void refresh(); return; }
    if (r.reward && engine) {
      engine.grantRewards(r.reward as Parameters<typeof engine.grantRewards>[0]);
      flash('ok', `🎁 Presente de ${r.from} resgatado!`);
      audio.gift();
    }
    void refresh();
  }

  const friends = data?.friends ?? [];
  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];
  const inbox = data?.inbox ?? [];
  const cooldownMs = data?.giftCooldownLeftMs ?? 0;
  const cooldownLabel = cooldownMs > 0
    ? cooldownMs >= 3600000
      ? `${Math.ceil(cooldownMs / 3600000)}h`
      : `${Math.ceil(cooldownMs / 60000)}min`
    : '';

  return (
    <div className="screen">
      <Panel
        title="Amigos"
        icon="👥"
        right={
          <span className="muted small">
            {friends.length} amigo(s) · {incoming.length} solicitação(ões)
          </span>
        }
      >
        {!online ? (
          <p className="muted small settings-err">⚪ Backend não configurado — configure a URL do servidor para usar amigos.</p>
        ) : !session ? (
          <p className="muted small settings-err">🔒 Conecte sua conta na tela <strong>Conta</strong> para adicionar amigos e ver quem está online.</p>
        ) : (
          <>
            {/* ── adicionar amigo ── */}
            <div className="friend-add-row">
              <input
                className="settings-text-input"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
                placeholder="nome_de_usuario"
                maxLength={20}
                disabled={busy}
              />
              <button className="btn btn-sm btn-primary" disabled={busy || !addName.trim()} onClick={() => void handleAdd()}>
                {busy ? 'Enviando…' : '＋ Adicionar'}
              </button>
            </div>
            <p className="muted small">A amizade só fica ativa depois que a pessoa aceitar sua solicitação.</p>
            {msg && <p className={`muted small ${msg.kind === 'ok' ? 'settings-ok' : 'settings-err'}`}>{msg.text}</p>}

            {/* ── solicitações recebidas ── */}
            {incoming.length > 0 && (
              <>
                <h4>📨 Solicitações recebidas</h4>
                <div className="friend-list">
                  {incoming.map((u) => (
                    <div key={u} className="friend-row">
                      <span className="friend-avatar">👤</span>
                      <span className="friend-main">
                        <strong>{u}</strong>
                        <small className="muted">quer ser seu amigo</small>
                      </span>
                      <span className="friend-actions">
                        <button className="btn btn-xs btn-primary" disabled={busy} onClick={() => void handleAccept(u)}>Aceitar</button>
                        <button className="btn btn-xs ghost" disabled={busy} onClick={() => void handleDecline(u)}>Recusar</button>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── amigos ── */}
            <h4>🌟 Meus amigos</h4>
            {friends.length === 0 ? (
              <EmptyState icon="👥" text="Nenhum amigo ainda — adicione alguém pelo nome de usuário." />
            ) : (
              <div className="friend-list">
                {friends.map((f) => (
                  <div key={f.username} className="friend-row">
                    <span
                      className="friend-avatar"
                      style={{ borderColor: f.online ? '#3ddc84' : 'transparent' }}
                      title={f.online ? 'Online agora' : `Visto por último em ${formatWhen(f.lastSeenAt)}`}
                    >
                      {avatarEmoji(f.avatarIcon)}
                    </span>
                    <span className="friend-main">
                      <strong>{f.name || f.username}</strong>
                      <small className="muted">
                        <span
                          className="friend-dot"
                          style={{ background: f.online ? statusColor(f.status) : '#9aa5b1' }}
                        />
                        {f.online ? 'Online' : `visto ${formatWhen(f.lastSeenAt)}`}
                        {f.statusMessage ? ` · “${f.statusMessage}”` : ''}
                      </small>
                    </span>                      <span className="friend-actions">
                        <button className="btn btn-xs ghost" disabled={busy} title={cooldownLabel ? `Presente disponível em ${cooldownLabel}` : 'Enviar presente'} onClick={() => setGiftTarget(f)}>🎁</button>
                        <button className="btn btn-xs ghost" disabled={busy} onClick={() => setSelected(f)}>👁 Perfil</button>
                        <button className="btn btn-xs ghost" disabled={busy} onClick={() => setRemoving({ username: f.username, label: f.name || f.username, isRequest: false })}>✕</button>
                      </span>
                  </div>
                ))}
              </div>
            )}

            {/* ── solicitações enviadas ── */}
            {outgoing.length > 0 && (
              <>
                <h4>⏳ Enviadas (aguardando aceite)</h4>
                <div className="friend-list">
                  {outgoing.map((u) => (
                    <div key={u} className="friend-row">
                      <span className="friend-avatar">👤</span>
                      <span className="friend-main">
                        <strong>{u}</strong>
                        <small className="muted">solicitação pendente</small>
                      </span>
                      <span className="friend-actions">
                        <button className="btn btn-xs ghost" disabled={busy} onClick={() => setRemoving({ username: u, label: u, isRequest: true })}>Cancelar</button>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── presentes recebidos (gifts entre amigos) ── */}
            <h4>🎁 Presentes recebidos</h4>
            {inbox.length === 0 ? (
              <p className="muted small">
                Nenhum presente ainda. Envie para um amigo (cooldown de 6h{cooldownLabel ? ` — próximo em ${cooldownLabel}` : ''}) e resgate os que receber!
              </p>
            ) : (
              <div className="friend-list">
                {inbox.map((g) => (
                  <div key={g.id} className="friend-row">
                    <span className="friend-avatar">{g.kind === 'credits' ? '💳' : '📦'}</span>
                    <span className="friend-main">
                      <strong>
                        {g.kind === 'credits'
                          ? `${g.qty} créditos 💳`
                          : `${g.qty} caixa${g.qty > 1 ? 's' : ''} ${g.boxId ?? 'basic'} 📦`}
                      </strong>
                      <small className="muted">de {g.from} · {new Date(g.at).toLocaleDateString('pt-BR')}</small>
                    </span>
                    <span className="friend-actions">
                      <button className="btn btn-xs btn-primary" disabled={claiming === g.id} onClick={() => void handleClaimGift(g)}>
                        {claiming === g.id ? '…' : '🎁 Resgatar'}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Panel>

      {/* ── enviar presente ── */}
      <Modal open={giftTarget !== null} onClose={() => setGiftTarget(null)} title={giftTarget ? `🎁 Presente para ${giftTarget.name || giftTarget.username}` : ''}>
        {giftTarget && (
          <div className="gift-box">
            <p className="muted small" style={{ marginTop: 0 }}>
              Presentes são resgatados pelo amigo na tela de Amigos dele. Cooldown de 6h entre envios.
            </p>
            <div className="gift-kind-tabs">
              <button className={`chip-btn ${giftKind === 'credits' ? 'active' : ''}`} onClick={() => setGiftKind('credits')}>💳 Créditos</button>
              <button className={`chip-btn ${giftKind === 'box' ? 'active' : ''}`} onClick={() => setGiftKind('box')}>📦 Caixas</button>
            </div>
            {giftKind === 'credits' ? (
              <div className="gift-options">
                {[5, 10, 25, 50, 100].map((q) => (
                  <button key={q} className={`chip-btn ${giftQty === q ? 'active' : ''}`} onClick={() => setGiftQty(q)}>{q} 💳</button>
                ))}
              </div>
            ) : (
              <>
                <div className="gift-options">
                  {([['basic', '📦 Básica'], ['rare', '✨ Rara'], ['event', '🎉 Evento']] as const).map(([id, label]) => (
                    <button key={id} className={`chip-btn ${giftBox === id ? 'active' : ''}`} onClick={() => setGiftBox(id)}>{label}</button>
                  ))}
                </div>
                <div className="gift-options">
                  {[1, 2, 3].map((q) => (
                    <button key={q} className={`chip-btn ${giftQty === q ? 'active' : ''}`} onClick={() => setGiftQty(q)}>{q}×</button>
                  ))}
                </div>
              </>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={() => setGiftTarget(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                disabled={busy || cooldownMs > 0}
                title={cooldownLabel ? `Próximo presente em ${cooldownLabel}` : ''}
                onClick={() => void handleSendGift()}
              >
                {busy ? 'Enviando…' : cooldownLabel ? `Aguarde ${cooldownLabel}` : '🎁 Enviar presente'}
              </button>
            </div>
            {cooldownMs > 0 && <p className="muted small">Você pode enviar outro presente em {cooldownLabel}.</p>}
          </div>
        )}
      </Modal>

      {/* ── perfil do amigo ── */}
      <Modal open={selected !== null} onClose={() => setSelected(null)} title={selected ? `Perfil de ${selected.name || selected.username}` : ''}>
        {selected && (
          <div className="friend-profile">
            <div className="friend-profile-head">
              <span className="friend-avatar-big">{avatarEmoji(selected.avatarIcon)}</span>
              <div>
                <strong>{selected.name || selected.username}</strong>
                <div className="muted small">@{selected.username}</div>
              </div>
              <span
                className={`friend-presence ${selected.online ? 'friend-online' : ''}`}
                style={selected.online ? { background: statusColor(selected.status) } : {}}
              >
                {selected.online ? 'Online agora' : `Visto em ${formatWhen(selected.lastSeenAt)}`}
              </span>
            </div>
            {selected.statusMessage && <p className="muted">“{selected.statusMessage}”</p>}
            <div className="stats-grid" style={{ margin: '12px 0 0' }}>
              <div className="stat-card">
                <span className="stat-icon">📈</span>
                <strong>Nível {selected.level}</strong>
                <span className="muted small">progresso</span>
              </div>
              <div className="stat-card">
                <span className="stat-icon">🌀</span>
                <strong>{selected.prestige}</strong>
                <span className="muted small">prestígios</span>
              </div>
            </div>
            <p className="muted small" style={{ marginTop: 12 }}>
              Perfil visível apenas para amigos — sem dados do save, só o resumo público.
            </p>
          </div>
        )}
      </Modal>

      {/* ── confirmar remoção / cancelamento ── */}
      <Modal open={removing !== null} onClose={() => setRemoving(null)} title={removing?.isRequest ? 'Cancelar solicitação' : 'Remover amigo'}>
        {removing && (
          <>
            {removing.isRequest ? (
              <p className="muted">
                Cancelar a solicitação de amizade para <strong>{removing.label}</strong>? A solicitação
                enviada é retirada.
              </p>
            ) : (
              <p className="muted">
                Remover <strong>{removing.label}</strong> da sua lista de amigos? A amizade é desfeita dos
                dois lados — será preciso uma nova solicitação para voltar.
              </p>
            )}
            <div className="modal-actions">
              <button className="btn" onClick={() => setRemoving(null)}>Cancelar</button>
              <button className="btn btn-danger" disabled={busy} onClick={() => void handleRemove()}>
                {removing.isRequest ? 'Cancelar' : 'Remover'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
