import { describe, expect, it } from 'vitest';
import { GameEngine } from '../src/game/engine';
import { COIN_PACKS, packById, packPriceLabel } from '../src/shop/packs';
import { D } from '../src/core/bignum';

describe('Pacotes de moedas (loja de compra)', () => {
  it('catálogo tem 6 faixas de preço com valores crescentes e custo-benefício crescente', () => {
    expect(COIN_PACKS.length).toBe(6);
    expect(COIN_PACKS[0].priceBRL).toBe(3.99); // entrada
    expect(COIN_PACKS[5].priceBRL).toBe(199.99); // topo
    let lastPrice = 0;
    let lastDiaPerReal = 0;
    for (const p of COIN_PACKS) {
      expect(p.priceBRL).toBeGreaterThan(lastPrice);
      expect(p.diamonds).toBeGreaterThan(0);
      expect(D(p.gold).gt(0)).toBe(true);
      // pacotes maiores oferecem mais diamantes por real (escala)
      const diaPerReal = p.diamonds / p.priceBRL;
      expect(diaPerReal).toBeGreaterThanOrEqual(lastDiaPerReal);
      lastPrice = p.priceBRL;
      lastDiaPerReal = diaPerReal;
    }
    expect(packPriceLabel(COIN_PACKS[0])).toContain('R$');
    expect(packById('pack_popular')?.diamonds).toBeGreaterThan(0);
    expect(packById('inexistente')).toBeUndefined();
  });

  it('buyCoinPack concede moedas e diamantes', async () => {
    const e = new GameEngine();
    const r = await e.buyCoinPack('pack_starter');
    expect(r.ok).toBe(true);
    expect(r.diamonds).toBe(1000);
    expect(D(e.state.gold).toFixed(0)).toBe('25000');
    expect(D(e.state.crystals).toFixed(0)).toBe('1000');
    expect(e.state.log.some((l) => l.code === 'shop')).toBe(true);
  });

  it('pacote inexistente é rejeitado sem conceder nada', async () => {
    const e = new GameEngine();
    const r = await e.buyCoinPack('pack_nao_existe');
    expect(r.ok).toBe(false);
    expect(e.state.gold).toBe('0');
    expect(e.state.crystals).toBe('0');
  });
});
