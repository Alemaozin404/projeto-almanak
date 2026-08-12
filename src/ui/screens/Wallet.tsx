import { useCallback, useEffect, useState } from 'react';
import { useGame } from '../context';
import { Panel, TabBar, Modal, Tooltip } from '../kit';
import { FICHA_PACKS, CREDIT_PACKS, fmtBRL, creditsToBRL, creditsToDiamonds, type FichaPackDef, type CreditPackDef } from '../../wallet/pix';
import { pixOnlineEnabled, testPixBackend } from '../../wallet/mp';
import { shopPacks, type AdminPack } from '../../admin/sales';
import { PixOrderModal, type ActivePixOrder, type PixOrderResult } from '../PixOrderModal';
import { D } from '../../core/bignum';
import { audio } from '../../audio/audio';

type WalletTab = 'fichas' | 'credits' | 'diamonds';

/** Item comprável via Pix na carteira — fichas, créditos ou pacote custom do admin. */
type Buyable = FichaPackDef | CreditPackDef | AdminPack;

export function Wallet() {
  const { engine, fmt } = useGame();
  const [tab, setTab] = useState<WalletTab>('fichas');
  const [confirmPack, setConfirmPack] = useState<Buyable | null>(null);
  const [customPacks, setCustomPacks] = useState<AdminPack[]>([]);
  const [buying, setBuying] = useState(false);
  const [activeOrder, setActiveOrder] = useState<ActivePixOrder | null>(null);
  const [diamondQty, setDiamondQty] = useState('');
  const [notice, setNotice] = useState('');
  const [conn, setConn] = useState<{ ok: boolean; label: string } | null>(null);
  const online = pixOnlineEnabled();

  // status da conexão com o backend de pagamentos (aviso claro quando offline)
  const applyConn = useCallback((r: { ok: boolean; mp?: string; reason?: string }) => {
    setConn(r.ok
      ? { ok: true, label: r.mp === 'configured' ? 'Mercado Pago configurado' : 'Servidor ok, mas Mercado Pago não configurado no servidor' }
      : { ok: false, label: r.reason ?? 'Sem conexão' });
  }, []);

  useEffect(() => {
    if (!online) { setConn(null); return; }
    let alive = true;
    void testPixBackend().then((r) => { if (alive) applyConn(r); });
    return () => { alive = false; };
  }, [online, applyConn]);

  // carrega os pacotes customizados (admin) publicados — local + servidor
  useEffect(() => {
    let alive = true;
    void shopPacks().then((list) => { if (alive) setCustomPacks(list); });
    return () => { alive = false; };
  }, [online, tab]);

  const s = engine.state;
  const fichas = D(s.fichas);
  const credits = D(s.credits);
  const diamonds = D(s.crystals);
  const maxDiamonds = creditsToDiamonds(credits.toNumber());
  const dqty = Math.floor(Number(diamondQty) || 0);
  const diamondValid = dqty > 0 && credits.gte(dqty);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  }

  /** Pagamento aprovado pelo Mercado Pago — o engine já concedeu o conteúdo. */
  function handlePixApproved(r: PixOrderResult) {
    setActiveOrder(null);
    const parts = [
      r.fichas ? `${fmt(r.fichas, 0)} fichas` : '',
      r.credits ? `${fmt(r.credits, 0)} créditos` : '',
      r.gold && D(r.gold).gt(0) ? `${fmt(D(r.gold), 0)} moedas` : '',
      r.diamonds && r.diamonds > 0 ? `${fmt(r.diamonds, 0)} diamantes` : '',
    ].filter(Boolean);
    flash(`✅ ${parts.join(' · ') || 'pedido'} adicionados!`);
    audio.buy();
  }

  function handlePixRejected(status: string) {
    setActiveOrder(null);
    flash(`❌ Pagamento ${status}.`);
  }

  // ── retomada de pedidos pendentes ao abrir a tela ────────
  useEffect(() => {
    if (!online) return;
    const pend = engine.pendingPixOrders();
    if (pend.length === 0) return;
    const p = pend[0];
    // o polling do modal consulta o status; reabre se ainda houver código p/ pagar
    setActiveOrder({
      orderId: p.orderId,
      packId: p.packId,
      label: p.label,
      pixCode: p.pixCode ?? '',
      amountBRL: p.amountBRL ?? 0,
    });
  }, [engine, online]);

  /** Converte o item em um pacote compatível com o engine (ficha, crédito ou custom). */
  function toPixPack(p: Buyable): { id: string; name: string; priceBRL: number; fichas?: number; credits?: number; gold?: string; diamonds?: number } {
    if ('fichas' in p) {
      return { id: p.id, name: p.name, priceBRL: p.priceBRL, fichas: (p as FichaPackDef).fichas };
    }
    if ('credits' in p) {
      return { id: p.id, name: p.name, priceBRL: p.priceBRL, credits: (p as CreditPackDef).credits };
    }
    const admin = p as AdminPack;
    return { id: admin.id, name: admin.name, priceBRL: admin.priceBRL, gold: admin.gold, diamonds: admin.diamonds };
  }

  async function doBuy() {
    if (!confirmPack) return;
    setBuying(true);
    const r = await engine.buyPixPack(toPixPack(confirmPack));
    setBuying(false);
    if (r.ok) {
      if (r.pending) {
        // cobrança real criada — exibe o QR e inicia o polling
        setActiveOrder({ orderId: r.orderId ?? '', packId: confirmPack.id, label: confirmPack.name, pixCode: r.pixCode ?? '', qrCodeBase64: r.qrCodeBase64, amountBRL: confirmPack.priceBRL });
      } else {
        const parts = [
          r.fichas ? `${fmt(r.fichas, 0)} fichas` : '',
          r.credits ? `${fmt(r.credits, 0)} créditos` : '',
          r.gold && D(r.gold).gt(0) ? `${fmt(D(r.gold), 0)} moedas` : '',
          r.diamonds ? `${fmt(r.diamonds, 0)} diamantes` : '',
        ].filter(Boolean);
        flash(`✅ ${confirmPack.name} comprado! (+${parts.join(' · ')})`);
        audio.buy();
      }
    } else {
      flash(`❌ ${r.reason ?? 'Falha na compra'}`);
    }
    setConfirmPack(null);
  }

  function doDiamonds() {
    const r = engine.convertCreditsToDiamonds(dqty);
    if (r.ok) {
      flash(`💎 +${r.diamonds} diamantes adicionados!`);
      audio.buy();
    } else {
      flash(`❌ ${r.reason ?? 'Falha na conversão'}`);
    }
    setDiamondQty('');
  }

  const brlValue = creditsToBRL(credits.toNumber());

  return (
    <div className="screen">
      <Panel
        title="Carteira"
        icon="🎰"
        right={
          <div className="wallet-balances">
            <Tooltip text="Fichas — moeda exclusiva de eventos premium (compradas via Pix)">
              <span className="wallet-balance"><span className="res-icon" style={{ color: '#ff9df5' }}>🎰</span><strong>{fmt(fichas, 0)}</strong></span>
            </Tooltip>
            <Tooltip text={`Créditos — moeda universal (passe, avatares e eventos). Valor de referência: ${fmtBRL(brlValue)}`}>
              <span className="wallet-balance"><span className="res-icon" style={{ color: '#5dff8a' }}>💳</span><strong>{fmt(credits, 0)}</strong></span>
            </Tooltip>
            <Tooltip text="Diamantes — via Pix ou conversão de créditos (1 crédito = 1 diamante)">
              <span className="wallet-balance brl"><span className="res-icon">💎</span><strong>{fmt(diamonds, 0)}</strong></span>
            </Tooltip>
          </div>
        }
      >
        <TabBar
          tabs={[
            { id: 'fichas', name: 'Fichas', icon: '🎰' },
            { id: 'credits', name: 'Créditos', icon: '💳' },
            { id: 'diamonds', name: 'Diamantes', icon: '💎' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </Panel>

      {online && conn && (
        <div className={`pix-conn-banner ${conn.ok ? 'ok' : 'err'}`}>
          <strong>{conn.ok ? '🟢 Pagamentos reais ativos' : '🔴 Sem conexão com o servidor de pagamentos'}</strong>
          <span className="muted small">{conn.label}</span>
          <button className="btn btn-xs" onClick={() => void testPixBackend().then(applyConn)}>↻ Verificar</button>
        </div>
      )}

      {tab === 'fichas' && (
        <>
          <p className="muted small">
            🎰 <strong>Fichas</strong> são compradas com dinheiro real via <strong>Pix {online ? '💳 pagamento real (Mercado Pago)' : '(simulação local)'}</strong>.
            Elas são a <strong>moeda de troca exclusiva de eventos premium</strong> — usadas sem moedas grátis, apenas em eventos pagos (ex.: Baile VIP).
          </p>
          <div className="item-grid">
            {FICHA_PACKS.map((p) => (
              <div key={p.id} className={`item-card pack-card ${p.featured ? 'featured' : ''}`}>
                {p.featured && <span className="pack-ribbon">🔥 POPULAR</span>}
                <div className="item-head">
                  <span className="pack-icon">{p.icon}</span>
                  <div className="item-title">
                    <strong>{p.name}</strong>
                    {p.tag && <span className="item-count">{p.tag}</span>}
                  </div>
                </div>
                <div className="pack-contents">
                  <div className="pack-row"><span>🎰</span><strong>{fmt(p.fichas, 0)}</strong><small>fichas p/ eventos premium</small></div>
                </div>
                <div className="item-actions">
                  <button className={`btn btn-sm ${p.featured ? 'btn-primary' : ''}`} onClick={() => setConfirmPack(p)}>
                    Comprar via Pix · {fmtBRL(p.priceBRL)}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'credits' && (
        <>
          <p className="muted small">
            💳 <strong>Créditos</strong> são a <strong>moeda universal</strong>: compram o <strong>Passe Premium</strong>, <strong>avatares pagos</strong> e
            <strong> entrada em eventos</strong>, e ainda são convertidos em <strong>Diamantes 💎</strong> (1 crédito = 1 diamante).
            Compre via <strong>Pix {online ? '(Mercado Pago)' : '(simulação local)'}</strong>.
          </p>
          <div className="item-grid">
            {CREDIT_PACKS.map((p) => (
              <div key={p.id} className={`item-card pack-card ${p.featured ? 'featured' : ''}`}>
                {p.featured && <span className="pack-ribbon">🔥 POPULAR</span>}
                <div className="item-head">
                  <span className="pack-icon">{p.icon}</span>
                  <div className="item-title">
                    <strong>{p.name}</strong>
                    {p.tag && <span className="item-count">{p.tag}</span>}
                  </div>
                </div>
                <div className="pack-contents">
                  <div className="pack-row"><span>💳</span><strong>{fmt(p.credits, 0)}</strong><small>créditos ({fmtBRL(creditsToBRL(p.credits))})</small></div>
                  <div className="pack-row"><span>💎</span><strong>{fmt(creditsToDiamonds(p.credits), 0)}</strong><small>diamantes na conversão</small></div>
                </div>
                <div className="item-actions">
                  <button className={`btn btn-sm ${p.featured ? 'btn-primary' : ''}`} onClick={() => setConfirmPack(p)}>
                    Comprar via Pix · {fmtBRL(p.priceBRL)}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'diamonds' && (
        <div className="wallet-convert">
          <Panel title="Converter Créditos → Diamantes" icon="💎">
            <p className="muted small">
              1 crédito 💳 = 1 diamante 💎. Os diamantes são a moeda premium exclusiva do jogo — obtidos <strong>apenas via Pix ou convertendo créditos</strong>,
              e gastos em itens de loja premium, XP do passe e itens de evento.
            </p>
            <div className="wallet-convert-row">
              <input
                type="number"
                min={1}
                max={Math.max(0, credits.toNumber())}
                value={diamondQty}
                onChange={(e) => setDiamondQty(e.target.value)}
                placeholder={`Máx: ${fmt(credits, 0)} créditos`}
                className="input"
              />
              <button className="btn btn-sm" onClick={() => setDiamondQty(String(Math.max(0, credits.toNumber())))}>Tudo</button>
              <button className="btn btn-sm btn-primary" disabled={!diamondValid} onClick={doDiamonds}>
                Trocar por diamantes
              </button>
            </div>
            {dqty > 0 && (
              <p className="muted small">
                {fmt(dqty, 0)} créditos → <strong>{fmt(creditsToDiamonds(dqty), 0)} diamantes 💎</strong>
              </p>
            )}
            {!diamondValid && dqty > 0 && <p className="locked-text">Créditos insuficientes para esta conversão.</p>}
          </Panel>
          <p className="muted small center">
            💡 Dica: com {fmt(credits, 0)} créditos você pode trocar por {fmt(maxDiamonds, 0)} diamantes agora.
          </p>
          {customPacks.length > 0 && (
            <>
              <h4 style={{ marginTop: 16 }}>💎 Diamantes & Moedas <span className="muted small">(admin)</span></h4>
              <div className="item-grid">
                {customPacks.map((p) => (
                  <div key={p.id} className={`item-card pack-card ${p.featured ? 'featured' : ''}`}>
                    {p.featured && <span className="pack-ribbon">🔥 DESTAQUE</span>}
                    <div className="item-head">
                      <span className="pack-icon">{p.icon}</span>
                      <div className="item-title">
                        <strong>{p.name}</strong>
                        {p.tag && <span className="item-count">{p.tag}</span>}
                      </div>
                    </div>
                    <div className="pack-contents">
                      {p.gold && Number(p.gold) > 0 && (
                        <div className="pack-row"><span>🪙</span><strong>{fmt(D(p.gold), 0)}</strong><small>moedas</small></div>
                      )}
                      {p.diamonds > 0 && (
                        <div className="pack-row"><span>💎</span><strong>{fmt(p.diamonds, 0)}</strong><small>diamantes</small></div>
                      )}
                    </div>
                    <div className="item-actions">
                      <button className={`btn btn-sm ${p.featured ? 'btn-primary' : ''}`} onClick={() => setConfirmPack(p)}>
                        Comprar via Pix · {fmtBRL(p.priceBRL)}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <p className="muted small center">
        {online
          ? '💳 Pagamento processado pelo Mercado Pago — o QR Code real aparece ao confirmar.'
          : '⚠️ Pagamento simulado localmente (gateway de teste) — nenhum valor é cobrado. Configure o backend Pix para cobranças reais.'}
      </p>

      {notice && <div className="shop-notice">{notice}</div>}

      {/* confirmação de compra */}
      <Modal open={confirmPack !== null} onClose={() => { if (!buying) setConfirmPack(null); }} title="Confirmar compra via Pix" width={440}>
        {confirmPack && (
          <div className="pack-confirm">
            <div className="pack-confirm-head">
              <span className="pack-icon">{confirmPack.icon}</span>
              <div>
                <h4>{confirmPack.name}</h4>
                <p className="muted small">
                  {fmtBRL(confirmPack.priceBRL)}
                  {'fichas' in confirmPack
                    ? ` · ${fmt(confirmPack.fichas, 0)} fichas 🎰 (moeda de eventos premium)`
                    : 'credits' in confirmPack
                      ? ` · ${fmt(confirmPack.credits, 0)} créditos 💳 = ${fmt(creditsToDiamonds(confirmPack.credits), 0)} diamantes na conversão`
                      : ` · ${confirmPack.gold && Number(confirmPack.gold) > 0 ? `+${fmt(D(confirmPack.gold), 0)} moedas` : ''}${confirmPack.gold && Number(confirmPack.gold) > 0 && confirmPack.diamonds > 0 ? ' e ' : ''}${confirmPack.diamonds > 0 ? `+${fmt(confirmPack.diamonds, 0)} diamantes` : ''}`}
                </p>
              </div>
            </div>
            <p className="muted small center">
              Você será direcionado ao Pix para pagar <strong>{fmtBRL(confirmPack.priceBRL)}</strong>.{online ? ' Cobrança real pelo Mercado Pago — pague com o QR ou copie o código.' : ' Compra simulada localmente — nada será cobrado.'}
            </p>
            <div className="modal-actions">
              <button className="btn" disabled={buying} onClick={() => setConfirmPack(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={buying} onClick={() => void doBuy()}>
                {buying ? 'Processando…' : `Pagar via Pix · ${fmtBRL(confirmPack.priceBRL)}`}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* QR / pagamento em andamento (compartilhado com a Loja) */}
      <PixOrderModal
        order={activeOrder}
        onClose={() => setActiveOrder(null)}
        onApproved={handlePixApproved}
        onRejected={handlePixRejected}
        onNotify={flash}
      />
    </div>
  );
}
