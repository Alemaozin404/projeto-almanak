/**
 * Backend online do Núcleo Clicker — Mercado Pago (Pix) + conteúdo online +
 * save na nuvem + ranking global.
 *
 * Arquitetura de segurança:
 * - O ACCESS TOKEN do Mercado Pago vive SÓ aqui (variável de ambiente).
 *   Nunca é enviado ao app do jogador (Electron é descompilável).
 * - O app chama POST /api/pix/charge → recebe qr_code (copia-e-cola) e
 *   qr_code_base64 (imagem) → faz polling em GET /api/pix/status/:id.
 * - O Mercado Pago notifica POST /api/pix/webhook → validamos a assinatura
 *   HMAC antes de confiar em qualquer coisa.
 * - Conteúdo do jogo (notícias, eventos, banners, códigos, changelog,
 *   manutenção) é servido de server/content.json (gerado por npm run content:export).
 * - Saves na nuvem e ranking usam um KV serverless (Upstash Redis REST).
 *   Sem UPSTASH configurado, caem para um Map em memória (dev/testes).
 * - Sistema de contas (server/accounts.js): registro, verificação por e-mail,
 *   login, recuperação de senha e save automático (1h) — senhas com scrypt,
 *   sessões por token, e-mails via Gmail SMTP.
 *
 * Configuração (server/.env → Vercel Environment Variables):
 *   MERCADO_PAGO_ACCESS_TOKEN=APP_USR-...      (obrigatório p/ pagamentos)
 *   MERCADO_PAGO_WEBHOOK_SECRET=...            (obrigatório — painel MP → Webhooks)
 *   APP_SHARED_SECRET=...                      (proteção leve app→backend)
 *   RECEIPT_PRIVATE_KEY=...                    (obrigatório p/ passe — seed Ed25519, npm run gen:receipt-keys)
 *   GMAIL_USER=seu.jogo@gmail.com              (remetente dos e-mails da conta)
 *   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx     (senha de app do Gmail — obrigatória p/ e-mails reais)
 *   BASE_URL=https://seu-projeto.vercel.app    (URL pública — notification_url)
 *   UPSTASH_REDIS_REST_URL=...                 (opcional — save nuvem + ranking)
 *   UPSTASH_REDIS_REST_TOKEN=...               (opcional)
 *   PORT=8787
 */
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Decimal } from 'decimal.js';
import { kvGetJson, kvKeys, kvSet } from './store.js';
import { attachAccountRoutes } from './accounts.js';

// Carrega server/.env (independente do cwd). No Vercel as variáveis vêm do
// painel — o dotenv simplesmente não encontra o arquivo e segue em frente.
const __serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__serverDir, '.env') });

const MP_API = 'https://api.mercadopago.com';

// ── conteúdo online (server/content.json — gerado por npm run content:export) ──
// O Vercel empaqueta a função com esbuild e injeta server/content.json via
// includeFiles (ver vercel.json → functions). Em produção o import.meta.url
// aponta para o BUNDLE, não para o arquivo original — então tentamos vários
// caminhos antes de desistir: dev normal, bundle com estrutura preservada,
// bundle achatado e cwd relativo.
const EMPTY_CONTENT = {
  gameVersion: '0.0.0',
  updates: [],
  news: [],
  banners: [],
  events: [],
  seasons: [],
  codes: [],
  maintenance: [],
};

function contentFileCandidates() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.join(__serverDir, 'content.json'), // dev / execução normal (server/content.json)
    path.join(here, 'server', 'content.json'), // bundle Vercel (includeFiles preserva server/)
    path.join(here, 'content.json'), // bundle Vercel (includeFiles achatado na raiz da função)
    path.join(process.cwd(), 'server', 'content.json'), // fallback por cwd
  ];
}

let contentCache = null;

function loadContent() {
  if (contentCache) return contentCache;
  for (const file of contentFileCandidates()) {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        contentCache = parsed;
        return contentCache;
      }
    } catch {
      // tenta o próximo caminho
    }
  }
  // sem arquivo exportado (dev sem rodar o script): conteúdo vazio, jogo usa o local
  contentCache = EMPTY_CONTENT;
  return contentCache;
}

// ── ranking global (KV) ──
const RANK_KINDS = new Set(['prestige', 'ascension', 'transcendence']);
const RANK_MAX = 100;
const RANK_CACHE_MS = 60 * 1000; // GET /api/rank: 1 min de cache no processo
let rankCache = null;
let rankCacheAt = 0;

function rankKey(kind) {
  return `rank:${kind}`;
}

/** Compara ganhos (strings bignum, ex.: '1.5e120') sem perda de precisão. */
function cmpGain(a, b) {
  try {
    return new Decimal(b.gain).cmp(new Decimal(a.gain));
  } catch {
    return 0;
  }
}

async function submitRank(entry) {
  const key = rankKey(entry.kind);
  let list = (await kvGetJson(key)) ?? [];
  if (!Array.isArray(list)) list = [];
  // mantém apenas o MELHOR ganho de cada jogador
  const others = list.filter((x) => String(x.playerId) !== String(entry.playerId));
  others.push(entry);
  others.sort((a, b) => cmpGain(a, b));
  const top = others.slice(0, RANK_MAX);
  await kvSet(key, top);
  rankCache = null; // invalida o cache em processo (o novo recorde aparece já na próxima consulta)
  const position = top.findIndex((x) => String(x.playerId) === String(entry.playerId));
  return { position: position >= 0 ? position + 1 : null };
}

/** Pacotes de fichas — os PREÇOS são definidos AQUI (o cliente nunca define valor).
 *  FICHAS SÃO BARATAS: moeda de troca usada apenas em eventos premium. */
const FICHA_PACKS = {
  fichas_100: { name: '100 Fichas', fichas: 100, priceBRL: 3.99 },
  fichas_300: { name: '300 Fichas', fichas: 300, priceBRL: 9.99 },
  fichas_800: { name: '800 Fichas', fichas: 800, priceBRL: 24.99 },
  fichas_2000: { name: '2.000 Fichas', fichas: 2000, priceBRL: 59.99 },
};

/** Pacotes de CRÉDITOS 💳 — moeda universal (passe, avatares pagos, entrada em eventos). */
const CREDIT_PACKS = {
  credits_100: { name: '100 Créditos', credits: 100, priceBRL: 6.25 },
  credits_300: { name: '300 Créditos', credits: 300, priceBRL: 17.5 },
  credits_800: { name: '800 Créditos', credits: 800, priceBRL: 45.0 },
  credits_2000: { name: '2.000 Créditos', credits: 2000, priceBRL: 105.0 },
};

/**
 * Pacotes da Loja (aba "Moedas") — mesmos preços/conteúdos de src/shop/packs.ts.
 * O preço cobrado é SEMPRE o daqui: o cliente não arbitra valor na cobrança.
 */
const COIN_PACKS = {
  pack_mini: { name: 'Mini Pacote', priceBRL: 3.99, gold: '5000', diamonds: 380 },
  pack_starter: { name: 'Pacote Iniciante', priceBRL: 9.99, gold: '25000', diamonds: 1000 },
  pack_popular: { name: 'Pacote Popular', priceBRL: 19.99, gold: '100000', diamonds: 2500 },
  pack_premium: { name: 'Pacote Premium', priceBRL: 39.99, gold: '400000', diamonds: 6000 },
  pack_legend: { name: 'Pacote Lendário', priceBRL: 99.99, gold: '2000000', diamonds: 18000 },
  pack_ultra: { name: 'Pacote Supremo', priceBRL: 199.99, gold: '8000000', diamonds: 45000 },
};

/** Passe Premium — mesmo preço de GameConfig.pass.priceBRL (cobrança real via Pix). */
const PASS_PACK = { name: 'Passe Premium', priceBRL: 9.9 };

/** Pacote embutido de TESTE — R$ 0,01 por 1 diamante (função do Admin). */
const TEST_PACKS = {
  pix_test_1d: { name: 'Teste Pix · 1💎', priceBRL: 0.01, diamonds: 1 },
};

/** Pacotes customizados do Admin (diamantes/moedas) — persistidos no KV. */
const PACKS_KV_KEY = 'packs:custom';
let packsCache = null;

async function getCustomPacks() {
  if (packsCache) return packsCache;
  const arr = (await kvGetJson(PACKS_KV_KEY)) ?? [];
  packsCache = Array.isArray(arr) ? arr : [];
  return packsCache;
}

async function saveCustomPacks(list) {
  packsCache = list;
  await kvSet(PACKS_KV_KEY, list);
}

/** Resolve um pacote: fichas → loja (moedas) → passe → teste → custom do admin. O cliente nunca envia preço. */
async function resolvePack(packId) {
  if (FICHA_PACKS[packId]) return FICHA_PACKS[packId];
  if (CREDIT_PACKS[packId]) return CREDIT_PACKS[packId];
  if (COIN_PACKS[packId]) return COIN_PACKS[packId];
  if (packId === 'premium_pass') return PASS_PACK;
  if (TEST_PACKS[packId]) return TEST_PACKS[packId];
  const custom = await getCustomPacks();
  return custom.find((p) => p.id === packId) ?? null;
}

/**
 * Conteúdo ENTREGÁVEL de um pacote (fichas/moedas/diamantes) — a fonte da
 * verdade da entrega. O app NUNCA decide o que recebe: resolve aqui, na
 * cobrança, e é devolvido em /api/pix/status quando o pagamento aprova.
 * Pacotes sem conteúdo (ex.: o passe, que entrega via recibo) retornam undefined.
 */
function packContent(pack) {
  const c = {};
  if (Number.isFinite(pack.fichas) && pack.fichas > 0) c.fichas = pack.fichas;
  if (Number.isFinite(pack.credits) && pack.credits > 0) c.credits = pack.credits;
  if (typeof pack.gold === 'string' && Number(pack.gold) > 0) c.gold = pack.gold;
  if (Number.isFinite(pack.diamonds) && pack.diamonds > 0) c.diamonds = pack.diamonds;
  return Object.keys(c).length > 0 ? c : undefined;
}

/** Valida um pacote do admin (mesmas regras do cliente + limites rígidos). */
function sanitizePack(raw) {
  const id = typeof raw?.id === 'string' ? raw.id.trim().slice(0, 64) : '';
  const name = typeof raw?.name === 'string' ? raw.name.trim().slice(0, 60) : '';
  const icon = typeof raw?.icon === 'string' ? raw.icon.slice(0, 8) : '💎';
  const priceBRL = Number(raw?.priceBRL);
  const gold = typeof raw?.gold === 'string' && /^\d{1,16}(\.\d+)?$/.test(raw.gold) ? raw.gold : '0';
  const diamonds = Number(raw?.diamonds);
  const tag = typeof raw?.tag === 'string' ? raw.tag.slice(0, 30) : undefined;
  const featured = raw?.featured === true;
  const enabled = raw?.enabled !== false;
  if (!/^[a-z0-9_]{3,64}$/.test(id)) return { ok: false, reason: 'ID inválido' };
  if (!name) return { ok: false, reason: 'Nome obrigatório' };
  if (!Number.isFinite(priceBRL) || priceBRL < 0.01 || priceBRL > 1000) return { ok: false, reason: 'Preço deve ser entre R$ 0,01 e R$ 1.000' };
  if (!Number.isInteger(diamonds) || diamonds < 0 || diamonds > 1e7) return { ok: false, reason: 'Diamantes inválidos' };
  if (Number(gold) <= 0 && diamonds <= 0) return { ok: false, reason: 'O pacote deve entregar moedas ou diamantes' };
  return { ok: true, pack: { id, name, icon, priceBRL, gold, diamonds, tag, featured, enabled } };
}

/**
 * Cria o app Express. As configurações vêm de `env` (padrão: process.env) —
 * injetáveis em testes para subir o servidor real sem tocar o ambiente real.
 */
export function createApp(env = process.env) {
  const ACCESS_TOKEN = env.MERCADO_PAGO_ACCESS_TOKEN ?? '';
  const WEBHOOK_SECRET = env.MERCADO_PAGO_WEBHOOK_SECRET ?? '';
  /** Segredo compartilhado app→backend (proteção leve). Se vazio, não é exigido. */
  const APP_SHARED_SECRET = env.APP_SHARED_SECRET ?? '';
  const BASE_URL = (env.BASE_URL ?? `http://localhost:${env.PORT ?? 8787}`).replace(/\/$/, '');

  /**
   * Chave PRIVADA Ed25519 dos recibos do Passe Premium (seed 32 bytes hex — só
   * aqui, nunca no app). O app verifica com a chave pública embutida. Sem ela,
   * o recibo NÃO é emitido (fail-closed). Gerar: npm run gen:receipt-keys.
   */
  const RECEIPT_PRIVATE_KEY = env.RECEIPT_PRIVATE_KEY ?? '';
  /** Prefixo PKCS#8 do Ed25519 (0x302e...04220420) + seed → chave pronta. */
  const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
  let receiptKey = null;
  if (/^[0-9a-f]{64}$/.test(RECEIPT_PRIVATE_KEY)) {
    try {
      receiptKey = crypto.createPrivateKey({
        key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(RECEIPT_PRIVATE_KEY, 'hex')]),
        format: 'der',
        type: 'pkcs8',
      });
    } catch (err) {
      console.error('❌ RECEIPT_PRIVATE_KEY inválida — recibos do passe desativados:', err.message);
      receiptKey = null;
    }
  }

  // ── validação de assinatura de webhook (HMAC-SHA256) ───────
  // Template documentado: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
  function signatureValid(req) {
    if (!WEBHOOK_SECRET) return false;
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    if (!xSignature || !xRequestId) return false;
    const params = Object.fromEntries(xSignature.split(',').map((p) => p.trim().split('=')));
    const ts = params.ts;
    const hash = params.v1;
    if (!ts || !hash) return false;
    const dataId = req.body?.data?.id ?? req.query?.['data.id'] ?? '';
    const template = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expected = Buffer.from(crypto.createHmac('sha256', WEBHOOK_SECRET).update(template).digest('hex'));
    const received = Buffer.from(hash);
    // timingSafeEqual lança se os buffers têm tamanhos diferentes — compare com segurança
    if (expected.length !== received.length) return false;
    return crypto.timingSafeEqual(expected, received);
  }

  /** Valida a proteção leve app→backend (x-app-secret), se configurada. */
  function appSecretValid(req) {
    if (!APP_SHARED_SECRET) return true; // sem segredo configurado: aceita (modo dev)
    const sent = req.headers['x-app-secret'];
    if (typeof sent !== 'string') return false;
    const a = Buffer.from(sent);
    const b = Buffer.from(APP_SHARED_SECRET);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // ── chamadas à API do Mercado Pago (fetch nativo) ──────────
  async function mpFetch(mpPath, options = {}) {
    const res = await fetch(`${MP_API}${mpPath}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        ...(options.headers ?? {}),
      },
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* não-JSON */ }
    return { status: res.status, json };
  }

  /**
   * Assina o recibo do Passe Premium (Ed25519 com a chave PRIVADA do servidor).
   * O app verifica a assinatura com a chave pública embutida — ninguém forja
   * sem esta chave, e o recibo só sai daqui após o MP confirmar a aprovação.
   */
  function signServerReceipt(orderId, playerId) {
    const template = Buffer.from(`premium_pass|${orderId}|${playerId}`, 'utf8');
    const sig = crypto.sign(null, template, receiptKey);
    return `srv2:${sig.toString('hex')}`;
  }

  /** Cria a cobrança Pix (retorna id, qr_code e qr_code_base64). */
  async function createPixCharge(pack, playerId, payerEmail) {
    const idempotencyKey = crypto.randomUUID();
    // O MP rejeita notification_url com localhost (400). Só enviamos quando o
    // BASE_URL é público (https://). Sem ela, o MP usa a URL configurada no
    // painel (Suas integrações → Webhooks) e o POLLING do jogo continua entregando
    // as fichas independente do webhook.
    const notificationUrl = /^https:\/\/(?!localhost)/i.test(BASE_URL) ? `${BASE_URL}/api/pix/webhook` : undefined;
    const { status, json } = await mpFetch('/v1/payments', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        transaction_amount: pack.priceBRL,
        description: `Núcleo Clicker — ${pack.name}`,
        payment_method_id: 'pix',
        ...(notificationUrl ? { notification_url: notificationUrl } : {}),
        payer: {
          // TLD válido obrigatório (o MP rejeita .local/.invalid com 400)
          email: payerEmail || `jogador-${playerId}@nucleoclicker.com`,
        },
      }),
    });
    if (status >= 300 || !json?.id) {
      console.error('[MP] falha ao criar pagamento', status, json);
      return { ok: false, reason: `Mercado Pago recusou (${status})` };
    }
    const txn = json.point_of_interaction?.transaction_data;
    return {
      ok: true,
      id: String(json.id),
      status: json.status,
      qrCode: txn?.qr_code ?? '',
      qrCodeBase64: txn?.qr_code_base64 ?? '',
    };
  }

  /** Consulta o status de um pagamento. */
  async function getPaymentStatus(paymentId) {
    if (!/^\d{1,20}$/.test(paymentId)) return { status: 'invalid', reason: 'id inválido' };
    const { status, json } = await mpFetch(`/v1/payments/${paymentId}`);
    if (status >= 300 || !json?.id) return { status: 'unknown', reason: `MP ${status}` };
    return { status: json.status, detail: json.status_detail, amount: json.transaction_amount, method: json.payment_method_id };
  }

  // ── proteção leve: limite de escrita por jogador/IP (em memória) ──
  // Reseta em cold start (serverless) — serve contra rajadas, não é um firewall.
  const rateBuckets = new Map();
  function rateLimited(key, maxPerMinute) {
    const now = Date.now();
    const b = rateBuckets.get(key);
    if (!b || now - b.at >= 60_000) {
      rateBuckets.set(key, { at: now, count: 1 });
      return false;
    }
    b.count += 1;
    return b.count > maxPerMinute;
  }

  // ── app ────────────────────────────────────────────────────
  const app = express();
  app.use(cors());
  // limite de 3 MB: o save na nuvem pode passar de 100 KB (padrão do Express)
  app.use(express.json({ limit: '3mb' }));

  app.get('/api/health', (_req, res) => {
    // lê do env INJETADO (createApp(env)) — não de process.env direto, senão
    // testes/deploys com env customizado reportam o status errado do KV.
    const hasKv = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);
    const hasEmail = Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);
    res.json({ ok: true, mp: ACCESS_TOKEN ? 'configured' : 'missing-token', kv: hasKv ? 'configured' : 'memory', email: hasEmail ? 'configured' : 'missing', version: loadContent().gameVersion });
  });

  // ── conteúdo online (público — notícias, eventos, banners, códigos, changelog, manutenção) ──
  app.get('/api/content', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json({ ok: true, content: loadContent() });
  });

  app.get('/api/meta', (_req, res) => {
    const c = loadContent();
    return res.json({ ok: true, gameVersion: c.gameVersion, maintenance: Array.isArray(c.maintenance) ? c.maintenance : [] });
  });

  // ── save na nuvem (protegido por x-app-secret) ──
  const PLAYER_ID_RE = /^\d{1,20}$/;

  app.get('/api/save/:playerId', async (req, res) => {
    if (!appSecretValid(req)) return res.status(401).json({ ok: false, reason: 'Acesso negado' });
    if (!PLAYER_ID_RE.test(req.params.playerId)) return res.status(400).json({ ok: false, reason: 'Jogador inválido' });
    const data = await kvGetJson(`save:${req.params.playerId}`);
    if (!data || typeof data.saveText !== 'string') return res.status(404).json({ ok: false, reason: 'Nenhum save na nuvem' });
    return res.json({ ok: true, saveText: data.saveText, name: data.name ?? '', savedAt: data.savedAt ?? 0 });
  });

  app.put('/api/save/:playerId', async (req, res) => {
    if (!appSecretValid(req)) return res.status(401).json({ ok: false, reason: 'Acesso negado' });
    if (!PLAYER_ID_RE.test(req.params.playerId)) return res.status(400).json({ ok: false, reason: 'Jogador inválido' });
    if (rateLimited(`save:${req.params.playerId}`, 30)) return res.status(429).json({ ok: false, reason: 'Muitas requisições — aguarde um minuto' });
    const { saveText, name, savedAt } = req.body ?? {};
    if (typeof saveText !== 'string' || saveText.length < 10 || saveText.length > 2_000_000) {
      return res.status(400).json({ ok: false, reason: 'Save inválido ou grande demais' });
    }
    const cleanName = typeof name === 'string' ? name.replace(/[\u0000-\u001f]/g, '').slice(0, 40) : '';
    const at = Number.isFinite(savedAt) ? savedAt : Date.now();
    await kvSet(`save:${req.params.playerId}`, { saveText, name: cleanName, savedAt: at });
    console.log(`[save] player ${req.params.playerId} · ${saveText.length} chars`);
    return res.json({ ok: true, savedAt: at });
  });

  // ── ranking global ──
  app.get('/api/rank', async (req, res) => {
    const kind = String(req.query.kind ?? 'prestige');
    if (!RANK_KINDS.has(kind)) return res.status(400).json({ ok: false, reason: 'Categoria inválida' });
    // cache curto no processo (1 min) — ranking não precisa ser realtime
    if (rankCache && Date.now() - rankCacheAt < RANK_CACHE_MS && rankCache.kind === kind) {
      return res.json({ ok: true, kind, list: rankCache.list });
    }
    const list = (await kvGetJson(rankKey(kind))) ?? [];
    rankCache = { kind, list: Array.isArray(list) ? list : [] };
    rankCacheAt = Date.now();
    return res.json({ ok: true, kind, list: rankCache.list });
  });

  app.post('/api/rank', async (req, res) => {
    if (!appSecretValid(req)) return res.status(401).json({ ok: false, reason: 'Acesso negado' });
    const { playerId, name, kind, gain, count, at } = req.body ?? {};
    if (!RANK_KINDS.has(kind)) return res.status(400).json({ ok: false, reason: 'Categoria inválida' });
    if (!PLAYER_ID_RE.test(String(playerId))) return res.status(400).json({ ok: false, reason: 'Jogador inválido' });
    if (typeof gain !== 'string' || !/^[0-9.eE+-]{1,100}$/.test(gain)) return res.status(400).json({ ok: false, reason: 'Ganho inválido' });
    try {
      new Decimal(gain);
    } catch {
      return res.status(400).json({ ok: false, reason: 'Ganho inválido' });
    }
    if (rateLimited(`rank:${String(playerId)}`, 60)) return res.status(429).json({ ok: false, reason: 'Muitas requisições — aguarde um minuto' });
    const cleanName = typeof name === 'string' ? name.replace(/[\u0000-\u001f]/g, '').slice(0, 40) : 'Jogador';
    const { position } = await submitRank({
      playerId: String(playerId),
      name: cleanName || 'Jogador',
      kind,
      gain,
      count: Number.isFinite(count) ? count : 0,
      at: Number.isFinite(at) ? at : Date.now(),
    });
    return res.json({ ok: true, position });
  });

  /** App → cria cobrança Pix e devolve o QR para exibir. */
  app.post('/api/pix/charge', async (req, res) => {
    if (!appSecretValid(req)) return res.status(401).json({ ok: false, reason: 'Acesso negado' });
    const { packId, playerId, payerEmail } = req.body ?? {};
    const pack = await resolvePack(String(packId ?? ''));
    if (!pack) return res.status(400).json({ ok: false, reason: 'Pacote inexistente' });
    if (!Number.isInteger(playerId) || playerId <= 0) return res.status(400).json({ ok: false, reason: 'Jogador inválido' });
    const r = await createPixCharge(pack, playerId, typeof payerEmail === 'string' ? payerEmail.slice(0, 100) : undefined);
    if (!r.ok) return res.status(502).json({ ok: false, reason: r.reason });
    // metadado do pedido (rastreio + conteúdo AUTORITATIVO a entregar quando
    // aprovado) — o app nunca decide o que recebe, o conteúdo vem do catálogo
    // do servidor e é persistido aqui para /api/pix/status devolver na hora.
    const isPass = String(packId) === 'premium_pass';
    const content = isPass ? undefined : packContent(pack);
    await kvSet(`pixOrder:${r.id}`, { packId, playerId, at: Date.now(), ...(content ? { content } : {}) }, 3600);
    console.log(`[charge] pedido ${r.id} · ${pack.name} · R$ ${pack.priceBRL} · player ${playerId}`);
    return res.json({
      ok: true,
      orderId: r.id,
      status: r.status,
      pixCode: r.qrCode,
      qrCodeBase64: r.qrCodeBase64,
      amountBRL: pack.priceBRL,
      ...(content ? { content } : {}),
    });
  });

  /** Admin → lista pacotes customizados publicados (para a loja). */
  app.get('/api/packs', async (req, res) => {
    if (!appSecretValid(req)) return res.status(401).json({ ok: false, reason: 'Acesso negado' });
    const packs = await getCustomPacks();
    return res.json({ ok: true, packs });
  });

  /** Admin → cria/atualiza um pacote customizado (preço sempre validado aqui). */
  app.post('/api/packs', async (req, res) => {
    if (!appSecretValid(req)) return res.status(401).json({ ok: false, reason: 'Acesso negado' });
    if (rateLimited('packs:write', 30)) return res.status(429).json({ ok: false, reason: 'Muitas requisições — aguarde um minuto' });
    const s = sanitizePack(req.body ?? {});
    if (!s.ok) return res.status(400).json({ ok: false, reason: s.reason });
    const list = await getCustomPacks();
    const idx = list.findIndex((p) => p.id === s.pack.id);
    if (idx >= 0) list[idx] = s.pack;
    else list.push(s.pack);
    await saveCustomPacks(list);
    console.log(`[packs] ${idx >= 0 ? 'atualizado' : 'criado'} ${s.pack.id} — ${s.pack.name} · R$ ${s.pack.priceBRL}`);
    return res.json({ ok: true, pack: s.pack });
  });

  /** Admin → remove um pacote customizado. */
  app.delete('/api/packs/:id', async (req, res) => {
    if (!appSecretValid(req)) return res.status(401).json({ ok: false, reason: 'Acesso negado' });
    const id = req.params.id;
    const list = await getCustomPacks();
    const next = list.filter((p) => p.id !== id);
    if (next.length === list.length) return res.status(404).json({ ok: false, reason: 'Pacote inexistente' });
    await saveCustomPacks(next);
    console.log(`[packs] removido ${id}`);
    return res.json({ ok: true });
  });

  // ── heartbeat do app (sinal oculto — presença + ponteiro de atualização) ──
  // O jogo envia um POST /api/heartbeat a cada 1 minuto (sem UI). O servidor:
  //   1. registra a presença do jogador (expira sozinho em 3 min sem sinal);
  //   2. devolve o "ponteiro de atualização" (versão + conteúdo exportado) —
  //      o app compara e, se mudou, re-sincroniza o conteúdo NA HORA.
  app.post('/api/heartbeat', async (req, res) => {
    if (!appSecretValid(req)) return res.status(401).json({ ok: false, reason: 'Acesso negado' });
    const { playerId, gameVersion } = req.body ?? {};
    if (rateLimited(`heartbeat:${String(playerId ?? '')}`, 60)) return res.status(429).json({ ok: false, reason: 'Muitas requisições — aguarde um minuto' });
    if (PLAYER_ID_RE.test(String(playerId ?? ''))) {
      try {
        await kvSet(
          `presence:${playerId}`,
          { at: Date.now(), gameVersion: typeof gameVersion === 'string' ? gameVersion.slice(0, 20) : '' },
          180, // TTL de 3 min — sem sinal, o registro de presença some sozinho
        );
        // presença POR CONTA (para a lista de amigos): se o heartbeat carrega a
        // sessão, registra o mesmo sinal sob o nome de usuário — o TTL de 3 min
        // faz o amigo sumir do online sozinho quando para de jogar
        const token = String(req.headers['x-account-token'] ?? '');
        if (/^[0-9a-f]{64}$/.test(token)) {
          const session = await kvGetJson(`account:session:${token}`);
          if (session && typeof session.username === 'string') {
            await kvSet(
              `presence:name:${String(session.username).trim().toLowerCase()}`,
              { playerId: Number(playerId), at: Date.now() },
              180,
            );
          }
        }
      } catch (err) {
        console.error('[heartbeat] falha ao registrar presença:', err);
      }
    }
    const c = loadContent();
    return res.json({
      ok: true,
      ts: Date.now(),
      gameVersion: c.gameVersion,
      contentUpdatedAt: c.exportedAt ?? null,
      maintenance: Array.isArray(c.maintenance) && c.maintenance.length > 0,
    });
  });

  // ── jogadores online (presença do heartbeat — TTL de 3 min) ──
  app.get('/api/online', async (req, res) => {
    if (!appSecretValid(req)) return res.status(401).json({ ok: false, reason: 'Acesso negado' });
    if (rateLimited('online:read', 60)) return res.status(429).json({ ok: false, reason: 'Muitas requisições — aguarde um minuto' });
    const cutoff = Date.now() - 180_000; // mesmo TTL da presença: só quem sinalizou nos últimos 3 min
    const keys = await kvKeys('presence:');
    const online = [];
    for (const key of keys) {
      const playerId = key.slice('presence:'.length);
      if (!PLAYER_ID_RE.test(playerId)) continue;
      const data = await kvGetJson(key);
      if (!data || typeof data.at !== 'number' || data.at < cutoff) continue;
      online.push({ playerId, gameVersion: typeof data.gameVersion === 'string' ? data.gameVersion : '', lastSeenAt: data.at });
    }
    online.sort((a, b) => b.lastSeenAt - a.lastSeenAt); // mais recente primeiro
    return res.json({ ok: true, count: online.length, online });
  });

  /** App → polling do status de um pedido. */
  app.get('/api/pix/status/:id', async (req, res) => {
    if (!appSecretValid(req)) return res.status(401).json({ ok: false, reason: 'Acesso negado' });
    const s = await getPaymentStatus(req.params.id);
    // pedido aprovado → o servidor ENTREGA: recibo assinado (passe, chave
    // privada) ou o conteúdo autoritativo rastreado na cobrança (fichas/moedas/)
    // diamantes). O app concede exatamente o que vier daqui — o save não manda.
    let receipt;
    let content;
    if (s.status === 'approved') {
      const meta = await kvGetJson(`pixOrder:${req.params.id}`);
      if (meta?.packId === 'premium_pass' && receiptKey && Number.isInteger(meta.playerId) && meta.playerId > 0) {
        receipt = signServerReceipt(req.params.id, meta.playerId);
      } else if (meta?.content && typeof meta.content === 'object') {
        content = meta.content;
      }
    }
    return res.json({
      ok: s.status !== 'invalid' && s.status !== 'unknown',
      ...s,
      ...(receipt ? { receipt } : {}),
      ...(content ? { content } : {}),
    });
  });

  /** Mercado Pago → notificação de pagamento (webhook). */
  app.post('/api/pix/webhook', async (req, res) => {
    if (!signatureValid(req)) {
      console.warn('[webhook] assinatura inválida — ignorado');
      return res.status(401).json({ ok: false, reason: 'Assinatura inválida' });
    }
    const dataId = req.body?.data?.id ?? req.query?.['data.id'];
    if (!dataId) return res.status(200).json({ ok: true }); // notificação sem id — nada a fazer
    const s = await getPaymentStatus(String(dataId));
    console.log(`[webhook] payment ${dataId} → ${s.status}${s.detail ? ` (${s.detail})` : ''}`);
    return res.status(200).json({ ok: true });
  });

  // ── sistema de contas (registro, verificação, login, recuperação, save automático) ──
  // E-mails (agradecimento, confirmação, recuperação) via Gmail SMTP (nodemailer).
  // Sem GMAIL_USER/GMAIL_APP_PASSWORD → modo dev (códigos no console + devCode).
  attachAccountRoutes(app, { env, kvGetJson, kvSet, kvKeys, rateLimited });

  return app;
}

/**
 * Sobe o servidor em `port` (0 = porta livre). Retorna o http.Server —
 * útil para testes que precisam de uma porta efêmera.
 */
export function startServer(port = 8787, env = process.env) {
  const app = createApp(env);
  const server = app.listen(port, '0.0.0.0', () => {
    const actual = typeof server.address() === 'object' ? server.address()?.port : port;
    console.log(`✅ Pix server rodando em ${(env.BASE_URL ?? `http://localhost:${actual}`).replace(/\/$/, '')} (porta ${actual})`);
  });
  return server;
}

// ── auto-start quando executado diretamente: node index.js ──
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const env = process.env;
  if (!env.MERCADO_PAGO_ACCESS_TOKEN) {
    console.error('❌ MERCADO_PAGO_ACCESS_TOKEN não definido. Copie server/.env.example para server/.env e preencha.');
  }
  if (!env.APP_SHARED_SECRET) {
    console.warn('⚠️ APP_SHARED_SECRET não definido — o endpoint de cobrança não exige segredo do app (apenas dev).');
  }
  const server = startServer(Number(env.PORT ?? 8787), env);
  if (!env.MERCADO_PAGO_WEBHOOK_SECRET) {
    console.warn('⚠️ MERCADO_PAGO_WEBHOOK_SECRET não definido — webhooks serão rejeitados.');
  }
  if (!env.RECEIPT_PRIVATE_KEY) {
    console.warn('⚠️ RECEIPT_PRIVATE_KEY não definido — recibos do Passe Premium não serão emitidos. Gere com: npm run gen:receipt-keys');
  } else if (env.RECEIPT_PRIVATE_KEY === '202a7eff7bc44a12972e6ea5fae5d6b55e1bb82ee550003d11cc0b155df10cb6') {
    console.warn('⚠️ RECEIPT_PRIVATE_KEY é a chave de DESENVOLVIMENTO (pública no repositório) — gere a SUA com `npm run gen:receipt-keys` e faça build novo do app com a pública correspondente.');
  }
}
