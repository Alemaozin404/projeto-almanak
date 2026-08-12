/**
 * Modal compartilhado de pagamento Pix (Mercado Pago) — usado pela Carteira e
 * pela Loja (aba "Moedas").
 *
 * Recebe um pedido ativo e cuida de tudo:
 *  - exibe o QR Code real (quando disponível) ou o código copia-e-cola;
 *  - faz polling automático do status a cada `pixPollingMs`;
 *  - quando o pagamento é aprovado, o engine concede o conteúdo (checkPixOrder)
 *    e `onApproved` avisa o pai (com o que foi entregue);
 *  - quando rejeitado/cancelado, chama `onRejected` e fecha.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from './context';
import { Modal } from './kit';
import { GameConfig } from '../config/GameConfig';
import { fmtBRL } from '../wallet/pix';

export interface ActivePixOrder {
  orderId: string;
  packId: string;
  label?: string;
  pixCode: string;
  qrCodeBase64?: string;
  amountBRL: number;
}

export interface PixOrderResult {
  status: string;
  fichas?: number;
  credits?: number;
  gold?: string;
  diamonds?: number;
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando pagamento…',
  approved: 'Aprovado!',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
  unknown: 'Consultando…',
};

export function PixOrderModal({
  order,
  onClose,
  onApproved,
  onRejected,
  onNotify,
}: {
  order: ActivePixOrder | null;
  onClose: () => void;
  onApproved?: (r: PixOrderResult) => void;
  onRejected?: (status: string) => void;
  onNotify?: (msg: string) => void;
}) {
  const { engine } = useGame();
  const [orderStatus, setOrderStatus] = useState<string>('pending');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // callbacks dos pais em ref: identidade estável mesmo com re-renders a cada tick
  // (senão o efeito de polling reiniciaria e faria requisição HTTP por render)
  const handlersRef = useRef({ onApproved, onRejected, onClose, onNotify });
  handlersRef.current = { onApproved, onRejected, onClose, onNotify };

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    if (!order) return;
    const r = await engine.checkPixOrder(order.orderId);
    setOrderStatus(r.status);
    if (r.status === 'approved') {
      stopPolling();
      handlersRef.current.onApproved?.({ status: r.status, fichas: r.fichas, credits: r.credits, gold: r.gold, diamonds: r.diamonds });
      handlersRef.current.onClose();
    } else if (r.status === 'rejected' || r.status === 'cancelled') {
      stopPolling();
      handlersRef.current.onRejected?.(r.status);
      handlersRef.current.onClose();
    }
  }, [engine, order, stopPolling]);

  // inicia o polling quando um pedido ativo aparece; cancela ao fechar/trocar
  useEffect(() => {
    setOrderStatus('pending');
    if (!order) {
      stopPolling();
      return undefined;
    }
    void poll();
    pollingRef.current = setInterval(() => void poll(), GameConfig.wallet.pixPollingMs);
    return stopPolling;
  }, [order, poll, stopPolling]);

  function close() {
    stopPolling();
    onClose();
  }

  return (
    <Modal open={order !== null} onClose={close} title="🧾 Pagamento Pix" width={480}>
      {order && (
        <div className="pix-receipt">
          <p className="muted small center">{ORDER_STATUS_LABEL[orderStatus] ?? orderStatus}</p>

          {order.qrCodeBase64 ? (
            <div className="pix-qr-wrap">
              <img className="pix-qr-img" src={`data:image/png;base64,${order.qrCodeBase64}`} alt="QR Code Pix" />
            </div>
          ) : order.pixCode ? (
            <p className="muted small center">🧾 Pedido em andamento — use o código copia-e-cola abaixo para pagar no seu banco.</p>
          ) : (
            <p className="muted small center">Aguardando QR Code…</p>
          )}

          <div className="wallet-summary">
            <div><span>Pacote</span><strong>{order.label ?? order.packId}</strong></div>
            <div><span>Valor</span><strong>{fmtBRL(order.amountBRL)}</strong></div>
            <div><span>Status</span><strong>{ORDER_STATUS_LABEL[orderStatus] ?? orderStatus}</strong></div>
          </div>

          {order.pixCode && (
            <div className="pix-code-box">
              <small className="muted">Código Pix copia-e-cola</small>
              <code className="pix-code">{order.pixCode}</code>
              <button
                className="btn btn-sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(order.pixCode).catch(() => {});
                  onNotify?.('📋 Código copiado!');
                }}
              >
                📋 Copiar código
              </button>
            </div>
          )}

          {orderStatus === 'pending' && (
            <p className="muted small center">
              ⏳ Pague no app do seu banco — o jogo confere automaticamente a cada {Math.round(GameConfig.wallet.pixPollingMs / 1000)}s e entrega o conteúdo quando aprovar.
            </p>
          )}

          <div className="modal-actions">
            <button className="btn" onClick={close}>Fechar</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
