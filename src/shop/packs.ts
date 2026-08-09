/**
 * Pacotes de compra com dinheiro real (Loja → aba "Moedas").
 *
 * A compra passa pela camada de pagamento (PaymentGateway) — hoje local de
 * teste; numa versão online, o backend processaria o pagamento de verdade.
 * Moedas (gold) são a moeda normal; Diamantes (crystals) são a moeda paga.
 */
export interface CoinPackDef {
  id: string;
  name: string;
  icon: string;
  /** Preço em reais (exibição). O gateway local confirma sem cobrar. */
  priceBRL: number;
  /** Moedas 🪙 concedidas (Decimal string). */
  gold: string;
  /** Diamantes 💎 concedidos. */
  diamonds: number;
  tag?: string;
  featured?: boolean;
}

export function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const COIN_PACKS: CoinPackDef[] = [
  {
    id: 'pack_mini',
    name: 'Mini Pacote',
    icon: '🪙',
    priceBRL: 3.99,
    gold: '5000',
    diamonds: 380,
    tag: 'Entrada',
  },
  {
    id: 'pack_starter',
    name: 'Pacote Iniciante',
    icon: '🥉',
    priceBRL: 9.99,
    gold: '25000',
    diamonds: 1000,
    tag: 'Básico',
  },
  {
    id: 'pack_popular',
    name: 'Pacote Popular',
    icon: '🥈',
    priceBRL: 19.99,
    gold: '100000',
    diamonds: 2500,
    tag: 'Mais vendido',
    featured: true,
  },
  {
    id: 'pack_premium',
    name: 'Pacote Premium',
    icon: '🥇',
    priceBRL: 39.99,
    gold: '400000',
    diamonds: 6000,
    tag: 'Melhor custo-benefício',
  },
  {
    id: 'pack_legend',
    name: 'Pacote Lendário',
    icon: '👑',
    priceBRL: 99.99,
    gold: '2000000',
    diamonds: 18000,
    tag: 'Máximo',
  },
  {
    id: 'pack_ultra',
    name: 'Pacote Supremo',
    icon: '🌟',
    priceBRL: 199.99,
    gold: '8000000',
    diamonds: 45000,
    tag: 'Novo',
  },
];

export function packById(id: string): CoinPackDef | undefined {
  return COIN_PACKS.find((p) => p.id === id);
}

export function packPriceLabel(p: CoinPackDef): string {
  return fmtBRL(p.priceBRL);
}
