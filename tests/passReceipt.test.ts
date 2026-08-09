import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { signPassReceipt, verifyPassReceipt } from '../src/security/passReceipt';
import { validateState } from '../src/save/validation';
import { SEASON_ID } from '../src/content/seasons';

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
});

describe('Recibo no ciclo do save (validação)', () => {
  it('compra legítima sobrevive à validação (owned + recibo preservados)', async () => {
    const e = new GameEngine();
    const r = await e.buyPremiumPass();
    expect(r.ok).toBe(true);
    const { state, result } = validateState(e.state);
    expect(state.premiumPass.owned).toBe(true);
    expect(state.premiumPass.signature.length).toBeGreaterThan(0);
    expect(state.premiumPass.orderId).toMatch(/^local-/);
    expect(result.fixed).not.toContain(expect.stringContaining('revogada'));
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
    const e = new GameEngine();
    await e.buyPremiumPass();
    e.state.premiumPass.season = 'season_antiga';
    e.syncPremiumPassSeason(); // mantém owned, reseta xp/reivindicações
    expect(e.state.premiumPass.season).toBe(SEASON_ID);
    const { state } = validateState(e.state);
    expect(state.premiumPass.owned).toBe(true);
  });
});
