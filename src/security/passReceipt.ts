/**
 * Recibo assinado do Passe Premium.
 *
 * A posse do passe (`premiumPass.owned`) só é aceita se o save carregar um
 * recibo de compra assinado com a chave local. Assim, editar o save para
 * `owned: true` (ou copiar um save de outra pessoa) deixa de funcionar: a
 * validação revoga o passe quando o recibo não confere.
 *
 * ⚠ Modelo local (mesmo padrão do PIN de admin): a chave está embutida no
 * binário, então isto é proteção contra edição casual do save — não é
 * segurança contra um atacante determinado que descompile o app. Numa versão
 * online, o recibo passaria a ser assinado pelo backend com a chave real.
 */

/** Produto assinado por este módulo. */
export const PASS_PRODUCT_ID = 'premium_pass';

/**
 * Chave local de assinatura — nunca persiste no save.
 * Longa e com entropia: impede forjar um recibo editando o JSON do save.
 */
const PASS_RECEIPT_KEY = 'nc-pass-receipt-v1::7f3a9c1e5b8d2f4a6c0e9d8b7a5f3c2e1d4b6a8f9c0e2d4a6b8c0d2e4f6a8b0c';

/** Canôniza os campos do recibo (ordem fixa → digest determinístico). */
function canon(orderId: string, timestamp: number, playerId: number): string {
  return `${PASS_PRODUCT_ID}|${orderId}|${timestamp}|${playerId}`;
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

/** Assina um recibo de compra legítimo (usado pela camada de pagamento). */
export function signPassReceipt(opts: ReceiptFields): string {
  return digestFor(opts);
}

/** Verifica um recibo armazenado contra os campos do save. */
export function verifyPassReceipt(receipt: unknown, opts: ReceiptFields): boolean {
  if (typeof receipt !== 'string' || receipt.length === 0) return false;
  const expected = digestFor(opts);
  // comparação constant-time (não revela prefixos da assinatura)
  if (receipt.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < receipt.length; i++) diff |= receipt.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
