/**
 * Gera um par de chaves Ed25519 para os recibos do Passe Premium.
 *
 * Uso: npm run gen:receipt-keys
 *
 * Saída:
 *  - RECEIPT_PRIVATE_KEY → seed de 32 bytes (hex). Coloque no SERVIDOR
 *    (Vercel → Settings → Environment Variables) e NUNCA no app.
 *  - Chave pública (hex) → cole em GameConfig.pass.receiptPublicKey e faça
 *    um novo build do app — o par público/privado precisa combinar.
 */
import { generateKeyPairSync, sign, verify } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
// PKCS#8 do Ed25519 = prefixo fixo (16 bytes) + seed (32 bytes)
const pkcs8 = privateKey.export({ format: 'der', type: 'pkcs8' });
const seed = pkcs8.subarray(-32).toString('hex');
// SPKI do Ed25519 = prefixo fixo (12 bytes) + chave pública (32 bytes)
const spki = publicKey.export({ format: 'der', type: 'spki' });
const pub = spki.subarray(-32).toString('hex');

// valida o par antes de imprimir (nunca exiba chaves quebradas)
const msg = Buffer.from('premium_pass|validacao');
const sig = sign(null, msg, privateKey);
if (!verify(null, msg, publicKey, sig)) {
  console.error('❌ par de chaves inválido — gere novamente');
  process.exit(1);
}

console.log(`
🔑 Par de chaves Ed25519 (recibos do Passe Premium) — gerado e validado
==========================================================
RECEIPT_PRIVATE_KEY=${seed}
  → variável de ambiente do SERVIDOR (Vercel/Railway). NUNCA no app.

Chave pública (hex) = ${pub}
  → GameConfig.pass.receiptPublicKey + novo build do app (o par deve combinar).
`);
