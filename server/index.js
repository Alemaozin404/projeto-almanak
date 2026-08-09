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
 *
 * Configuração (server/.env → Vercel Environment Variables):
 *   MERCADO_PAGO_ACCESS_TOKEN=APP_USR-...      (obrigatório p/ pagamentos)
 *   MERCADO_PAGO_WEBHOOK_SECRET=...            (obrigatório — painel MP → Webhooks)
 *   APP_SHARED_SECRET=...                      (proteção leve app→backend)
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
import { kvGetJson, kvSet } from './store.js';

// Carrega server/.env (independente do cwd). No Vercel as variáveis vêm do
// painel — o dotenv simplesmente não encontra o arquivo e segue em frente.
const __serverDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__serverDir, '.env') });

const MP_API = 'https://api.mercadopago.com';

// ── conteúdo online (server/content.json — gerado por npm run content:export) ──
const CONTENT_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'content.json');

let contentCache = null;

function loadContent() {
  if (contentCache) return contentCache;
  try {
    contentCache = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
  } catch {
    // sem arquivo exportado (dev sem rodar o script): conteúdo vazio, jogo usa o local
    contentCache = { gameVersion: '0.0.0', updates: [], news: [], banners: [], events: [], seasons: [], codes: [], maintenance: [] };
  }
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

/** Pacotes de fichas — os PREÇOS são definidos AQUI (o cliente nunca define valor). */
const FICHA_PACKS = {
  fichas_100: { name: '100 Fichas', fichas: 100, priceBRL: 6.25 },
  fichas_300: { name: '300 Fichas', fichas: 300, priceBRL: 17.5 },
  fichas_800: { name: '800 Fichas', fichas: 800, priceBRL: 45.0 },
  fichas_2000: { name: '2.000 Fichas', fichas: 2000, priceBRL: 105.0 },
};

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
    const hasKv = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
    res.json({ ok: true, mp: ACCESS_TOKEN ? 'configured' : 'missing-token', kv: hasKv ? 'configured' : 'memory', version: loadContent().gameVersion });
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
    const pack = FICHA_PACKS[packId];
    if (!pack) return res.status(400).json({ ok: false, reason: 'Pacote inexistente' });
    if (!Number.isInteger(playerId) || playerId <= 0) return res.status(400).json({ ok: false, reason: 'Jogador inválido' });
    const r = await createPixCharge(pack, playerId, typeof payerEmail === 'string' ? payerEmail.slice(0, 100) : undefined);
    if (!r.ok) return res.status(502).json({ ok: false, reason: r.reason });
    console.log(`[charge] pedido ${r.id} · ${pack.name} · R$ ${pack.priceBRL} · player ${playerId}`);
    return res.json({
      ok: true,
      orderId: r.id,
      status: r.status,
      pixCode: r.qrCode,
      qrCodeBase64: r.qrCodeBase64,
      amountBRL: pack.priceBRL,
    });
  });

  /** App → polling do status de um pedido. */
  app.get('/api/pix/status/:id', async (req, res) => {
    if (!appSecretValid(req)) return res.status(401).json({ ok: false, reason: 'Acesso negado' });
    const s = await getPaymentStatus(req.params.id);
    return res.json({ ok: s.status !== 'invalid' && s.status !== 'unknown', ...s });
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
}
