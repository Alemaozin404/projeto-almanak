import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { GameEngine } from '../src/game/engine';
import { signPassReceipt, verifyPassReceipt } from '../src/security/passReceipt';
import { validateState } from '../src/save/validation';
import { SEASON_ID } from '../src/content/seasons';
import { GameConfig } from '../src/config/GameConfig';

/** Seed da chave PRIVADA de teste — casa com GameConfig.pass.receiptPublicKey. */
const RECEIPT_SEED = 'e0d471744613806eb1f58fcc3492ea4aaf1148894ab568834a0c9bb9217c200a';
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/** Assina um recibo `srv2:` como o servidor faria (Ed25519 com a seed privada). */
function signServerReceiptForTest(orderId: string, playerId: number): string {
  const key = crypto.createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(RECEIPT_SEED, 'hex')]),
    format: 'der',
    type: 'pkcs8',
  });
  const sig = crypto.sign(null, Buffer.from(`premium_pass|${orderId}|${playerId}`, 'utf8'), key);
  return `srv2:${sig.toString('hex')}`;
}

/** Força o modo simulado local (sem rede) para compras do passe. */
function withLocalMode() {
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k === GameConfig.wallet.backendUrlKey ? '' : null),
    setItem: () => {},
    removeItem: () => {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Recibo assinado do Passe Premium', () => {
  const opts = { orderId: 'local-123-456', timestamp: 1700000000000, playerId: 987654 };

  it('assinatura determinística e verificável', () => {
    const sig = signPassReceipt(opts);
    expect(sig).toMatch(/^[0-9a-f]{16}$/);
    expect(signPassReceipt(opts)).toBe(sig); // mesmo recibo → mesma assinatura
    expect(verifyPassReceipt(sig, opts)).toBe(true);
  });

  it('recibo adulterado é rejeitado', () => {
    const sig = signPassReceipt(opts);
    expect(verifyPassReceipt(sig, { ...opts, timestamp: opts.timestamp + 1 })).toBe(false);
    expect(verifyPassReceipt(sig, { ...opts, orderId: 'outro-pedido' })).toBe(false);
    expect(verifyPassReceipt(sig, { ...opts, playerId: 1 })).toBe(false);
    expect(verifyPassReceipt(sig, { orderId: '', timestamp: 0, playerId: 0 })).toBe(false);
  });

  it('recebimento ausente/vazio nunca valida', () => {
    expect(verifyPassReceipt(undefined, opts)).toBe(false);
    expect(verifyPassReceipt('', opts)).toBe(false);
    expect(verifyPassReceipt('ffffffffffffffff', opts)).toBe(false); // forjado
    expect(verifyPassReceipt(12345, opts)).toBe(false);
  });

  it('recibo do SERVIDOR (srv2:) assinado com a chave privada é aceito', () => {
    const sig = signServerReceiptForTest(opts.orderId, opts.playerId);
    expect(sig.startsWith('srv2:')).toBe(true);
    expect(sig).toMatch(/^srv2:[0-9a-f]{128}$/);
    expect(verifyPassReceipt(sig, opts)).toBe(true);
  });

  it('recibo srv2 adulterado é rejeitado (chave pública ligada a orderId/playerId)', () => {
    const sig = signServerReceiptForTest(opts.orderId, opts.playerId);
    expect(verifyPassReceipt(sig, { ...opts, orderId: 'outro-pedido' })).toBe(false);
    expect(verifyPassReceipt(sig, { ...opts, playerId: 1 })).toBe(false);
    // assinatura corrompida
    const tampered = sig.slice(0, -4) + '0000';
    expect(verifyPassReceipt(tampered, opts)).toBe(false);
  });

  it('recibo do servidor mal-formado ou de outro esquema é rejeitado', () => {
    expect(verifyPassReceipt('srv2:abc', opts)).toBe(false);
    expect(verifyPassReceipt('srv2:', opts)).toBe(false);
    expect(verifyPassReceipt(`srv2:${'g'.repeat(128)}`, opts)).toBe(false); // não-hex
    expect(verifyPassReceipt(`srv1:${'a'.repeat(64)}`, opts)).toBe(false); // formato legado removido
    expect(verifyPassReceipt(`srv2:${'a'.repeat(128)}`, opts)).toBe(false); // forjado (não assina com a privada)
  });
});

describe('Recibo no ciclo do save (validação)', () => {
  it('compra legítima (modo local) sobrevive à validação (owned + recibo preservados)', async () => {
    withLocalMode();
    const e = new GameEngine();
    const r = await e.buyPremiumPass();
    expect(r.ok).toBe(true);
    const { state, result } = validateState(e.state);
    expect(state.premiumPass.owned).toBe(true);
    expect(state.premiumPass.signature.length).toBeGreaterThan(0);
    expect(state.premiumPass.orderId).toMatch(/^pix-/);
    expect(result.fixed).not.toContain(expect.stringContaining('revogada'));
  });

  it('passe com recibo srv2 legítimo (Pix online) sobrevive à validação do save', () => {
    const e = new GameEngine();
    e.state.premiumPass.owned = true;
    e.state.premiumPass.orderId = '424242'; // id numérico do Mercado Pago
    e.state.premiumPass.purchaseTimestamp = 1700000000000;
    e.state.premiumPass.signature = signServerReceiptForTest('424242', e.state.createdAt);
    const { state, result } = validateState(e.state);
    expect(state.premiumPass.owned).toBe(true);
    expect(result.fixed).not.toContain(expect.stringContaining('revogada'));
  });

  it('recibo srv2 de OUTRO save (playerId diferente) revoga a posse', () => {
    // assinatura ligada ao playerId: copiar o recibo para outro save não cola
    const sig = signServerReceiptForTest('424242', 111111);
    const e = new GameEngine();
    e.state.createdAt = 222222;
    e.state.premiumPass.owned = true;
    e.state.premiumPass.orderId = '424242';
    e.state.premiumPass.purchaseTimestamp = 1700000000000;
    e.state.premiumPass.signature = sig;
    const { state } = validateState(e.state);
    expect(state.premiumPass.owned).toBe(false);
    expect(state.premiumPass.signature).toBe('');
  });

  it('editar o save para owned=true sem recibo revoga a posse', () => {
    const e = new GameEngine();
    e.state.premiumPass.owned = true; // cheat: só flipou a flag
    const { state, result } = validateState(e.state);
    expect(state.premiumPass.owned).toBe(false);
    expect(state.premiumPass.signature).toBe('');
    expect(result.fixed).toContain('passe premium com recibo inválido — posse revogada');
  });

  it('revogação faz rollback dos itens exclusivos concedidos na compra', () => {
    const e = new GameEngine();
    // simula um save que já tinha os itens da compra + recibo quebrado
    e.state.premiumPass.owned = true;
    e.state.premiumPass.orderId = 'local-1-2';
    e.state.premiumPass.purchaseTimestamp = 42;
    e.state.premiumPass.signature = 'ffffffffffffffff'; // forjado
    e.state.avatarItems.push('av_cyber', 'fr_premium', 'av_default');
    e.state.titles.push('pass_premium', 'titulo_normal');
    e.state.equippedTitle = 'pass_premium';
    const { state } = validateState(e.state);
    expect(state.premiumPass.owned).toBe(false);
    expect(state.avatarItems).toEqual(['av_default']); // premium removidos, resto preservado
    expect(state.titles).toEqual(['titulo_normal']);
    expect(state.equippedTitle).toBeNull();
  });

  it('copiar recibo de outro save (playerId diferente) revoga a posse', async () => {
    // compra real em um save (playerId/createdAt fixo) e tenta aplicar o recibo
    // em outro save com createdAt diferente — a assinatura é ligada ao save.
    withLocalMode();
    const b = new GameEngine();
    b.state.createdAt = 111111;
    const r = await b.buyPremiumPass();
    expect(r.ok).toBe(true);
    const legitSig = b.state.premiumPass.signature;
    const legitOrder = b.state.premiumPass.orderId;
    const legitTs = b.state.premiumPass.purchaseTimestamp;
    const forged = new GameEngine();
    forged.state.createdAt = 222222; // outro save, outro playerId
    forged.state.premiumPass.owned = true;
    forged.state.premiumPass.orderId = legitOrder;
    forged.state.premiumPass.purchaseTimestamp = legitTs;
    forged.state.premiumPass.signature = legitSig;
    const { state } = validateState(forged.state);
    expect(state.premiumPass.owned).toBe(false); // playerId diverge → revogado
  });

  it('troca de temporada NÃO invalida o recibo (season não entra na assinatura)', async () => {
    withLocalMode();
    const e = new GameEngine();
    await e.buyPremiumPass();
    e.state.premiumPass.season = 'season_antiga';
    e.syncPremiumPassSeason(); // mantém owned, reseta xp/reivindicações
    expect(e.state.premiumPass.season).toBe(SEASON_ID);
    const { state } = validateState(e.state);
    expect(state.premiumPass.owned).toBe(true);
  });
});
