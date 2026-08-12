/**
 * Amigos + perfil público — suíte de integração com o servidor REAL
 * (server/index.js + server/accounts.js, KV em memória, Gmail em modo dev).
 *
 * Cobre: adicionar (solicitação), aceitar (amizade mútua), confirmação na hora
 * quando o alvo já te adicionou, recusar, remover/cancelar, validações (self,
 * inexistente, sem token) e a PRESENÇA + PERFIL do amigo: o heartbeat com a
 * sessão registra o "online" (TTL de 3 min) e o push do save carrega o
 * snapshot público (nome, avatar, status, nível, prestígios).
 *
 * Os usuários são criados UMA vez no beforeAll e compartilhados pelos testes
 * (o servidor limita registros a 10/min por IP — criar 11 contas quebraria o
 * rate limit). Cada teste limpa as amizades que criou para não vazar estado.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../server/index.js';
import { GameConfig } from '../src/config/GameConfig';

interface FriendInfo {
  username: string;
  name: string;
  avatarIcon: string;
  status: string;
  statusMessage: string;
  level: number;
  prestige: number;
  online: boolean;
  lastSeenAt: number;
}

interface FriendsBody {
  ok?: boolean;
  reason?: string;
  friends?: FriendInfo[];
  incoming?: string[];
  outgoing?: string[];
  status?: string;
}

interface User {
  username: string;
  email: string;
  password: string;
  token: string;
}

describe('Amigos — adicionar, aceitar, presença e perfil público', () => {
  let server: Server;
  let baseUrl = '';
  const secret = GameConfig.wallet.appSharedSecret;
  let next = 0;
  let u1!: User;
  let u2!: User;
  let u3!: User;

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-secret': secret, ...headers },
      body: JSON.stringify(body),
    });

  const get = (path: string, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, { headers: { 'x-app-secret': secret, ...headers } });

  /** Registra (devCode) + verifica + loga um usuário novo; devolve a sessão. */
  async function makeUser(): Promise<User> {
    next += 1;
    const username = `amigo_${next}`;
    const email = `amigo${next}.test@gmail.com`;
    const password = 'senha-forte-123';
    const reg = await post('/api/account/register', { username, email, password });
    expect(reg.status).toBe(200);
    const regBody = (await reg.json()) as { ok?: boolean; devCode?: string };
    expect(regBody.devCode).toMatch(/^\d{6}$/);
    const ver = await post('/api/account/verify', { email, code: regBody.devCode });
    expect(ver.status).toBe(200);
    const login = await post('/api/account/login', { login: username, password });
    const loginBody = (await login.json()) as { ok?: boolean; token?: string };
    expect(loginBody.token).toMatch(/^[0-9a-f]{64}$/);
    return { username, email, password, token: loginBody.token! };
  }

  const tokenHeader = (token: string) => ({ 'x-account-token': token });

  async function friendsOf(token: string): Promise<FriendsBody> {
    const res = await get('/api/friends', tokenHeader(token));
    expect(res.status).toBe(200);
    return (await res.json()) as FriendsBody;
  }

  async function add(a: User, b: User): Promise<string | undefined> {
    const res = await post('/api/friends/add', { username: b.username }, tokenHeader(a.token));
    expect(res.status).toBe(200);
    return ((await res.json()) as FriendsBody).status;
  }

  beforeAll(async () => {
    // nunca toca o Upstash real (server/.env é carregado pelo dotenv)
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const app = createApp({
      MERCADO_PAGO_ACCESS_TOKEN: 'TEST-1234567890',
      MERCADO_PAGO_WEBHOOK_SECRET: 'test-webhook-secret',
      APP_SHARED_SECRET: secret,
      PORT: '0',
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('sem porta atribuída');
    baseUrl = `http://127.0.0.1:${addr.port}`;
    // 3 usuários compartilhados por toda a suíte (foge do rate limit de registro)
    u1 = await makeUser();
    u2 = await makeUser();
    u3 = await makeUser();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('adicionar cria solicitação; aceitar vira amizade mútua (solicitações limpas)', async () => {
    // A → B pendente (A.outgoing, B.incoming)
    expect(await add(u1, u2)).toBe('pending');

    const aState = await friendsOf(u1.token);
    expect(aState.outgoing).toEqual([u2.username]);
    expect(aState.friends).toHaveLength(0);
    const bState = await friendsOf(u2.token);
    expect(bState.incoming).toEqual([u1.username]);

    // B aceita → amigos dos dois lados, filas limpas
    const acc = await post('/api/friends/accept', { username: u1.username }, tokenHeader(u2.token));
    expect(acc.status).toBe(200);

    const aAfter = await friendsOf(u1.token);
    expect(aAfter.friends!.map((f) => f.username)).toEqual([u2.username]);
    expect(aAfter.outgoing).toEqual([]);
    expect(aAfter.incoming).toEqual([]);
    const bAfter = await friendsOf(u2.token);
    expect(bAfter.friends!.map((f) => f.username)).toEqual([u1.username]);
    expect(bAfter.incoming).toEqual([]);
    expect(bAfter.outgoing).toEqual([]);

    // limpeza: desfaz a amizade para o próximo teste
    await post('/api/friends/remove', { username: u2.username }, tokenHeader(u1.token));
  });

  it('adicionar quem JÁ te adicionou → amizade na hora (mútuo, sem fila pendente)', async () => {
    await add(u1, u3); // u1 → u3 pendente
    expect(await add(u3, u1)).toBe('friends'); // u3 → u1 encontra a contrária → mútuo

    const aState = await friendsOf(u1.token);
    expect(aState.friends!.map((f) => f.username)).toEqual([u3.username]);
    expect(aState.outgoing).toEqual([]);
    expect(aState.incoming).toEqual([]);
    // o outro lado também fica sem filas pendentes (a solicitação recebida some)
    const cState = await friendsOf(u3.token);
    expect(cState.friends!.map((f) => f.username)).toEqual([u1.username]);
    expect(cState.incoming).toEqual([]);
    expect(cState.outgoing).toEqual([]);

    await post('/api/friends/remove', { username: u3.username }, tokenHeader(u1.token));
  });

  it('recusar solicitação → some dos dois lados', async () => {
    await add(u2, u3);
    const dec = await post('/api/friends/decline', { username: u2.username }, tokenHeader(u3.token));
    expect(dec.status).toBe(200);

    expect((await friendsOf(u2.token)).outgoing).toEqual([]);
    expect((await friendsOf(u3.token)).incoming).toEqual([]);
  });

  it('remover amigo desfaz dos dois lados; remover também cancela solicitação enviada', async () => {
    // cancelar solicitação ENVIADA via remove
    await add(u1, u2);
    const cancel = await post('/api/friends/remove', { username: u2.username }, tokenHeader(u1.token));
    expect(cancel.status).toBe(200);
    expect((await friendsOf(u1.token)).outgoing).toEqual([]);
    expect((await friendsOf(u2.token)).incoming).toEqual([]);

    // amizade e remoção mútua
    await add(u1, u2);
    await post('/api/friends/accept', { username: u1.username }, tokenHeader(u2.token));
    expect((await friendsOf(u1.token)).friends).toHaveLength(1);

    const rm = await post('/api/friends/remove', { username: u2.username }, tokenHeader(u1.token));
    expect(rm.status).toBe(200);
    expect((await friendsOf(u1.token)).friends).toHaveLength(0);
    expect((await friendsOf(u2.token)).friends).toHaveLength(0);
  });

  it('validações: sem token → 401; si mesmo → 400; usuário inexistente → 404', async () => {
    const noToken = await post('/api/friends/add', { username: 'qualquer' });
    expect(noToken.status).toBe(401);

    const self = await post('/api/friends/add', { username: u1.username }, tokenHeader(u1.token));
    expect(self.status).toBe(400);

    const ghost = await post('/api/friends/add', { username: 'nao_existe_xyz' }, tokenHeader(u1.token));
    expect(ghost.status).toBe(404);

    const badName = await post('/api/friends/add', { username: '!!' }, tokenHeader(u1.token));
    expect(badName.status).toBe(400);
  });

  it('presença: heartbeat do amigo → online na lista; push do save → perfil público visível', async () => {
    await add(u2, u3);
    await post('/api/friends/accept', { username: u2.username }, tokenHeader(u3.token));

    // u2 joga e o app envia o save com o snapshot público (mesmo corpo do
    // pushAccountSave do cliente: saveText + name + slot + playerId + profile)
    const saveA = await fetch(`${baseUrl}/api/account/save`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-app-secret': secret, ...tokenHeader(u2.token) },
      body: JSON.stringify({
        saveText: 'NC1.SAVE_DO_AMIGO_123456789',
        name: 'Herói A',
        savedAt: Date.now(),
        slot: 'slot1',
        playerId: 111111,
        profile: { name: 'Herói A', avatarIcon: 'av_king', status: 'jogando', statusMessage: 'farmando forte', level: 12, prestige: 3 },
      }),
    });
    expect(saveA.status).toBe(200);

    // u3 abre o jogo → o heartbeat dele (com a sessão) registra presença por usuário
    const hb = await post('/api/heartbeat', { playerId: 222222, gameVersion: '1.3.1' }, tokenHeader(u3.token));
    expect(hb.status).toBe(200);

    // u2 vê u3 ONLINE; u3 vê o perfil público de u2
    const u2View = await friendsOf(u2.token);
    const u3Entry = u2View.friends!.find((f) => f.username === u3.username);
    expect(u3Entry).toBeDefined();
    expect(u3Entry!.online).toBe(true);
    expect(u3Entry!.lastSeenAt).toBeGreaterThan(0);

    const u3View = await friendsOf(u3.token);
    const u2Entry = u3View.friends!.find((f) => f.username === u2.username);
    expect(u2Entry).toBeDefined();
    expect(u2Entry!.online).toBe(false); // u2 não sinalizou heartbeat
    expect(u2Entry!.name).toBe('Herói A');
    expect(u2Entry!.avatarIcon).toBe('av_king');
    expect(u2Entry!.status).toBe('jogando');
    expect(u2Entry!.statusMessage).toBe('farmando forte');
    expect(u2Entry!.level).toBe(12);
    expect(u2Entry!.prestige).toBe(3);
  });
});
