/**
 * Armazenamento chave-valor do servidor (saves na nuvem + ranking).
 *
 * - Se UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN estiverem definidos
 *   (painel Upstash → seu database → REST API), usa o Redis serverless via
 *   REST — funciona em funções serverless do Vercel sem conexão persistente.
 * - Caso contrário (dev / testes), usa um Map em memória — os dados somem ao
 *   reiniciar o processo.
 *
 * Valores grandes (saves ~100 KB) são enviados via POST com corpo JSON
 * (["SET", key, value]) — nunca pela URL, que tem limite de tamanho.
 */
const memory = new Map();

function configured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

/** Roda um comando Redis via REST (corpo JSON — sem limites de URL). */
async function redisCommand(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL.replace(/\/+$/, '');
  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
    },
    body: JSON.stringify([command]),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  const data = await res.json();
  const first = Array.isArray(data) ? data[0] : data;
  if (first?.error) return null; // erro do Redis → trata como ausente, nunca devolve a mensagem como dado
  return first?.result ?? null;
}

/** Lê um valor (null se não existir). */
export async function kvGet(key) {
  if (configured()) {
    try {
      return (await redisCommand(['GET', key])) ?? null;
    } catch (err) {
      console.error('[kv] GET falhou:', err);
      return null;
    }
  }
  return memory.get(key) ?? null;
}

/** Grava um valor (serializa para JSON). `ttlSeconds` opcional. */
export async function kvSet(key, value, ttlSeconds) {
  const json = JSON.stringify(value);
  if (configured()) {
    try {
      const cmd = ttlSeconds ? ['SET', key, json, 'EX', String(ttlSeconds)] : ['SET', key, json];
      const result = await redisCommand(cmd);
      return result === 'OK';
    } catch (err) {
      console.error('[kv] SET falhou:', err);
      return false;
    }
  }
  memory.set(key, json);
  return true;
}

/** Lê um valor já desserializado (ou null). */
export async function kvGetJson(key) {
  const raw = await kvGet(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
