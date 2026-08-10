/**
 * Recibo assinado do Passe Premium.
 *
 * A posse do passe (`premiumPass.owned`) só é aceita se o save carregar um
 * recibo de compra válido. Assim, editar o save para `owned: true` (ou copiar
 * um save de outra pessoa) deixa de funcionar: a validação revoga o passe
 * quando o recibo não confere.
 *
 * Dois formatos:
 * - LOCAL (modo simulado de dev/teste): digest FNV-1a keyed com chave embutida
 *   no app — proteção contra edição casual do save (chave não é segredo real);
 * - SERVIDOR (`srv2:` + assinatura Ed25519): o backend assina com a chave
 *   PRIVADA (RECEIPT_PRIVATE_KEY) e o app verifica com a chave PÚBLICA
 *   embutida (GameConfig.pass.receiptPublicKey). Assimétrico = o app verifica
 *   de verdade e ninguém consegue forjar sem a chave privada do servidor.
 */
import { verify, hashes } from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { GameConfig } from '../config/GameConfig';

// o noble precisa do SHA-512 explícito (v3 é zero-dep; não assume WebCrypto)
hashes.sha512 = sha512;

/** Produto assinado por este módulo. */
export const PASS_PRODUCT_ID = 'premium_pass';

/** Prefixo dos recibos assinados pelo SERVIDOR com Ed25519. */
export const SERVER_RECEIPT_PREFIX = 'srv2:';

/**
 * Chave local de assinatura (modo simulado) — nunca persiste no save.
 * Longa e com entropia: impede forjar um recibo editando o JSON do save.
 */
const PASS_RECEIPT_KEY = 'nc-pass-receipt-v1::7f3a9c1e5b8d2f4a6c0e9d8b7a5f3c2e1d4b6a8f9c0e2d4a6b8c0d2e4f6a8b0c';

/** Canôniza os campos do recibo LOCAL (ordem fixa → digest determinístico). */
function canon(orderId: string, timestamp: number, playerId: number): string {
  return `${PASS_PRODUCT_ID}|${orderId}|${timestamp}|${playerId}`;
}

/** Mensagem assinada pelo SERVIDOR (sem timestamp — determinística p/ polling). */
function serverCanon(orderId: string, playerId: number): string {
  return `${PASS_PRODUCT_ID}|${orderId}|${playerId}`;
}

/**
 * Digest keyed de 64 bits: duas passadas FNV-1a com seeds e rodadas distintas,
 * misturando a chave por dentro. Determinístico e síncrono (sem crypto async).
 */
function keyedDigest(data: string): string {
  const mix = `${PASS_RECEIPT_KEY.length}:${PASS_RECEIPT_KEY}:${data}:${data.length}:${PASS_RECEIPT_KEY}`;
  const h1 = fnvRounds(mix, 0x811c9dc5, 9);
  const h2 = fnvRounds(mix, 0x6b1f8f3d, 17);
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function fnvRounds(data: string, seed: number, rounds: number): number {
  let h = seed;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < data.length; i++) {
      h ^= data.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    // mistura o contador da rodada para evitar colapso em digests curtos
    h ^= Math.imul(r + 1, 0x9e3779b9) >>> 0;
  }
  return h >>> 0;
}

export interface ReceiptFields {
  orderId: string;
  timestamp: number;
  playerId: number;
}

function digestFor(opts: ReceiptFields): string {
  return keyedDigest(canon(opts.orderId, opts.timestamp, opts.playerId));
}

/** hex → bytes (6 linhas, sem dep). */
function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Assina um recibo LOCAL legítimo (modo simulado — usado pela camada de pagamento). */
export function signPassReceipt(opts: ReceiptFields): string {
  return digestFor(opts);
}

/**
 * Verifica um recibo `srv2:` (assinatura Ed25519 do servidor) contra os campos
 * do save usando a chave PÚBLICA embutida. Falso em formato inválido, chave
 * divergente ou assinatura adulterada.
 */
function verifyServerReceipt(receipt: string, opts: ReceiptFields): boolean {
  if (!receipt.startsWith(SERVER_RECEIPT_PREFIX)) return false;
  const sigHex = receipt.slice(SERVER_RECEIPT_PREFIX.length);
  if (!/^[0-9a-f]{128}$/.test(sigHex)) return false; // 64 bytes de assinatura
  const pubHex = GameConfig.pass.receiptPublicKey;
  if (!/^[0-9a-f]{64}$/.test(pubHex)) return false;
  const message = new TextEncoder().encode(serverCanon(opts.orderId, opts.playerId));
  try {
    return verify(hexToBytes(sigHex), message, hexToBytes(pubHex));
  } catch {
    return false; // entradas malformadas nunca validam
  }
}

/** Verifica um recibo armazenado contra os campos do save. */
export function verifyPassReceipt(receipt: unknown, opts: ReceiptFields): boolean {
  if (typeof receipt !== 'string' || receipt.length === 0) return false;
  // recibo emitido pelo servidor (Pix online) → assinatura Ed25519 verificável
  if (receipt.startsWith(SERVER_RECEIPT_PREFIX)) {
    return verifyServerReceipt(receipt, opts);
  }
  // recibo local (modo simulado) → digest FNV keyed
  const expected = digestFor(opts);
  // comparação constant-time (não revela prefixos da assinatura)
  if (receipt.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < receipt.length; i++) diff |= receipt.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
