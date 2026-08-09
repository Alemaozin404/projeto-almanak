/**
 * Hash local para proteção do PIN de administrador.
 *
 * ⚠ Nenhuma senha/token/chave é armazenada ou embutida no código.
 * O PIN é definido pelo jogador na primeira configuração e guardado apenas
 * como hash + sal. Para uma versão online, este módulo seria substituído por
 * autenticação real no servidor (Frontend → API → Auth → Permissions → DB).
 */
const SALT_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function randomSalt(length = 12): string {
  let out = '';
  const arr = new Uint32Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < length; i++) arr[i] = Math.floor(Math.random() * 0xffffffff);
  }
  for (let i = 0; i < length; i++) out += SALT_CHARS[arr[i] % SALT_CHARS.length];
  return out;
}

/** FNV-1a 32-bit — determinístico e rápido (suficiente para hash local de PIN). */
export function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Deriva o hash armazenável de um PIN com sal. */
export function hashPin(pin: string, salt: string): string {
  return fnv1a(`${salt}::${pin}::clickmaster-local-admin`);
}

export interface StoredPin {
  salt: string;
  hash: string;
  createdAt: number;
}

export function verifyPin(stored: StoredPin | null, pin: string): boolean {
  if (!stored) return false;
  return hashPin(pin, stored.salt) === stored.hash;
}

/** Valida a força mínima do PIN (mín. 4, máx. 64). */
export function isValidPin(pin: string): boolean {
  return pin.length >= 4 && pin.length <= 64;
}
