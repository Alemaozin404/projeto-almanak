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

/**
 * Adiciona um membro a um SET (SADD). Retorna true se o membro era NOVO
 * (não estava no set) — útil para contagens únicas (DAU, instalação).
 */
export async function kvSAdd(key, member, ttlSeconds) {
  if (configured()) {
    try {
      const result = await redisCommand(['SADD', key, String(member)]);
      if (ttlSeconds) {
        try { await redisCommand(['EXPIRE', key, String(ttlSeconds)]); } catch { /* best-effort */ }
      }
      return Number(result) === 1;
    } catch (err) {
      console.error('[kv] SADD falhou:', err);
      return false;
    }
  }
  const set = memorySet(key);
  if (set.has(String(member))) return false;
  set.add(String(member));
  return true;
}

/** Lista os membros de um set (SMEMBERS). */
export async function kvSMembers(key) {
  if (configured()) {
    try {
      const result = await redisCommand(['SMEMBERS', key]);
      return Array.isArray(result) ? result.map(String) : [];
    } catch (err) {
      console.error('[kv] SMEMBERS falhou:', err);
      return [];
    }
  }
  return [...memorySet(key)];
}

/** Tamanho de um set (SCARD). */
export async function kvSCard(key) {
  if (configured()) {
    try {
      const result = await redisCommand(['SCARD', key]);
      return Number(result) || 0;
    } catch (err) {
      console.error('[kv] SCARD falhou:', err);
      return 0;
    }
  }
  return memorySet(key).size;
}

/**
 * Incrementa um contador (INCRBY). Retorna o novo valor.
 * Usa um valor distinto do namespace de strings (não conflita com kvGet/kvSet).
 */
export async function kvIncr(key, by = 1, ttlSeconds) {
  if (configured()) {
    try {
      const result = await redisCommand(['INCRBY', key, String(by)]);
      if (ttlSeconds) {
        try { await redisCommand(['EXPIRE', key, String(ttlSeconds)]); } catch { /* best-effort */ }
      }
      return Number(result) || 0;
    } catch (err) {
      console.error('[kv] INCR falhou:', err);
      return 0;
    }
  }
  const n = (Number(memory.get(`incr:${key}`)) || 0) + by;
  memory.set(`incr:${key}`, String(n));
  return n;
}

/** Lê um contador incrementado (sem incrementar). */
export async function kvGetIncr(key) {
  if (configured()) {
    try {
      const result = await redisCommand(['GET', key]);
      return Number(result) || 0;
    } catch {
      return 0;
    }
  }
  return Number(memory.get(`incr:${key}`)) || 0;
}

/** Set em memória (testes/dev sem Upstash) — namespace próprio para não conflitar. */
const memorySets = new Map();
function memorySet(key) {
  let s = memorySets.get(key);
  if (!s) {
    s = new Set();
    memorySets.set(key, s);
  }
  return s;
}

/**
 * Lista as chaves com um prefixo (ex.: 'presence:').
 * - Upstash: SCAN iterativo (MATCH `${prefix}*`);
 * - memória: filtra as chaves do Map.
 */
export async function kvKeys(prefix) {
  if (configured()) {
    try {
      const keys = [];
      let cursor = '0';
      do {
        const cmd = ['SCAN', cursor, 'MATCH', `${prefix}*`, 'COUNT', '500'];
        const result = await redisCommand(cmd);
        if (!Array.isArray(result) || !Array.isArray(result[1])) break;
        cursor = String(result[0] ?? '0');
        keys.push(...result[1].map(String));
      } while (cursor !== '0' && keys.length < 10000);
      return keys;
    } catch (err) {
      console.error('[kv] SCAN falhou:', err);
      return [];
    }
  }
  return [...memory.keys()].filter((k) => k.startsWith(prefix));
}
