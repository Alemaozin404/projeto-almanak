/**
 * Amigos — lista de amigos da conta com presença ao vivo e perfil público
 * (visível apenas para amigos).
 *
 * Amizade é confirmada pelos dois lados (server/accounts.js): A adiciona B →
 * solicitação pendente; B aceita (ou adiciona A de volta) → amizade mútua.
 * A presença vem do heartbeat com a sessão (o amigo some do "online" 3 min
 * depois de fechar o jogo) e o perfil (nome/avatar/status/nível) do snapshot
 * que o app envia junto do save da conta.
 */
import { apiFetch, apiJson, serverUrl } from './api';
import { getSession } from './account';

export interface FriendInfo {
  username: string;
  name: string;
  avatarIcon: string;
  status: string;
  statusMessage: string;
  level: number;
  prestige: number;
  /** Online agora (presença nos últimos 3 min via heartbeat). */
  online: boolean;
  lastSeenAt: number;
  /** playerId (createdAt do save) do amigo — 0 se ainda não sincronizou. */
  playerId?: number;
}

export interface FriendsData {
  friends: FriendInfo[];
  /** Solicitações que RECEBI (aguardando meu aceite). */
  incoming: string[];
  /** Solicitações que ENVIEI (aguardando o aceite do outro). */
  outgoing: string[];
}

export type FriendsResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; reason: string; status?: number };

/** Header de sessão (se houver conta conectada nesta máquina). */
function sessionHeaders(): Record<string, string> {
  const s = getSession();
  return s ? { 'x-account-token': s.token } : {};
}

/**
 * Perfil público de qualquer jogador via deep link (/?profile=<usuario>) —
 * mesma forma do perfil que os amigos veem, sem exigir amizade/sessão.
 */
export async function fetchPublicProfile(username: string): Promise<FriendsResult<{ profile: FriendInfo }>> {
  try {
    const res = await apiFetch(`/api/profile/${encodeURIComponent(username.trim().toLowerCase())}`);
    const data = await apiJson<{ ok?: boolean; reason?: string; profile?: FriendInfo }>(res);
    if (!res.ok || data?.ok !== true || !data.profile) {
      return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})`, status: res.status };
    }
    return { ok: true, profile: data.profile };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

/** Link público do seu perfil (para compartilhar: ?profile=<usuario>). */
export function buildProfileLink(username: string): string {
  const base = serverUrl().replace(/\/$/, '');
  return `${base}/?profile=${encodeURIComponent(username.trim().toLowerCase())}`;
}

/** Lê o parâmetro ?profile= da URL atual ('' se não houver). */
export function profileFromUrl(): string {
  try {
    return new URLSearchParams(window.location.search).get('profile')?.trim().toLowerCase() ?? '';
  } catch {
    return '';
  }
}

/** Copia o link do perfil para a área de transferência (retorna se funcionou). */
export async function copyProfileLink(username: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildProfileLink(username));
    return true;
  } catch {
    return false;
  }
}

/** Lista amigos + solicitações, com presença e perfil de cada amigo. */
export async function fetchFriends(): Promise<FriendsResult<FriendsData>> {
  try {
    const res = await apiFetch('/api/friends', { headers: sessionHeaders() });
    const data = await apiJson<{ ok?: boolean; reason?: string; friends?: FriendInfo[]; incoming?: string[]; outgoing?: string[] }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})`, status: res.status };
    return {
      ok: true,
      friends: Array.isArray(data.friends) ? data.friends : [],
      incoming: Array.isArray(data.incoming) ? data.incoming : [],
      outgoing: Array.isArray(data.outgoing) ? data.outgoing : [],
    };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

/** Adiciona um amigo por usuário. status: 'pending' | 'friends' (mútuo na hora). */
export async function addFriend(username: string): Promise<FriendsResult<{ status?: string }>> {
  try {
    const res = await apiFetch('/api/friends/add', {
      method: 'POST',
      headers: sessionHeaders(),
      body: JSON.stringify({ username }),
    });
    const data = await apiJson<{ ok?: boolean; reason?: string; status?: string }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})`, status: res.status };
    return { ok: true, status: data.status };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

/** Aceita uma solicitação recebida → vira amigo. */
export async function acceptFriend(username: string): Promise<FriendsResult> {
  try {
    const res = await apiFetch('/api/friends/accept', {
      method: 'POST',
      headers: sessionHeaders(),
      body: JSON.stringify({ username }),
    });
    const data = await apiJson<{ ok?: boolean; reason?: string }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})`, status: res.status };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

/** Recusa uma solicitação recebida. */
export async function declineFriend(username: string): Promise<FriendsResult> {
  try {
    const res = await apiFetch('/api/friends/decline', {
      method: 'POST',
      headers: sessionHeaders(),
      body: JSON.stringify({ username }),
    });
    const data = await apiJson<{ ok?: boolean; reason?: string }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})`, status: res.status };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

/** Remove amigo ou cancela solicitação (enviada ou recebida). */
export async function removeFriend(username: string): Promise<FriendsResult> {
  try {
    const res = await apiFetch('/api/friends/remove', {
      method: 'POST',
      headers: sessionHeaders(),
      body: JSON.stringify({ username }),
    });
    const data = await apiJson<{ ok?: boolean; reason?: string }>(res);
    if (!res.ok || data?.ok !== true) return { ok: false, reason: data?.reason ?? `Servidor recusou (${res.status})`, status: res.status };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}
