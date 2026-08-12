/**
 * check-env.mjs — verifica as variáveis de ambiente do backend no Vercel (ou local).
 *
 * Uso:
 *   npm run check:env                       # usa a URL padrão de produção (GameConfig)
 *   npm run check:env -- https://seu-projeto.vercel.app
 *   npm run check:env -- --json             # saída JSON no final (scripts/CI)
 *
 * Testa de ponta a ponta, sem precisar ler valores do painel (o Vercel os esconde):
 *   1. GET  /api/health        → MP token configurado? KV (Upstash) configurado?
 *   2. POST /api/heartbeat     → APP_SHARED_SECRET aceito? (200 com, 401 sem)
 *   3. PUT+GET /api/save/:id   → Upstash de verdade (ida e volta) ou memória?
 *   4. GET  /api/content       → conteúdo exportado sendo servido?
 *   5. GET  /api/online        → presença do heartbeat registrada?
 *
 * Exit code: 0 = tudo ok · 1 = falha crítica (deploy errado / offline).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** playerId fixo de TESTE — reutiliza o MESMO registro do Upstash a cada execução
 *  (não há endpoint de DELETE; evita acumular lixo no KV de produção). */
const TEST_PLAYER_ID = '999999999999';

/** Lê GameConfig.ts e extrai backendUrl/appSharedSecret (evita compilar TS). */
function readGameConfig() {
  const ts = readFileSync(path.join(root, 'src', 'config', 'GameConfig.ts'), 'utf8');
  const url = ts.match(/backendUrl:\s*'([^']+)'/)?.[1] ?? '';
  const secret = ts.match(/appSharedSecret:\s*'([^']+)'/)?.[1] ?? '';
  return { backendUrl: url.replace(/\/+$/, ''), appSharedSecret: secret };
}

const args = process.argv.slice(2);
const jsonMode = args.includes('--json');
const cfg = readGameConfig();
// ignora argumentos vazios (ex.: GitHub Actions expande ${{ vars.X }} vazio)
const base = (args.find((a) => a && !a.startsWith('-')) ?? cfg.backendUrl).replace(/\/+$/, '');

const results = {}; // variável → veredito
const notes = [];

function record(key, ok, detail, { informational = false } = {}) {
  results[key] = { ok, detail, informational };
  const icon = ok ? '✅' : informational ? 'ℹ️' : '❌';
  console.log(`  ${icon} ${key}${detail ? ` — ${detail}` : ''}`);
}

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  if (jsonMode) console.log(JSON.stringify({ base, results, failed: 'critical' }, null, 2));
  process.exit(1);
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const redirected = res.redirected; // Vercel Authentication → 302 para SSO
  let body = null;
  try { body = await res.json(); } catch { /* não-JSON (404 HTML etc.) */ }
  return { status: res.status, redirected, body };
}

async function run() {
  console.log(`🔍 Verificação do backend: ${base}\n`);

  // ── 1. health: MP token + KV (Upstash) + versão ──────────────────────────────
  const health = await fetchJson(`${base}/api/health`, {
    headers: { 'x-app-secret': cfg.appSharedSecret },
  });

  if (health.redirected) {
    fail('Vercel Authentication está ATIVA (302 → SSO). Desative em Settings → Deployment Protection.');
  }
  if (health.status === 404) {
    fail(`404 em /api/health — o deploy não está servindo o backend. Confira se o projeto usa o DEPLOY UNIFICADO (vercel.json na raiz com rewrites /api/*) e se o deploy de produção é o mais recente.`);
  }
  if (health.status !== 200 || !health.body?.ok) {
    fail(`/api/health respondeu ${health.status} — ${JSON.stringify(health.body)}`);
  }

  console.log(`  ℹ️  health: ${JSON.stringify(health.body)}`);
  record(
    'MERCADO_PAGO_ACCESS_TOKEN',
    health.body.mp === 'configured',
    health.body.mp === 'configured' ? 'token presente (pagamentos ativos)' : "AUSENTE no Vercel (mp: 'missing-token')",
  );
  record(
    'UPSTASH_REDIS_REST_URL / _TOKEN',
    health.body.kv === 'configured',
    health.body.kv === 'configured' ? 'KV configurado (nuvem + ranking)' : "em MEMÓRIA — variáveis Upstash não chegaram",
  );
  record(
    'GMAIL_USER / GMAIL_APP_PASSWORD',
    health.body.email === 'configured',
    health.body.email === 'configured' ? 'e-mails da conta ativos (Gmail SMTP)' : 'MODO DEV — códigos só no console (sem e-mails reais)',
    { informational: health.body.email !== 'configured' },
  );

  // ── 2. APP_SHARED_SECRET: heartbeat com e sem o segredo ──────────────────────
  const hbWith = await fetchJson(`${base}/api/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-app-secret': cfg.appSharedSecret },
    body: JSON.stringify({ playerId: TEST_PLAYER_ID, gameVersion: 'check-env' }),
  });
  const hbWithout = await fetchJson(`${base}/api/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playerId: TEST_PLAYER_ID, gameVersion: 'check-env' }),
  });
  record(
    'APP_SHARED_SECRET',
    hbWith.status === 200 && hbWithout.status === 401,
    hbWith.status === 200 && hbWithout.status === 401
      ? 'aceito (200 com segredo · 401 sem)'
      : `com=${hbWith.status} · sem=${hbWithout.status} — segredo vazio/errado no Vercel`,
  );

  // ── 3. Upstash de verdade: ida e volta do save na nuvem ──────────────────────
  const saveText = `check-env-${Date.now()}-abcdefghij`; // >= 10 chars (validação do server)
  const put = await fetchJson(`${base}/api/save/${TEST_PLAYER_ID}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-app-secret': cfg.appSharedSecret },
    body: JSON.stringify({ saveText, name: 'check-env' }),
  });
  const get = await fetchJson(`${base}/api/save/${TEST_PLAYER_ID}`, {
    headers: { 'x-app-secret': cfg.appSharedSecret },
  });
  const persisted = put.status === 200 && get.status === 200 && get.body?.saveText === saveText;
  record(
    'PERSISTÊNCIA (Upstash real)',
    persisted,
    persisted ? 'save gravado e lido de volta igual' : 'não persistiu (memória? PUT/GET falhou?)',
  );
  if (health.body.kv === 'configured' && !persisted) {
    notes.push('⚠️  health diz kv:configured mas o save não persistiu — confira se UPSTASH_REDIS_REST_URL/_TOKEN são do MESMO database.');
  }

  // ── 4. Conteúdo online ───────────────────────────────────────────────────────
  const content = await fetchJson(`${base}/api/content`);
  record(
    'CONTEÚDO (content.json)',
    content.status === 200 && Array.isArray(content.body?.content?.updates),
    content.status === 200
      ? `v${content.body.content.gameVersion} · ${content.body.content.updates?.length} updates`
      : `status ${content.status}`,
  );

  // ── 5. Presença do heartbeat registrada (GET /api/online) ────────────────────
  const online = await fetchJson(`${base}/api/online`, {
    headers: { 'x-app-secret': cfg.appSharedSecret },
  });
  const seen = online.body?.online?.some((p) => String(p.playerId) === TEST_PLAYER_ID) === true;
  record(
    'HEARTBEAT → presença online',
    seen,
    seen ? `player ${TEST_PLAYER_ID} apareceu no /api/online` : 'sinal enviado mas presença não registrada',
  );

  // ── 6. BASE_URL (informativo — só afeta o webhook do MP; comparação só faz
  //        sentido quando o alvo é o servidor local, onde o .env existe) ────────
  const isLocal = /localhost|127\.0\.0\.1/.test(base);
  if (isLocal) {
    let localBase = '';
    try {
      localBase = readFileSync(path.join(root, 'server', '.env'), 'utf8').match(/^BASE_URL=(.*)$/m)?.[1]?.trim() ?? '';
    } catch { /* sem .env local — ignora */ }
    record(
      'BASE_URL (webhook MP)',
      !localBase || localBase.replace(/\/+$/, '') === base,
      localBase ? `no .env local está ${localBase}` : '(vazio no .env local — OK)',
      { informational: true },
    );
  } else {
    record('BASE_URL (webhook MP)', true, 'não verificável remotamente — confira no painel Vercel (deve ser a URL pública do deploy)', { informational: true });
  }

  // ── resumo ───────────────────────────────────────────────────────────────────
  const failed = Object.values(results).filter((r) => !r.ok && !r.informational).length;
  console.log(`\n${failed === 0 ? '🎉 Tudo OK' : `⚠️  ${failed} verificação(ões) falharam`} — ${Object.keys(results).length} no total.`);
  notes.forEach((n) => console.log(n));

  if (jsonMode) {
    console.log(JSON.stringify({ base, results, failed }, null, 2));
  }
  process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(`\n❌ Falha de conexão com ${base} — servidor offline ou URL errada. (${err?.message ?? err})`);
  if (jsonMode) console.log(JSON.stringify({ base, results, failed: 'critical' }, null, 2));
  process.exit(1);
});
