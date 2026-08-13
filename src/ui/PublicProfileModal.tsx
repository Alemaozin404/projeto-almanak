import { useEffect, useState } from 'react';
import { Modal } from './kit';
import { fetchPublicProfile, type FriendInfo } from '../online/friends';
import { AVATAR_CATALOG } from '../profile/avatars';

function avatarEmoji(id: string): string {
  return AVATAR_CATALOG.icons.find((i) => i.id === id)?.value ?? '⚡';
}

function formatWhen(ts: number): string {
  if (!ts) return 'desconhecido';
  return new Date(ts).toLocaleString('pt-BR');
}

/**
 * Perfil público aberto por deep link (/?profile=<usuario>) — o que um amigo
 * veria, sem exigir amizade/sessão. Só o resumo público, nunca o save.
 */
export function PublicProfileModal({ username, onClose }: { username: string; onClose: () => void }) {
  const [state, setState] = useState<'loading' | 'error' | 'ok'>('loading');
  const [profile, setProfile] = useState<FriendInfo | null>(null);

  useEffect(() => {
    let alive = true;
    setState('loading');
    void fetchPublicProfile(username).then((r) => {
      if (!alive) return;
      if (r.ok && r.profile) {
        setProfile(r.profile);
        setState('ok');
      } else {
        setState('error');
      }
    });
    return () => { alive = false; };
  }, [username]);

  return (
    <Modal open onClose={onClose} title="Perfil público">
      {state === 'loading' && <p className="muted">Carregando perfil…</p>}
      {state === 'error' && (
        <div className="friend-profile">
          <p>🙈 Perfil não encontrado.</p>
          <p className="muted small">
            O jogador pode não ter sincronizado o perfil ainda (abra o jogo e jogue um pouco) ou o link está errado.
          </p>
        </div>
      )}
      {state === 'ok' && profile && (
        <div className="friend-profile">
          <div className="friend-profile-head">
            <span className="friend-avatar-big">{avatarEmoji(profile.avatarIcon)}</span>
            <div>
              <strong>{profile.name || profile.username}</strong>
              <div className="muted small">@{profile.username}</div>
            </div>
            <span className={`friend-presence ${profile.online ? 'friend-online' : ''}`}>
              {profile.online ? 'Online agora' : `Visto em ${formatWhen(profile.lastSeenAt)}`}
            </span>
          </div>
          {profile.statusMessage && <p className="muted">“{profile.statusMessage}”</p>}
          <div className="stats-grid" style={{ margin: '12px 0 0' }}>
            <div className="stat-card">
              <span className="stat-icon">📈</span>
              <strong>Nível {profile.level}</strong>
              <span className="muted small">progresso</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon">🌀</span>
              <strong>{profile.prestige}</strong>
              <span className="muted small">prestígios</span>
            </div>
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>
            Perfil público — apenas o resumo, sem dados do save.
          </p>
        </div>
      )}
    </Modal>
  );
}
