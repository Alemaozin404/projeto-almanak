/**
 * Sistema de contas do Núcleo Clicker — registro, verificação por e-mail,
 * login, troca de senha, recuperação de senha e save automático da conta no
 * servidor.
 *
 * E-mails (confirmação, agradecimento e recuperação) são enviados pela conta
 * Gmail do jogo via SMTP (nodemailer). Configuração no servidor:
 *   GMAIL_USER=seu.jogo@gmail.com           (conta remetente)
 *   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx  (senha de app — Gmail → Segurança)
 *
 * Sem GMAIL_USER/GMAIL_APP_PASSWORD o módulo entra em MODO DEV: os e-mails
 * são impressos no console e o código aparece em `devCode` na resposta — o
 * fluxo funciona ponta a ponta localmente/em testes sem credenciais.
 *
 * Segurança:
 * - Senhas: scrypt (Node nativo) com sal aleatório de 16 bytes por usuário —
 *   nunca em texto puro; comparação com timingSafeEqual.
 * - Sessões: token aleatório de 32 bytes com TTL de 30 dias no KV.
 * - Códigos de 6 dígitos com TTL curto (10 min confirmação · 15 min recuperação).
 * - Rate limiting por IP/identidade (mesma proteção em memória do resto do servidor).
 *
 * O save da conta fica em `account:save:<username>` — o app envia o save
 * automaticamente a cada 1 hora (além de envios manuais) e restaura sob demanda.
 */
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
/** O produto exige e-mail Gmail (onde os códigos e o agradecimento são enviados). */
const GMAIL_EMAIL_RE = /@gmail\.com$/i;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;
const SAVE_TEXT_MAX = 2_000_000;

/** Deriva o hash armazenável de uma senha: `sal:hash` (scrypt, 16B salt, 32B key). */
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

/** Compara uma senha com o hash armazenado (timing-safe). */
function verifyPassword(stored, password) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const idx = stored.indexOf(':');
  const salt = stored.slice(0, idx);
  const hash = stored.slice(idx + 1);
  if (!/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{64}$/.test(hash)) return false;
  const candidate = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

/** Código numérico de 6 dígitos. */
function genCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/** Normaliza identificadores para o KV (username/email em minúsculas). */
const norm = (s) => String(s ?? '').trim().toLowerCase();

/**
 * IP real do cliente. Atrás de proxies (Vercel/Railway) o `req.ip` é o IP do
 * proxy — todos os jogadores apareceriam iguais e o rate limit viraria global.
 * Usa o primeiro hop de `x-forwarded-for` (o mais próximo do cliente).
 */
function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] ?? '');
  if (fwd) {
    const first = fwd.split(',')[0].trim();
    if (first) return first;
  }
  return req.ip ?? '?';
}

/** Compara dois códigos numéricos com segurança (timing-safe). */
function codesEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!/^\d{6}$/.test(a) || !/^\d{6}$/.test(b)) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

function userKey(username) {
  return `account:user:${norm(username)}`;
}

function emailKey(email) {
  return `account:email:${norm(email)}`;
}

/**
 * Registra as rotas de conta no app Express.
 * `ctx`: { env, kvGetJson, kvSet, kvKeys, rateLimited } — injetados pelo createApp.
 */
export function attachAccountRoutes(app, { env, kvGetJson, kvSet, kvKeys, rateLimited }) {
  const gmailUser = env.GMAIL_USER ?? '';
  const gmailPass = env.GMAIL_APP_PASSWORD ?? '';
  const emailEnabled = Boolean(gmailUser && gmailPass);
  const transporter = emailEnabled
    ? nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: gmailUser, pass: gmailPass },
      })
    : null;

  /** Envia um e-mail. Sem Gmail configurado → loga no console e marca dev. */
  async function sendMail(to, subject, text) {
    if (!transporter) {
      console.log(`[email][dev] → ${to}\n  Assunto: ${subject}\n  Corpo:\n${text}\n`);
      return { ok: true, dev: true };
    }
    try {
      await transporter.sendMail({
        from: `"Núcleo Clicker" <${gmailUser}>`,
        to,
        subject,
        text,
      });
      return { ok: true };
    } catch (err) {
      console.error('[email] falha ao enviar:', err.message);
      return { ok: false };
    }
  }

  function sendVerifyEmail(email, code) {
    return sendMail(
      email,
      '🧩 Núcleo Clicker — seu código de confirmação',
      `Olá!\n\nSeu código de confirmação é: ${code}\n\nEle expira em 10 minutos. Use-o na tela de Conta do jogo para ativar sua conta.\n\n— Núcleo Clicker`,
    );
  }

  function sendThankYouEmail(email, username) {
    return sendMail(
      email,
      '💛 Núcleo Clicker — obrigado por confirmar sua conta!',
      `Olá, ${username}!\n\nSua conta foi confirmada com sucesso. Agora seu progresso é salvo automaticamente no servidor a cada hora.\n\nObrigado por jogar!\n— Núcleo Clicker`,
    );
  }

  function sendRecoverEmail(email, code) {
    return sendMail(
      email,
      '🔑 Núcleo Clicker — seu código de recuperação',
      `Olá!\n\nSeu código de recuperação de senha é: ${code}\n\nEle expira em 15 minutos. Use-o na tela de Conta do jogo para definir uma nova senha.\n\nSe você não pediu isso, ignore este e-mail.\n— Núcleo Clicker`,
    );
  }

  /** Valida o token de sessão (header x-account-token) e devolve o username (ou null). */
  async function sessionUser(req) {
    const token = String(req.headers['x-account-token'] ?? '');
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const data = await kvGetJson(`account:session:${token}`);
    return data && typeof data.username === 'string' ? data.username : null;
  }

  /** Devolve o resumo de um usuário (nunca o hash). */
  function publicUser(user, username) {
    return {
      username: user.username ?? username,
      email: user.email,
      verified: user.verified === true,
      createdAt: user.createdAt ?? 0,
    };
  }

  // ── registro ───────────────────────────────────────────────
  app.post('/api/account/register', async (req, res) => {
    if (rateLimited(`acc:register:${clientIp(req)}`, 10)) {
      return res.status(429).json({ ok: false, reason: 'Muitas tentativas — aguarde um minuto' });
    }
    const username = String(req.body?.username ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');

    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ ok: false, reason: 'Usuário deve ter 3 a 20 caracteres (letras, números ou _)' });
    }
    if (!EMAIL_RE.test(email) || email.length > 100) {
      return res.status(400).json({ ok: false, reason: 'E-mail inválido' });
    }
    if (!GMAIL_EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, reason: 'Use um e-mail @gmail.com (onde os códigos e o agradecimento são enviados)' });
    }
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return res.status(400).json({ ok: false, reason: `A senha deve ter entre ${PASSWORD_MIN} e ${PASSWORD_MAX} caracteres` });
    }
    if ((await kvGetJson(userKey(username))) || (await kvGetJson(emailKey(email)))) {
      return res.status(409).json({ ok: false, reason: 'Usuário ou e-mail já cadastrado' });
    }

    const user = {
      username,
      email,
      passwordHash: hashPassword(password),
      verified: false,
      createdAt: Date.now(),
    };
    await kvSet(userKey(username), user);
    await kvSet(emailKey(email), { username });

    const code = genCode();
    await kvSet(`account:verify:${email}`, { code }, 600); // 10 min
    const mail = await sendVerifyEmail(email, code);

    console.log(`[account] registro ${username} <${email}> · código enviado: ${mail.dev ? 'dev (sem Gmail)' : 'sim'}`);
    return res.json({
      ok: true,
      username: user.username,
      email: user.email,
      ...(mail.dev ? { devCode: code } : {}),
    });
  });

  // ── verificação do e-mail (código de confirmação) ──────────
  app.post('/api/account/verify', async (req, res) => {
    if (rateLimited(`acc:verify:${clientIp(req)}`, 10)) {
      return res.status(429).json({ ok: false, reason: 'Muitas tentativas — aguarde um minuto' });
    }
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const code = String(req.body?.code ?? '').trim();
    const lookup = await kvGetJson(emailKey(email));
    const user = lookup ? await kvGetJson(userKey(lookup.username)) : null;
    if (!user || norm(user.email) !== email) {
      return res.status(404).json({ ok: false, reason: 'Conta não encontrada' });
    }
    if (user.verified === true) {
      return res.json({ ok: true, already: true, ...publicUser(user) });
    }
    const stored = await kvGetJson(`account:verify:${email}`);
    if (!stored || !codesEqual(stored.code, code)) {
      return res.status(400).json({ ok: false, reason: 'Código inválido ou expirado' });
    }
    user.verified = true;
    await kvSet(userKey(user.username), user);
    await kvSet(`account:verify:${email}`, null); // consome o código
    const mail = await sendThankYouEmail(email, user.username);
    console.log(`[account] conta confirmada: ${user.username} <${email}> · agradecimento: ${mail.dev ? 'dev' : 'enviado'}`);
    return res.json({ ok: true, ...publicUser(user) });
  });

  // ── reenviar código de confirmação ─────────────────────────
  app.post('/api/account/resend', async (req, res) => {
    if (rateLimited(`acc:resend:${clientIp(req)}`, 3)) {
      return res.status(429).json({ ok: false, reason: 'Muitas tentativas — aguarde um minuto' });
    }
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const lookup = await kvGetJson(emailKey(email));
    const user = lookup ? await kvGetJson(userKey(lookup.username)) : null;
    if (!user) return res.status(404).json({ ok: false, reason: 'Conta não encontrada' });
    if (user.verified === true) return res.json({ ok: true, already: true });

    const code = genCode();
    await kvSet(`account:verify:${email}`, { code }, 600);
    const mail = await sendVerifyEmail(email, code);
    return res.json({ ok: true, ...(mail.dev ? { devCode: code } : {}) });
  });

  // ── login ──────────────────────────────────────────────────
  app.post('/api/account/login', async (req, res) => {
    const login = String(req.body?.login ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!login || !password) return res.status(400).json({ ok: false, reason: 'Informe usuário/e-mail e senha' });
    if (rateLimited(`acc:login:${norm(login)}`, 10)) {
      return res.status(429).json({ ok: false, reason: 'Muitas tentativas — aguarde um minuto' });
    }

    let username = norm(login);
    let user = await kvGetJson(userKey(username));
    if (!user && EMAIL_RE.test(login)) {
      const lookup = await kvGetJson(emailKey(login));
      if (lookup) {
        user = await kvGetJson(userKey(lookup.username));
        username = lookup.username;
      }
    }
    if (!user || !verifyPassword(user.passwordHash, password)) {
      return res.status(401).json({ ok: false, reason: 'Usuário ou senha incorretos' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    await kvSet(`account:session:${token}`, { username: user.username }, 30 * 24 * 3600); // 30 dias
    const save = await kvGetJson(`account:save:${norm(user.username)}`);
    console.log(`[account] login ${user.username}`);
    return res.json({
      ok: true,
      token,
      ...publicUser(user),
      hasSave: Boolean(save && typeof save.saveText === 'string'),
      saveName: save?.name ?? '',
      saveSavedAt: save?.savedAt ?? 0,
      saveSlot: save?.slot ?? '',
    });
  });

  // ── logout ─────────────────────────────────────────────────
  app.post('/api/account/logout', async (req, res) => {
    const token = String(req.body?.token ?? '');
    if (/^[0-9a-f]{64}$/.test(token)) await kvSet(`account:session:${token}`, null);
    return res.json({ ok: true });
  });

  // ── trocar senha (logado) ──────────────────────────────────
  app.post('/api/account/change-password', async (req, res) => {
    const token = String(req.headers['x-account-token'] ?? '');
    const username = await sessionUser(req);
    if (!username) return res.status(401).json({ ok: false, reason: 'Sessão inválida ou expirada' });
    if (rateLimited(`acc:change:${norm(username)}`, 5)) {
      return res.status(429).json({ ok: false, reason: 'Muitas tentativas — aguarde um minuto' });
    }
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');
    const user = await kvGetJson(userKey(username));
    if (!user) return res.status(401).json({ ok: false, reason: 'Sessão inválida ou expirada' });
    // valida a senha atual ANTES da política da nova (erro mais relevante ao jogador)
    if (!verifyPassword(user.passwordHash, currentPassword)) {
      return res.status(400).json({ ok: false, reason: 'Senha atual incorreta' });
    }
    if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
      return res.status(400).json({ ok: false, reason: `A senha deve ter entre ${PASSWORD_MIN} e ${PASSWORD_MAX} caracteres` });
    }

    user.passwordHash = hashPassword(newPassword);
    await kvSet(userKey(user.username), user);

    // segurança: trocou a senha → derruba as OUTRAS sessões da conta
    // (a sessão atual continua válida para não expulsar o jogador do meio do jogo)
    const keys = await kvKeys('account:session:');
    for (const key of keys) {
      const keyToken = key.slice('account:session:'.length);
      if (keyToken === token) continue;
      const data = await kvGetJson(key);
      if (data && norm(data.username) === norm(username)) await kvSet(key, null);
    }

    console.log(`[account] senha alterada: ${user.username}`);
    return res.json({ ok: true });
  });

  // ── recuperação de senha (código de recuperação) ───────────
  app.post('/api/account/recover', async (req, res) => {
    if (rateLimited(`acc:recover:${clientIp(req)}`, 3)) {
      return res.status(429).json({ ok: false, reason: 'Muitas tentativas — aguarde um minuto' });
    }
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    // resposta igual com ou sem conta cadastrada (não vaza quem existe)
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, reason: 'E-mail inválido' });
    }
    const lookup = await kvGetJson(emailKey(email));
    if (lookup) {
      const code = genCode();
      await kvSet(`account:recover:${email}`, { code }, 900); // 15 min
      const mail = await sendRecoverEmail(email, code);
      console.log(`[account] recuperação pedida p/ ${email} · código: ${mail.dev ? 'dev' : 'enviado'}`);
      return res.json({ ok: true, ...(mail.dev ? { devCode: code } : {}) });
    }
    return res.json({ ok: true }); // sem conta: silenciosamente ok
  });

  // ── redefinir senha (com código de recuperação) ────────────
  app.post('/api/account/reset', async (req, res) => {
    if (rateLimited(`acc:reset:${clientIp(req)}`, 5)) {
      return res.status(429).json({ ok: false, reason: 'Muitas tentativas — aguarde um minuto' });
    }
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const code = String(req.body?.code ?? '').trim();
    const password = String(req.body?.newPassword ?? '');
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return res.status(400).json({ ok: false, reason: `A senha deve ter entre ${PASSWORD_MIN} e ${PASSWORD_MAX} caracteres` });
    }
    const stored = await kvGetJson(`account:recover:${email}`);
    if (!stored || !codesEqual(stored.code, code)) {
      return res.status(400).json({ ok: false, reason: 'Código inválido ou expirado' });
    }
    const lookup = await kvGetJson(emailKey(email));
    if (!lookup) return res.status(404).json({ ok: false, reason: 'Conta não encontrada' });
    const user = await kvGetJson(userKey(lookup.username));
    if (!user) return res.status(404).json({ ok: false, reason: 'Conta não encontrada' });

    user.passwordHash = hashPassword(password);
    await kvSet(userKey(user.username), user);
    await kvSet(`account:recover:${email}`, null); // consome o código
    console.log(`[account] senha redefinida: ${user.username}`);
    return res.json({ ok: true });
  });

  // ── sessão atual ───────────────────────────────────────────
  app.get('/api/account/me', async (req, res) => {
    const username = await sessionUser(req);
    if (!username) return res.status(401).json({ ok: false, reason: 'Sessão inválida ou expirada' });
    const user = await kvGetJson(userKey(username));
    if (!user) return res.status(401).json({ ok: false, reason: 'Sessão inválida ou expirada' });
    const save = await kvGetJson(`account:save:${norm(username)}`);
    return res.json({
      ok: true,
      ...publicUser(user),
      hasSave: Boolean(save && typeof save.saveText === 'string'),
      saveName: save?.name ?? '',
      saveSavedAt: save?.savedAt ?? 0,
      saveSlot: save?.slot ?? '',
    });
  });

  // ── save automático da conta (a cada 1 hora pelo app) ──────
  // O save da conta é VINCULADO ao slot de onde veio (`slot1|slot2|slot3`) —
  // no login o jogo só restaura automaticamente se o slot atual bater com ele.
  const SLOT_RE = /^(slot[123])?$/;

  app.get('/api/account/save', async (req, res) => {
    const username = await sessionUser(req);
    if (!username) return res.status(401).json({ ok: false, reason: 'Sessão inválida ou expirada' });
    const data = await kvGetJson(`account:save:${norm(username)}`);
    if (!data || typeof data.saveText !== 'string') {
      return res.status(404).json({ ok: false, reason: 'Nenhum save na conta' });
    }
    // ?meta=1 → só o cabeçalho (savedAt/slot/nome), sem o save inteiro: é o
    // poll leve do sync AO VIVO entre dispositivos (celular ↔ PC ↔ site).
    if (req.query.meta === '1') {
      return res.json({ ok: true, savedAt: data.savedAt ?? 0, slot: data.slot ?? '', name: data.name ?? '' });
    }
    return res.json({ ok: true, saveText: data.saveText, name: data.name ?? '', savedAt: data.savedAt ?? 0, slot: data.slot ?? '' });
  });

  app.put('/api/account/save', async (req, res) => {
    const username = await sessionUser(req);
    if (!username) return res.status(401).json({ ok: false, reason: 'Sessão inválida ou expirada' });
    if (rateLimited(`acc:save:${norm(username)}`, 30)) {
      return res.status(429).json({ ok: false, reason: 'Muitas requisições — aguarde um minuto' });
    }
    const { saveText, name, savedAt, slot, playerId, profile } = req.body ?? {};
    if (typeof saveText !== 'string' || saveText.length < 10 || saveText.length > SAVE_TEXT_MAX) {
      return res.status(400).json({ ok: false, reason: 'Save inválido ou grande demais' });
    }
    const cleanName = typeof name === 'string' ? name.replace(/[\u0000-\u001f]/g, '').slice(0, 40) : '';
    const cleanSlot = typeof slot === 'string' && SLOT_RE.test(slot) ? slot : '';
    const at = Number.isFinite(savedAt) ? savedAt : Date.now();
    await kvSet(`account:save:${norm(username)}`, { saveText, name: cleanName, savedAt: at, slot: cleanSlot });
    // snapshot PÚBLICO (visível apenas para amigos) — o app envia junto do save:
    // nome do save, avatar, status e progresso resumido, sem dados sensíveis
    if (profile && typeof profile === 'object') {
      const cleanProfile = {
        name: typeof profile.name === 'string' ? profile.name.replace(/[\u0000-\u001f]/g, '').slice(0, 40) : '',
        avatarIcon: typeof profile.avatarIcon === 'string' ? profile.avatarIcon.replace(/[^\w-]/g, '').slice(0, 32) : '',
        status: typeof profile.status === 'string' ? profile.status.replace(/[^\w-]/g, '').slice(0, 32) : '',
        statusMessage: typeof profile.statusMessage === 'string' ? profile.statusMessage.replace(/[\u0000-\u001f]/g, '').slice(0, 60) : '',
        level: Number.isFinite(profile.level) ? Math.max(1, Math.min(9999, Math.floor(profile.level))) : 1,
        prestige: Number.isFinite(profile.prestige) ? Math.max(0, Math.floor(profile.prestige)) : 0,
        updatedAt: Date.now(),
      };
      await kvSet(publicProfileKey(username), cleanProfile);
      // playerId (createdAt do save) também entra no snapshot — identifica o
      // dispositivo do amigo para futuras features (deep-link de perfil etc.)
      if (Number.isFinite(playerId) && playerId > 0) {
        await kvSet(publicProfileKey(username), { ...cleanProfile, lastPlayerId: Math.floor(playerId) });
      }
    }
    console.log(`[account] save automático de ${username} · ${saveText.length} chars${cleanSlot ? ` · ${cleanSlot}` : ''}`);
    return res.json({ ok: true, savedAt: at });
  });

  // ── re-vincular o save da conta a outro slot (sem reenviar o save) ──
  // O jogador escolhe na tela de Conta a qual slot o save da conta aponta;
  // isto troca apenas o rótulo `slot` do save guardado (se houver).
  app.post('/api/account/link-slot', async (req, res) => {
    const username = await sessionUser(req);
    if (!username) return res.status(401).json({ ok: false, reason: 'Sessão inválida ou expirada' });
    if (rateLimited(`acc:link:${norm(username)}`, 20)) {
      return res.status(429).json({ ok: false, reason: 'Muitas requisições — aguarde um minuto' });
    }
    const slot = String(req.body?.slot ?? '');
    if (!SLOT_RE.test(slot)) {
      return res.status(400).json({ ok: false, reason: 'Slot inválido' });
    }
    const save = await kvGetJson(`account:save:${norm(username)}`);
    if (save && typeof save.saveText === 'string') {
      save.slot = slot;
      await kvSet(`account:save:${norm(username)}`, save);
    }
    console.log(`[account] save re-vinculado de ${username} → ${slot || '(nenhum)'}`);
    return res.json({ ok: true, saveSlot: slot });
  });

  // ── amigos + perfil público (visível apenas para amigos) ──
  // Amizade é CONFIRMADA pelos dois lados: A adiciona B → solicitação pendente;
  // B aceita (ou adiciona A de volta) → amizade mútua. A presença do amigo vem
  // do heartbeat com a sessão (presence:name:<user>), o snapshot do perfil vem
  // do push do save (account:pub:<user>).
  const MAX_FRIENDS = 100;
  const FRIEND_RE = /^[a-zA-Z0-9_]{3,20}$/;

  function publicProfileKey(username) {
    return `account:pub:${norm(username)}`;
  }

  function friendKey(username) {
    return `friend:${norm(username)}`;
  }

  /** Estado de amizade de um usuário (arrays vazios se nunca usou). */
  async function getFriendState(username) {
    const data = await kvGetJson(friendKey(username));
    return {
      friends: Array.isArray(data?.friends) ? data.friends : [],
      incoming: Array.isArray(data?.incoming) ? data.incoming : [],
      outgoing: Array.isArray(data?.outgoing) ? data.outgoing : [],
    };
  }

  async function setFriendState(username, state) {
    await kvSet(friendKey(username), state);
  }

  /** Copia o array sem o nome (não muta o original). */
  function without(list, name) {
    return list.filter((x) => x !== name);
  }

  /** Perfil + presença de um amigo (para a lista e o modal de perfil). */
  async function friendInfo(username) {
    const u = norm(username);
    const pub = await kvGetJson(publicProfileKey(u));
    const presence = await kvGetJson(`presence:name:${u}`);
    const at = typeof presence?.at === 'number' ? presence.at : 0;
    return {
      username: u,
      name: pub?.name || u,
      avatarIcon: pub?.avatarIcon || 'av_default',
      status: pub?.status || 'offline',
      statusMessage: pub?.statusMessage || '',
      level: Number.isFinite(pub?.level) ? pub.level : 1,
      prestige: Number.isFinite(pub?.prestige) ? pub.prestige : 0,
      online: at > 0 && Date.now() - at < 180_000,
      lastSeenAt: at || pub?.updatedAt || 0,
      playerId: Number.isFinite(pub?.lastPlayerId) ? pub.lastPlayerId : 0,
    };
  }

  /** Registra o usuário da sessão (ou responde 401). */
  async function requireSessionUser(req, res) {
    const username = await sessionUser(req);
    if (!username) {
      res.status(401).json({ ok: false, reason: 'Sessão inválida ou expirada' });
      return null;
    }
    return username;
  }

  // ── lista de amigos (com presença e perfil) ──
  app.get('/api/friends', async (req, res) => {
    const username = await requireSessionUser(req, res);
    if (!username) return;
    if (rateLimited(`friends:list:${norm(username)}`, 60)) {
      return res.status(429).json({ ok: false, reason: 'Muitas requisições — aguarde um minuto' });
    }
    const state = await getFriendState(username);
    const friends = await Promise.all(state.friends.map(friendInfo));
    return res.json({ ok: true, friends, incoming: state.incoming, outgoing: state.outgoing });
  });

  // ── perfil público por link (deep link: /?profile=<usuario>) ──
  // Público (sem sessão) — compartilha o resumo do perfil de um jogador, igual
  // ao que um amigo vê na lista. Só o snapshot enviado com o save (sem dados
  // do save em si). 404 se o usuário não existe ou nunca sincronizou o perfil.
  app.get('/api/profile/:username', async (req, res) => {
    if (rateLimited(`profile:view:${String(req.params.username || '').toLowerCase()}`, 60)) {
      return res.status(429).json({ ok: false, reason: 'Muitas requisições — aguarde um minuto' });
    }
    const target = String(req.params.username || '').trim().toLowerCase();
    if (!FRIEND_RE.test(target)) {
      return res.status(400).json({ ok: false, reason: 'Usuário inválido' });
    }
    const info = await friendInfo(target);
    // sem perfil sincronizado → não existe link público
    if (!(await kvGetJson(publicProfileKey(target)))) {
      return res.status(404).json({ ok: false, reason: 'Perfil não encontrado' });
    }
    return res.json({ ok: true, profile: info });
  });

  // ── adicionar amigo (cria solicitação; confirma na hora se já havia solicitação contrária) ──
  app.post('/api/friends/add', async (req, res) => {
    const username = await requireSessionUser(req, res);
    if (!username) return;
    if (rateLimited(`friends:add:${norm(username)}`, 30)) {
      return res.status(429).json({ ok: false, reason: 'Muitas requisições — aguarde um minuto' });
    }
    const target = String(req.body?.username ?? '').trim().toLowerCase();
    if (!FRIEND_RE.test(target)) {
      return res.status(400).json({ ok: false, reason: 'Usuário inválido' });
    }
    const me = norm(username);
    if (target === me) {
      return res.status(400).json({ ok: false, reason: 'Você não pode adicionar a si mesmo' });
    }
    // 404 aqui revela se o usuário existe — aceito por UX de add-friend (você
    // precisa saber o nome de quem quer adicionar); o recover, que é por e-mail,
    // mantém a resposta silenciosa de propósito
    if (!(await kvGetJson(userKey(target)))) {
      return res.status(404).json({ ok: false, reason: 'Usuário não encontrado' });
    }
    const mine = await getFriendState(me);
    if (mine.friends.includes(target)) {
      return res.json({ ok: true, status: 'friends', reason: 'Já são amigos' });
    }
    const theirs = await getFriendState(target);
    if (mine.outgoing.includes(target)) {
      return res.json({ ok: true, status: 'pending', reason: 'Solicitação já enviada' });
    }
    if (mine.friends.length >= MAX_FRIENDS) {
      return res.status(400).json({ ok: false, reason: `Limite de ${MAX_FRIENDS} amigos atingido` });
    }
    if (theirs.outgoing.includes(me)) {
      // o alvo JÁ me adicionou → vira amizade mútua na hora; a solicitação
      // que EU tinha recebido dele (mine.incoming) também é consumida
      if (mine.friends.length >= MAX_FRIENDS) {
        return res.status(400).json({ ok: false, reason: `Limite de ${MAX_FRIENDS} amigos atingido` });
      }
      mine.friends.push(target);
      mine.incoming = without(mine.incoming, target);
      theirs.friends.push(me);
      theirs.outgoing = without(theirs.outgoing, me);
      await setFriendState(me, mine);
      await setFriendState(target, theirs);
      return res.json({ ok: true, status: 'friends' });
    }
    mine.outgoing.push(target);
    theirs.incoming.push(me);
    await setFriendState(me, mine);
    await setFriendState(target, theirs);
    return res.json({ ok: true, status: 'pending' });
  });

  // ── aceitar solicitação recebida ──
  app.post('/api/friends/accept', async (req, res) => {
    const username = await requireSessionUser(req, res);
    if (!username) return;
    if (rateLimited(`friends:accept:${norm(username)}`, 30)) {
      return res.status(429).json({ ok: false, reason: 'Muitas requisições — aguarde um minuto' });
    }
    const target = String(req.body?.username ?? '').trim().toLowerCase();
    if (!FRIEND_RE.test(target)) {
      return res.status(400).json({ ok: false, reason: 'Usuário inválido' });
    }
    const me = norm(username);
    const mine = await getFriendState(me);
    if (!mine.incoming.includes(target)) {
      return res.status(400).json({ ok: false, reason: 'Nenhuma solicitação desse usuário' });
    }
    // o limite vale para QUEM CONFIRMA também (aceitar não pode estourar a lista)
    if (mine.friends.length >= MAX_FRIENDS) {
      return res.status(400).json({ ok: false, reason: `Limite de ${MAX_FRIENDS} amigos atingido` });
    }
    const theirs = await getFriendState(target);
    mine.friends.push(target);
    mine.incoming = without(mine.incoming, target);
    theirs.friends.push(me);
    theirs.outgoing = without(theirs.outgoing, me);
    await setFriendState(me, mine);
    await setFriendState(target, theirs);
    return res.json({ ok: true });
  });

  // ── recusar solicitação recebida ──
  app.post('/api/friends/decline', async (req, res) => {
    const username = await requireSessionUser(req, res);
    if (!username) return;
    if (rateLimited(`friends:decline:${norm(username)}`, 30)) {
      return res.status(429).json({ ok: false, reason: 'Muitas requisições — aguarde um minuto' });
    }
    const target = String(req.body?.username ?? '').trim().toLowerCase();
    if (!FRIEND_RE.test(target)) {
      return res.status(400).json({ ok: false, reason: 'Usuário inválido' });
    }
    const me = norm(username);
    const mine = await getFriendState(me);
    if (!mine.incoming.includes(target)) {
      return res.status(400).json({ ok: false, reason: 'Nenhuma solicitação desse usuário' });
    }
    const theirs = await getFriendState(target);
    mine.incoming = without(mine.incoming, target);
    theirs.outgoing = without(theirs.outgoing, me);
    await setFriendState(me, mine);
    await setFriendState(target, theirs);
    return res.json({ ok: true });
  });

  // ── remover amigo / cancelar solicitação (qualquer direção) ──
  app.post('/api/friends/remove', async (req, res) => {
    const username = await requireSessionUser(req, res);
    if (!username) return;
    if (rateLimited(`friends:remove:${norm(username)}`, 30)) {
      return res.status(429).json({ ok: false, reason: 'Muitas requisições — aguarde um minuto' });
    }
    const target = String(req.body?.username ?? '').trim().toLowerCase();
    if (!FRIEND_RE.test(target)) {
      return res.status(400).json({ ok: false, reason: 'Usuário inválido' });
    }
    const me = norm(username);
    const mine = await getFriendState(me);
    const theirs = await getFriendState(target);
    if (mine.friends.includes(target)) {
      mine.friends = without(mine.friends, target);
      theirs.friends = without(theirs.friends, me);
    } else if (mine.outgoing.includes(target)) {
      // cancelar solicitação que enviei
      mine.outgoing = without(mine.outgoing, target);
      theirs.incoming = without(theirs.incoming, me);
    } else if (mine.incoming.includes(target)) {
      // descartar solicitação recebida (mesmo efeito do decline)
      mine.incoming = without(mine.incoming, target);
      theirs.outgoing = without(theirs.outgoing, me);
    }
    await setFriendState(me, mine);
    await setFriendState(target, theirs);
    return res.json({ ok: true });
  });
}
