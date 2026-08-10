import { useCallback, useEffect, useState } from 'react';
import { useGame } from '../context';
import { Panel, TabBar, Modal, Tooltip } from '../kit';
import { FICHA_PACKS, fmtBRL, fichasToCredits, creditsToBRL, creditsToDiamonds, type FichaPackDef } from '../../wallet/pix';
import { pixOnlineEnabled, testPixBackend } from '../../wallet/mp';
import { shopPacks, type AdminPack } from '../../admin/sales';
import { PixOrderModal, type ActivePixOrder, type PixOrderResult } from '../PixOrderModal';
import { D } from '../../core/bignum';
import { audio } from '../../audio/audio';

type WalletTab = 'buy' | 'convert' | 'diamonds';

/** Item comprável via Pix na carteira — ficha padrão ou pacote custom do admin. */
type Buyable = FichaPackDef | AdminPack;

export function Wallet() {
  const { engine, fmt } = useGame();
  const [tab, setTab] = useState<WalletTab>('buy');
  const [confirmPack, setConfirmPack] = useState<Buyable | null>(null);
  const [customPacks, setCustomPacks] = useState<AdminPack[]>([]);
  const [buying, setBuying] = useState(false);
  const [activeOrder, setActiveOrder] = useState<ActivePixOrder | null>(null);
  const [convertQty, setConvertQty] = useState('');
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
  const maxConvert = fichasToCredits(fichas.toNumber());
  const qty = Math.floor(Number(convertQty) || 0);
  const convertValid = qty > 0 && fichas.gte(qty);
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

  /** Converte o item em um pacote compatível com o engine (ficha ou custom). */
  function toPixPack(p: Buyable): { id: string; name: string; priceBRL: number; fichas?: number; gold?: string; diamonds?: number } {
    if ('fichas' in p) {
      return { id: p.id, name: p.name, priceBRL: p.priceBRL, fichas: (p as FichaPackDef).fichas };
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

  function doConvert() {
    const r = engine.convertFichasToCredits(qty);
    if (r.ok) {
      flash(`💳 +${r.credits} créditos convertidos!`);
      audio.buy();
    } else {
      flash(`❌ ${r.reason ?? 'Falha na conversão'}`);
    }
    setConvertQty('');
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
            <Tooltip text="Fichas compradas via Pix — 1 ficha = 1 crédito">
              <span className="wallet-balance"><span className="res-icon" style={{ color: '#ff9df5' }}>🎰</span><strong>{fmt(fichas, 0)}</strong></span>
            </Tooltip>
            <Tooltip text={`Créditos convertidos — valor de referência: ${fmtBRL(brlValue)}`}>
              <span className="wallet-balance"><span className="res-icon" style={{ color: '#5dff8a' }}>💳</span><strong>{fmt(credits, 0)}</strong></span>
            </Tooltip>
            <Tooltip text="1 crédito = 1 diamante 💎">
              <span className="wallet-balance brl"><span className="res-icon">💎</span><strong>{fmt(D(s.crystals), 0)}</strong></span>
            </Tooltip>
          </div>
        }
      >
        <TabBar
          tabs={[
            { id: 'buy', name: 'Comprar', icon: '🎰' },
            { id: 'convert', name: 'Converter', icon: '💳' },
            { id: 'diamonds', name: 'Diamantes', icon: '💎' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </Panel>

      {tab === 'buy' && (
        <>
          {online && conn && (
            <div className={`pix-conn-banner ${conn.ok ? 'ok' : 'err'}`}>
              <strong>{conn.ok ? '🟢 Pagamentos reais ativos' : '🔴 Sem conexão com o servidor de pagamentos'}</strong>
              <span className="muted small">{conn.label}</span>
              <button className="btn btn-xs" onClick={() => void testPixBackend().then(applyConn)}>↻ Verificar</button>
            </div>
          )}
          <p className="muted small">
            🎰 <strong>Fichas</strong> são compradas com dinheiro real via <strong>Pix {online ? '💳 pagamento real (Mercado Pago)' : '(simulação local)'}</strong>{' '}
            e convertidas em <strong>Créditos 💳</strong> (1 ficha = 1 crédito). Os créditos são trocados por <strong>Diamantes 💎</strong> (1 crédito = 1 diamante) para gastar no jogo.
          </p>
          <div className="item-grid">
            {FICHA_PACKS.map((p) => {
              const credits = fichasToCredits(p.fichas);
              return (
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
                    <div className="pack-row"><span>🎰</span><strong>{fmt(p.fichas, 0)}</strong><small>fichas</small></div>
                    <div className="pack-row"><span>💳</span><strong>{fmt(credits, 0)}</strong><small>créditos ({fmtBRL(creditsToBRL(credits))})</small></div>
                    <div className="pack-row"><span>💎</span><strong>{fmt(creditsToDiamonds(credits), 0)}</strong><small>diamantes</small></div>
                  </div>
                  <div className="item-actions">
                    <button className={`btn btn-sm ${p.featured ? 'btn-primary' : ''}`} onClick={() => setConfirmPack(p)}>
                      Comprar via Pix · {fmtBRL(p.priceBRL)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
          <p className="muted small center">
            {online
              ? '💳 Pagamento processado pelo Mercado Pago — o QR Code real aparece ao confirmar.'
              : '⚠️ Pagamento simulado localmente (gateway de teste) — nenhum valor é cobrado. Configure o backend Pix para cobranças reais.'}
          </p>
        </>
      )}

      {tab === 'convert' && (
        <div className="wallet-convert">
          <Panel title="Converter Fichas → Créditos" icon="💱">
            <p className="muted small">1 ficha 🎰 = 1 crédito 💳 · 1 crédito = R$ 0,05 de valor. Converta suas fichas para depois trocar por diamantes.</p>
            <div className="wallet-convert-row">
              <input
                type="number"
                min={1}
                max={maxConvert}
                value={convertQty}
                onChange={(e) => setConvertQty(e.target.value)}
                placeholder={`Máx: ${fmt(fichas, 0)} fichas`}
                className="input"
              />
              <button className="btn btn-sm" onClick={() => setConvertQty(String(maxConvert))}>Tudo</button>
              <button className="btn btn-sm btn-primary" disabled={!convertValid} onClick={doConvert}>
                Converter
              </button>
            </div>
            {qty > 0 && (
              <p className="muted small">
                {fmt(qty, 0)} fichas → <strong>{fmt(fichasToCredits(qty), 0)} créditos</strong> ({fmtBRL(creditsToBRL(fichasToCredits(qty)))})</p>
            )}
            {!convertValid && qty > 0 && <p className="locked-text">Fichas insuficientes para esta conversão.</p>}
          </Panel>
        </div>
      )}

      {tab === 'diamonds' && (
        <div className="wallet-convert">
          <Panel title="Converter Créditos → Diamantes" icon="💎">
            <p className="muted small">
              1 crédito 💳 = 1 diamante 💎. Os diamantes são a moeda premium do jogo — gastos em caixas, consumíveis e upgrades premium na Loja.
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
        </div>
      )}

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
                    ? ` · ${fmt(confirmPack.fichas, 0)} fichas = ${fmt(fichasToCredits(confirmPack.fichas), 0)} créditos = ${fmt(creditsToDiamonds(fichasToCredits(confirmPack.fichas)), 0)} diamantes`
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
