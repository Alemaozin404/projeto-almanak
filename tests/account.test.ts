/**
 * Testes do sistema de contas — registro, verificação por e-mail, login,
 * recuperação de senha e save automático da conta.
 *
 * O servidor REAL (server/index.js) sobe em porta efêmera com o KV em memória
 * e SEM GMAIL configurado — o módulo entra em MODO DEV: os e-mails vão para o
 * console e as respostas trazem `devCode` para completar os fluxos.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../server/index.js';
import { GameConfig } from '../src/config/GameConfig';

interface RegisterBody { ok?: boolean; reason?: string; username?: string; email?: string; devCode?: string }
interface LoginBody { ok?: boolean; reason?: string; token?: string; username?: string; email?: string; verified?: boolean; hasSave?: boolean }

describe('Sistema de contas — registro, verificação, login, recuperação e save', () => {
  let server: Server;
  let baseUrl = '';

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  const put = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  beforeAll(async () => {
    // os testes NUNCA tocam o Upstash/Gmail reais (server/.env é carregado pelo dotenv)
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const app = createApp({
      MERCADO_PAGO_ACCESS_TOKEN: 'TEST-1234567890',
      MERCADO_PAGO_WEBHOOK_SECRET: 'test-webhook-secret',
      APP_SHARED_SECRET: GameConfig.wallet.appSharedSecret,
      PORT: '0',
      // sem GMAIL_USER/GMAIL_APP_PASSWORD → modo dev (devCode nas respostas)
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('sem porta atribuída');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('registro: cria a conta e devolve o código de confirmação (modo dev)', async () => {
    const res = await post('/api/account/register', {
      username: 'jogador_test',
      email: 'jogador.test@gmail.com',
      password: 'senha-segura-123',
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RegisterBody;
    expect(body.ok).toBe(true);
    expect(body.username).toBe('jogador_test');
    expect(body.devCode).toMatch(/^\d{6}$/); // modo dev (sem Gmail) expõe o código
  });

  it('registro: valida usuário, e-mail e senha', async () => {
    const badUser = await post('/api/account/register', { username: 'ab', email: 'x@gmail.com', password: 'senha-segura-123' });
    expect(badUser.status).toBe(400);

    const badEmail = await post('/api/account/register', { username: 'jogador_email', email: 'nao-e-email', password: 'senha-segura-123' });
    expect(badEmail.status).toBe(400);

    const shortPass = await post('/api/account/register', { username: 'jogador_senha', email: 'y@gmail.com', password: 'curta' });
    expect(shortPass.status).toBe(400);
  });

  it('registro: usuário ou e-mail duplicado → 409', async () => {
    const dupUser = await post('/api/account/register', { username: 'jogador_test', email: 'outro@gmail.com', password: 'senha-segura-123' });
    expect(dupUser.status).toBe(409);

    const dupEmail = await post('/api/account/register', { username: 'outro_nome', email: 'jogador.test@gmail.com', password: 'senha-segura-123' });
    expect(dupEmail.status).toBe(409);
  });

  it('verificação: código errado falha, código certo confirma a conta', async () => {
    // código errado → 400
    const wrong = await post('/api/account/verify', { email: 'jogador.test@gmail.com', code: '000000' });
    expect(wrong.status).toBe(400);

    // reenvia para obter um código determinístico (modo dev → devCode)
    const resend = await post('/api/account/resend', { email: 'jogador.test@gmail.com' });
    expect(resend.status).toBe(200);
    const body = (await resend.json()) as RegisterBody;
    expect(body.devCode).toMatch(/^\d{6}$/);

    // código certo → ok e conta verificada
    const ok = await post('/api/account/verify', { email: 'jogador.test@gmail.com', code: body.devCode });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { ok?: boolean; verified?: boolean }).verified).toBe(true);

    // verificar de novo → já confirmada
    const again = await post('/api/account/verify', { email: 'jogador.test@gmail.com', code: body.devCode });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { ok?: boolean; already?: boolean }).already).toBe(true);
  });

  it('login: senha errada falha; correta devolve token de sessão', async () => {
    const wrong = await post('/api/account/login', { login: 'jogador_test', password: 'senha-errada' });
    expect(wrong.status).toBe(401);

    const ok = await post('/api/account/login', { login: 'jogador_test', password: 'senha-segura-123' });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as LoginBody;
    expect(body.ok).toBe(true);
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);
    expect(body.username).toBe('jogador_test');
    expect(body.verified).toBe(true);
    expect(body.hasSave).toBe(false);
  });

  it('login: aceita e-mail no lugar do usuário', async () => {
    const res = await post('/api/account/login', { login: 'JOGADOR.TEST@GMAIL.COM', password: 'senha-segura-123' });
    expect(res.status).toBe(200);
    expect(((await res.json()) as LoginBody).username).toBe('jogador_test');
  });

  it('me: exige token; com token devolve a conta', async () => {
    const denied = await fetch(`${baseUrl}/api/account/me`);
    expect(denied.status).toBe(401);

    const login = await post('/api/account/login', { login: 'jogador_test', password: 'senha-segura-123' });
    const token = ((await login.json()) as LoginBody).token!;
    const me = await fetch(`${baseUrl}/api/account/me`, { headers: { 'x-account-token': token } });
    expect(me.status).toBe(200);
    const body = (await me.json()) as { ok?: boolean; username?: string; verified?: boolean };
    expect(body.ok).toBe(true);
    expect(body.username).toBe('jogador_test');
    expect(body.verified).toBe(true);
  });

  it('save da conta: exige token, guarda e devolve (auto-save de 1h usa este endpoint)', async () => {
    const login = await post('/api/account/login', { login: 'jogador_test', password: 'senha-segura-123' });
    const token = ((await login.json()) as LoginBody).token!;
    const headers = { 'x-account-token': token };

    // sem token → 401
    const denied = await put('/api/account/save', { saveText: 'NC1.abc', name: 'X', savedAt: 1 });
    expect(denied.status).toBe(401);

    // guarda vinculado ao slot2
    const putRes = await put('/api/account/save', { saveText: 'NC1.SAVE_DA_CONTA_123', name: 'Jogador Test', savedAt: 1700000000000, slot: 'slot2' }, headers);
    expect(putRes.status).toBe(200);
    expect(((await putRes.json()) as { ok?: boolean }).ok).toBe(true);

    // devolve igual (com o slot vinculado)
    const get = await fetch(`${baseUrl}/api/account/save`, { headers });
    expect(get.status).toBe(200);
    const data = (await get.json()) as { saveText?: string; name?: string; savedAt?: number; slot?: string };
    expect(data.saveText).toBe('NC1.SAVE_DA_CONTA_123');
    expect(data.name).toBe('Jogador Test');
    expect(data.savedAt).toBe(1700000000000);
    expect(data.slot).toBe('slot2');

    // slot inválido é ignorado (não quebra o save)
    const putBadSlot = await put('/api/account/save', { saveText: 'NC1.SAVE_DA_CONTA_456', name: 'X', savedAt: 1700000000001, slot: '../../etc' }, headers);
    expect(putBadSlot.status).toBe(200);
    const getBad = await fetch(`${baseUrl}/api/account/save`, { headers });
    expect(((await getBad.json()) as { slot?: string }).slot).toBe('');

    // login passa a reportar hasSave + saveSlot
    const login2 = await post('/api/account/login', { login: 'jogador_test', password: 'senha-segura-123' });
    const loginBody = (await login2.json()) as LoginBody & { saveSlot?: string };
    expect(loginBody.hasSave).toBe(true);
    expect(loginBody.saveSlot).toBe(''); // último save gravado sem slot válido

    // sem save → 404
    const noSave = await fetch(`${baseUrl}/api/account/save`, { headers: { 'x-account-token': 'f'.repeat(64) } });
    expect(noSave.status).toBe(401); // token inexistente
  });

  it('save da conta: ?meta=1 devolve SÓ o cabeçalho (poll leve do sync ao vivo, sem o save)', async () => {
    const login = await post('/api/account/login', { login: 'jogador_test', password: 'senha-segura-123' });
    const token = ((await login.json()) as LoginBody).token!;
    const headers = { 'x-account-token': token };

    await put('/api/account/save', { saveText: 'NC1.SAVE_META_123', name: 'Jogador Test', savedAt: 1700000000000, slot: 'slot1' }, headers);

    const meta = await fetch(`${baseUrl}/api/account/save?meta=1`, { headers });
    expect(meta.status).toBe(200);
    const body = (await meta.json()) as { ok?: boolean; saveText?: string; savedAt?: number; slot?: string; name?: string };
    expect(body.ok).toBe(true);
    expect(body.saveText).toBeUndefined(); // NÃO baixa o save inteiro
    expect(body.savedAt).toBe(1700000000000);
    expect(body.slot).toBe('slot1');
    expect(body.name).toBe('Jogador Test');

    // sem token → 401 mesmo no meta
    const denied = await fetch(`${baseUrl}/api/account/save?meta=1`, { headers: { 'x-account-token': 'f'.repeat(64) } });
    expect(denied.status).toBe(401);
  });

  it('link-slot: exige token, valida slot e re-vincula o save guardado sem reenviar', async () => {
    const login = await post('/api/account/login', { login: 'jogador_test', password: 'senha-segura-123' });
    const token = ((await login.json()) as LoginBody).token!;
    const headers = { 'x-account-token': token };

    // guarda um save vinculado ao slot1
    await put('/api/account/save', { saveText: 'NC1.SAVE_LINK_123', name: 'Jogador Test', savedAt: 1700000000000, slot: 'slot1' }, headers);

    // sem token → 401
    const denied = await post('/api/account/link-slot', { slot: 'slot2' });
    expect(denied.status).toBe(401);

    // slot inválido → 400
    const bad = await post('/api/account/link-slot', { slot: '../../etc' }, headers);
    expect(bad.status).toBe(400);

    // re-vincula ao slot2 → o save continua o mesmo, mas o slot muda
    const ok = await post('/api/account/link-slot', { slot: 'slot2' }, headers);
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { ok?: boolean; saveSlot?: string }).saveSlot).toBe('slot2');

    const get = await fetch(`${baseUrl}/api/account/save`, { headers });
    const data = (await get.json()) as { saveText?: string; slot?: string };
    expect(data.saveText).toBe('NC1.SAVE_LINK_123'); // conteúdo intacto
    expect(data.slot).toBe('slot2'); // rótulo trocado

    // me também reflete o novo slot
    const me = await fetch(`${baseUrl}/api/account/me`, { headers });
    expect(((await me.json()) as { saveSlot?: string }).saveSlot).toBe('slot2');

    // re-vincular com vazio ('' = automático) também funciona
    const auto = await post('/api/account/link-slot', { slot: '' }, headers);
    expect(((await auto.json()) as { saveSlot?: string }).saveSlot).toBe('');
  });

  it('recuperação: código devolve, redefinição troca a senha e o login novo funciona', async () => {
    // cria uma conta só para recuperação
    await post('/api/account/register', { username: 'recupera_test', email: 'recupera@gmail.com', password: 'senha-antiga-123' });

    const recover = await post('/api/account/recover', { email: 'recupera@gmail.com' });
    expect(recover.status).toBe(200);
    const recBody = (await recover.json()) as RegisterBody;
    expect(recBody.devCode).toMatch(/^\d{6}$/);

    // código errado → 400
    const badReset = await post('/api/account/reset', { email: 'recupera@gmail.com', code: '000000', newPassword: 'senha-nova-456' });
    expect(badReset.status).toBe(400);

    // código certo → ok
    const reset = await post('/api/account/reset', { email: 'recupera@gmail.com', code: recBody.devCode, newPassword: 'senha-nova-456' });
    expect(reset.status).toBe(200);
    expect(((await reset.json()) as { ok?: boolean }).ok).toBe(true);

    // senha antiga não funciona mais; a nova funciona
    const oldPass = await post('/api/account/login', { login: 'recupera_test', password: 'senha-antiga-123' });
    expect(oldPass.status).toBe(401);
    const newPass = await post('/api/account/login', { login: 'recupera_test', password: 'senha-nova-456' });
    expect(newPass.status).toBe(200);
    expect(((await newPass.json()) as LoginBody).token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('recuperação: e-mail não cadastrado responde ok (não vaza existência)', async () => {
    const res = await post('/api/account/recover', { email: 'ninguem@gmail.com' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as RegisterBody;
    expect(body.ok).toBe(true);
    expect(body.devCode).toBeUndefined();
  });

  it('troca de senha: exige token, valida a senha atual e derruba as outras sessões', async () => {
    // conta dedicada (registro + verificação via devCode)
    await post('/api/account/register', { username: 'troca_test', email: 'troca@gmail.com', password: 'senha-original-1' });
    const resend = await post('/api/account/resend', { email: 'troca@gmail.com' });
    const code = ((await resend.json()) as RegisterBody).devCode!;
    await post('/api/account/verify', { email: 'troca@gmail.com', code });

    // duas sessões na mesma conta
    const loginA = await post('/api/account/login', { login: 'troca_test', password: 'senha-original-1' });
    const tokenA = ((await loginA.json()) as LoginBody).token!;
    const loginB = await post('/api/account/login', { login: 'troca_test', password: 'senha-original-1' });
    const tokenB = ((await loginB.json()) as LoginBody).token!;

    // sem token → 401
    const noToken = await post('/api/account/change-password', { currentPassword: 'senha-original-1', newPassword: 'senha-nova-999' });
    expect(noToken.status).toBe(401);

    // senha atual errada → 400
    const wrong = await post('/api/account/change-password', { currentPassword: 'senha-errada-1', newPassword: 'senha-nova-999' }, { 'x-account-token': tokenA });
    expect(wrong.status).toBe(400);

    // troca com tokenA → ok
    const change = await post('/api/account/change-password', { currentPassword: 'senha-original-1', newPassword: 'senha-nova-999' }, { 'x-account-token': tokenA });
    expect(change.status).toBe(200);
    expect(((await change.json()) as { ok?: boolean }).ok).toBe(true);

    // senha antiga não funciona mais; a nova funciona
    const oldLogin = await post('/api/account/login', { login: 'troca_test', password: 'senha-original-1' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await post('/api/account/login', { login: 'troca_test', password: 'senha-nova-999' });
    expect(newLogin.status).toBe(200);

    // a OUTRA sessão (tokenB) caiu; a atual (tokenA) continua logada
    const meA = await fetch(`${baseUrl}/api/account/me`, { headers: { 'x-account-token': tokenA } });
    expect(meA.status).toBe(200);
    const meB = await fetch(`${baseUrl}/api/account/me`, { headers: { 'x-account-token': tokenB } });
    expect(meB.status).toBe(401);
  });

  it('logout: invalida a sessão (me passa a falhar)', async () => {
    const login = await post('/api/account/login', { login: 'jogador_test', password: 'senha-segura-123' });
    const token = ((await login.json()) as LoginBody).token!;

    const out = await post('/api/account/logout', { token });
    expect(out.status).toBe(200);

    const me = await fetch(`${baseUrl}/api/account/me`, { headers: { 'x-account-token': token } });
    expect(me.status).toBe(401);
  });
});
