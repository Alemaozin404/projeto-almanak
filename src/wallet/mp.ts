/**
 * Cliente do backend Pix (Mercado Pago) — camada ONLINE da carteira.
 *
 * O app NUNCA conhece o access token do Mercado Pago: ele fala apenas com o
 * nosso servidor (server/index.js), que cria a cobrança e devolve o QR.
 * Se nenhum backend estiver configurado, o jogo usa o gateway local simulado.
 */
import { GameConfig } from '../config/GameConfig';
import { LocalPixGateway, type PixGateway, type PixOrderStatus, type PixPaymentResult } from './pix';

/** URL do backend: localStorage (runtime override) > GameConfig. */
export function pixBackendUrl(): string {
  try {
    const override = typeof localStorage !== 'undefined' ? localStorage.getItem(GameConfig.wallet.backendUrlKey) : null;
    return (override ?? GameConfig.wallet.backendUrl).replace(/\/+$/, '');
  } catch {
    return GameConfig.wallet.backendUrl.replace(/\/+$/, '');
  }
}

/** Valida formato básico de URL http(s). */
export function isPixBackendUrlValid(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

/** Salva a URL do backend em runtime (sem recompilar). Vazia = volta ao modo simulado. */
export function setPixBackendUrl(url: string): void {
  const clean = url.trim().replace(/\/+$/, '');
  try {
    if (clean) localStorage.setItem(GameConfig.wallet.backendUrlKey, clean);
    else localStorage.removeItem(GameConfig.wallet.backendUrlKey);
  } catch {
    /* sem localStorage (testes) — ignora */
  }
}

/** Remove o override e volta ao GameConfig padrão. */
export function clearPixBackendUrl(): void {
  setPixBackendUrl('');
}

export function pixOnlineEnabled(): boolean {
  return pixBackendUrl().length > 0;
}

/** Testa a conexão com o backend (GET /api/health). */
export async function testPixBackend(url?: string): Promise<{ ok: boolean; mp?: string; reason?: string }> {
  const base = (url ?? pixBackendUrl()).replace(/\/+$/, '');
  if (!base) return { ok: false, reason: 'Nenhuma URL configurada' };
  if (!isPixBackendUrlValid(base)) return { ok: false, reason: 'URL deve começar com http:// ou https://' };
  try {
    const res = await fetch(`${base}/api/health`, {
      headers: { 'x-app-secret': GameConfig.wallet.appSharedSecret },
    });
    if (!res.ok) return { ok: false, reason: `Servidor respondeu (${res.status})` };
    const data = (await res.json()) as { ok?: boolean; mp?: string };
    if (data.mp === 'missing-token') return { ok: false, reason: 'Servidor online, mas sem access token do Mercado Pago configurado' };
    return { ok: data.ok !== false, mp: data.mp };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

interface ChargeResponse {
  ok?: boolean;
  orderId?: string;
  status?: string;
  pixCode?: string;
  qrCodeBase64?: string;
  amountBRL?: number;
  reason?: string;
}

interface StatusResponse {
  ok?: boolean;
  status?: string;
  detail?: string;
  reason?: string;
}

/** Chama o backend para criar a cobrança Pix. */
async function createCharge(packId: string, playerId: number, payerEmail?: string): Promise<ChargeResponse> {
  const res = await fetch(`${pixBackendUrl()}/api/pix/charge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-app-secret': GameConfig.wallet.appSharedSecret,
    },
    body: JSON.stringify({ packId, playerId, payerEmail }),
  });
  if (!res.ok) return { ok: false, reason: `Servidor recusou (${res.status})` };
  return (await res.json()) as ChargeResponse;
}

/** Chama o backend para consultar o status de um pedido. */
async function fetchStatus(orderId: string): Promise<StatusResponse> {
  const res = await fetch(`${pixBackendUrl()}/api/pix/status/${encodeURIComponent(orderId)}`, {
    headers: { 'x-app-secret': GameConfig.wallet.appSharedSecret },
  });
  if (!res.ok) return { ok: false, reason: `Servidor recusou (${res.status})` };
  return (await res.json()) as StatusResponse;
}

export const OnlinePixGateway: PixGateway = {
  provider: 'online',
  async purchase(product, meta) {
    try {
      const r = await createCharge(product, meta?.playerId ?? 0, meta?.payerEmail);
      if (!r.ok || !r.orderId) {
        return { ok: false, orderId: '', timestamp: Date.now(), pixCode: '', pending: false };
      }
      // pagamento real criado — fica pendente até o jogador pagar e o MP compensar
      return {
        ok: true,
        orderId: r.orderId,
        timestamp: Date.now(),
        pixCode: r.pixCode ?? '',
        qrCodeBase64: r.qrCodeBase64 ?? '',
        pending: r.status === 'pending',
      };
    } catch {
      return { ok: false, orderId: '', timestamp: Date.now(), pixCode: '', pending: false };
    }
  },
  async checkOrder(orderId) {
    try {
      const r = await fetchStatus(orderId);
      const status: PixOrderStatus = ['pending', 'approved', 'rejected', 'cancelled'].includes(r.status ?? '')
        ? (r.status as PixOrderStatus)
        : 'unknown';
      return { status };
    } catch {
      return { status: 'unknown' };
    }
  },
};

/** Escolhe o gateway: online se houver backend configurado, senão local (simulado). */
export function resolvePixGateway(): PixGateway {
  return pixOnlineEnabled() ? OnlinePixGateway : LocalPixGateway;
}

export type { PixGateway, PixOrderStatus, PixPaymentResult };
