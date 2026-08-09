/**
 * Carteira Ficha/Créditos — camada Pix.
 *
 * Fichas 🎰 são compradas com dinheiro real via Pix (100 fichas = R$ 6,25,
 * margem de 20% para o jogo); 1 ficha = 1 crédito 💳; 1 crédito = 1 Diamante 💎
 * (1 crédito equivale a R$ 0,05 de valor). Os diamantes são gastos no sistema
 * premium do jogo (caixas, consumíveis, upgrades).
 *
 * ⚠️ Arquitetura local de teste (como o PaymentGateway do passe): a interface
 * `PixGateway` separa a camada de pagamento — nada sensível fica no cliente.
 * Numa versão online, o backend implementaria `PixGateway` com um provedor
 * regulado (Asaas, Pagar.me, Mercado Pago, Celcoin…) com CNPJ + KYC.
 */
import { GameConfig } from '../config/GameConfig';

export interface FichaPackDef {
  id: string;
  name: string;
  icon: string;
  /** Quantidade de fichas entregues. */
  fichas: number;
  /** Preço em reais (exibição). O gateway local confirma sem cobrar. */
  priceBRL: number;
  tag?: string;
  featured?: boolean;
}

export function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Créditos → valor em R$ (referência: 1 crédito = creditBRL). */
export function creditsToBRL(credits: number): number {
  return credits * GameConfig.wallet.creditBRL;
}

/** Fichas → créditos (conversão 1:1 configurável). */
export function fichasToCredits(fichas: number): number {
  return Math.floor(fichas / GameConfig.wallet.fichasPerCredit);
}

/** Créditos → diamantes (1 crédito = 1 diamante). */
export function creditsToDiamonds(credits: number): number {
  return Math.floor(credits / GameConfig.wallet.creditsPerDiamond);
}

export const FICHA_PACKS: FichaPackDef[] = [
  {
    id: 'fichas_100',
    name: '100 Fichas',
    icon: '🎰',
    fichas: 100,
    priceBRL: GameConfig.wallet.pricePer100Fichas,
    tag: 'Entrada',
  },
  {
    id: 'fichas_300',
    name: '300 Fichas',
    icon: '🎟️',
    fichas: 300,
    priceBRL: 17.5, // 18,75 → 17,50 (~6,7% bônus)
    tag: 'Popular',
    featured: true,
  },
  {
    id: 'fichas_800',
    name: '800 Fichas',
    icon: '🎫',
    fichas: 800,
    priceBRL: 45.0, // 50,00 → 45,00 (10% bônus)
    tag: 'Melhor custo-benefício',
  },
  {
    id: 'fichas_2000',
    name: '2.000 Fichas',
    icon: '👑',
    fichas: 2000,
    priceBRL: 105.0, // 125,00 → 105,00 (16% bônus)
    tag: 'Máximo',
  },
];

export function fichaPackById(id: string): FichaPackDef | undefined {
  return FICHA_PACKS.find((p) => p.id === id);
}

// ── camada de pagamento Pix (separada; nada sensível no cliente) ──
export interface PixPaymentResult {
  ok: boolean;
  orderId: string;
  timestamp: number;
  /** Código Pix copia-e-cola (EMV). Na simulação local, é gerado mas nada é cobrado. */
  pixCode: string;
  /** Imagem QR em base64 (data URI) — apenas no gateway online (Mercado Pago). */
  qrCodeBase64?: string;
  /** True quando o pagamento ainda aguarda compensação (online) — fichas só após aprovação. */
  pending?: boolean;
}

export type PixOrderStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'unknown';

export interface PixGateway {
  /** Inicia uma compra de fichas. Local: confirma na hora. Online: cria a cobrança e aguarda pagamento. */
  purchase(product: string, meta?: { playerId: number; amountBRL: number; payerEmail?: string }): Promise<PixPaymentResult>;
  /** Consulta o status de um pedido (online). O gateway local responde 'approved' para pedidos que criou. */
  checkOrder(orderId: string): Promise<{ status: PixOrderStatus }>;
  /** Camada futura: frontend → API → processadora. Nunca armazena credenciais. */
  readonly provider: 'local' | 'online';
}

/** Gera um payload Pix copia-e-cola (EMV®) com CRC16 válido — para exibição na simulação local. */
export function generatePixCopyPaste(orderId: string, amountBRL: number, playerId: number): string {
  const sanitize = (s: string) => s.replace(/[^A-Za-z0-9 .\-_]/g, '').slice(0, 25);
  const merchant = sanitize('NUCLEO CLICKER');
  const city = sanitize('SAO PAULO');
  const txid = `NC${playerId.toString(36).toUpperCase()}${orderId.replace(/[^A-Za-z0-9]/g, '').slice(-16)}`.slice(0, 25);
  const key = 'nucleoclicker-local-teste'; // chave simulada — o gateway local não cobra

  const field = (id: string, value: string): string => {
    const v = value.length > 99 ? value.slice(0, 99) : value;
    return id + String(v.length).padStart(2, '0') + v;
  };
  const amount = amountBRL.toFixed(2);

  // 63 = CRC16 (placeholder calculado ao final)
  let payload =
    field('00', '01') +
    field('26', field('00', 'BR.GOV.BCB.PIX') + field('01', key)) +
    field('52', '0000') +
    field('53', '986') +
    field('54', amount) +
    field('58', 'BR') +
    field('59', merchant) +
    field('60', city) +
    field('62', field('05', txid)) +
    '6304';

  // CRC16-CCITT (polinômio 0x1021, init 0xFFFF)
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  payload += crc.toString(16).toUpperCase().padStart(4, '0');
  return payload;
}

export const LocalPixGateway: PixGateway = {
  provider: 'local',
  async purchase(product, meta) {
    // Simulação local: gera um "pedido" Pix e confirma na hora. Para online,
    // o backend (server/) criaria a cobrança real no Mercado Pago.
    const orderId = `pix-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const timestamp = Date.now();
    const pixCode = generatePixCopyPaste(orderId, meta?.amountBRL ?? 0, meta?.playerId ?? 0);
    return { ok: true, orderId, timestamp, pixCode, pending: false };
  },
  async checkOrder(_orderId) {
    // pedidos locais são aprovados imediatamente
    return { status: 'approved' as PixOrderStatus };
  },
};
