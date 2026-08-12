import { useCallback, useEffect, useState } from 'react';
import { useGame } from '../context';
import { RarityBadge, Panel, TabBar, EmptyState, Tooltip, Modal } from '../kit';
import { EQUIP_SLOTS, EQUIPMENT_LIST, type EquipSlot } from '../../shop/equipment';
import { CONSUMABLE_DEFS } from '../../shop/consumables';
import { BOX_DEFS } from '../../shop/boxes';
import { COIN_PACKS, packPriceLabel, type CoinPackDef } from '../../shop/packs';
import { CREDIT_PACKS, fmtBRL, creditsToBRL, creditsToDiamonds, type CreditPackDef } from '../../wallet/pix';
import { AVATAR_CATALOG } from '../../profile/avatars';
import { pixOnlineEnabled, testPixBackend } from '../../wallet/mp';
import { PixOrderModal, type ActivePixOrder, type PixOrderResult } from '../PixOrderModal';
import { D } from '../../core/bignum';
import { audio } from '../../audio/audio';

type ShopTab = 'equipment' | 'consumables' | 'boxes' | 'credits' | 'diamonds' | 'packs';

/** Nomes das categorias de decoração de perfil (Loja de Diamantes). */
const DECOR_LABEL: Record<keyof typeof AVATAR_CATALOG, string> = {
  icons: 'Ícones',
  frames: 'Molduras',
  effects: 'Efeitos',
  badges: 'Badges',
};

export function Shop({ onOpenBoxes }: { onOpenBoxes: () => void }) {
  const { engine, fmt } = useGame();
  const [tab, setTab] = useState<ShopTab>('equipment');
  const [slotFilter, setSlotFilter] = useState<EquipSlot | 'all'>('all');
  const [confirmPack, setConfirmPack] = useState<CoinPackDef | null>(null);
  const [confirmCreditPack, setConfirmCreditPack] = useState<CreditPackDef | null>(null);
  const [buying, setBuying] = useState(false);
  const [notice, setNotice] = useState('');
  const [activeOrder, setActiveOrder] = useState<ActivePixOrder | null>(null);
  const [conn, setConn] = useState<{ ok: boolean; label: string } | null>(null);
  const online = pixOnlineEnabled();

  const items = slotFilter === 'all' ? EQUIPMENT_LIST : EQUIPMENT_LIST.filter((e) => e.slot === slotFilter);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  }

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

  // retoma pedidos Pix pendentes ao abrir a Loja (pagamento em andamento)
  useEffect(() => {
    if (!online) return;
    const pend = engine.pendingPixOrders();
    if (pend.length === 0) return;
    const p = pend[0];
    setActiveOrder({
      orderId: p.orderId,
      packId: p.packId,
      label: p.label,
      pixCode: p.pixCode ?? '',
      amountBRL: p.amountBRL ?? 0,
    });
  }, [engine, online]);

  async function doBuyCreditPack() {
    if (!confirmCreditPack) return;
    setBuying(true);
    const r = await engine.buyCreditPack(confirmCreditPack.id);
    setBuying(false);
    if (r.ok) {
      if (r.pending) {
        // cobrança real criada (Mercado Pago) — exibe o QR e inicia o polling
        setActiveOrder({ orderId: r.orderId ?? '', packId: confirmCreditPack.id, label: confirmCreditPack.name, pixCode: r.pixCode ?? '', qrCodeBase64: r.qrCodeBase64, amountBRL: confirmCreditPack.priceBRL });
      } else {
        flash(`💳 ${confirmCreditPack.name} entregue! (+${fmt(r.credits ?? 0, 0)} créditos)`);
        audio.buy();
      }
    } else {
      flash(`❌ ${r.reason ?? 'Falha na compra'}`);
    }
    setConfirmCreditPack(null);
  }

  async function doBuyPack() {
    if (!confirmPack) return;
    setBuying(true);
    const r = await engine.buyCoinPack(confirmPack.id);
    setBuying(false);
    if (r.ok) {
      if (r.pending) {
        // cobrança real criada (Mercado Pago) — exibe o QR e inicia o polling
        setActiveOrder({ orderId: r.orderId ?? '', packId: confirmPack.id, label: confirmPack.name, pixCode: r.pixCode ?? '', qrCodeBase64: r.qrCodeBase64, amountBRL: confirmPack.priceBRL });
      } else {
        const parts = [
          r.gold && D(r.gold).gt(0) ? `${fmt(D(r.gold), 0)} moedas` : '',
          r.diamonds && r.diamonds > 0 ? `${fmt(r.diamonds, 0)} diamantes` : '',
        ].filter(Boolean);
        flash(`🛍️ ${confirmPack.name} entregue! (+${parts.join(' · ')})`);
        audio.buy();
      }
    } else {
      flash(`❌ ${r.reason ?? 'Falha na compra'}`);
    }
    setConfirmPack(null);
  }

  /** Pagamento aprovado pelo Mercado Pago — o engine já concedeu o conteúdo. */
  function handlePixApproved(r: PixOrderResult) {
    setActiveOrder(null);
    const parts = [
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

  return (
    <div className="screen">
      <Panel title="Loja" icon="🛒">
        <TabBar
          tabs={[
            { id: 'equipment', name: 'Equipamentos', icon: '⚔️' },
            { id: 'consumables', name: 'Consumíveis', icon: '🧪' },
            { id: 'boxes', name: 'Caixas', icon: '📦' },
            { id: 'credits', name: 'Créditos', icon: '💳' },
            { id: 'diamonds', name: 'Diamantes', icon: '💎' },
            { id: 'packs', name: 'Moedas', icon: '💰' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </Panel>

      {tab === 'equipment' && (
        <>
          <div className="slot-filter">
            <button className={`chip-btn ${slotFilter === 'all' ? 'active' : ''}`} onClick={() => setSlotFilter('all')}>Todos</button>
            {EQUIP_SLOTS.map((s) => (
              <button key={s.id} className={`chip-btn ${slotFilter === s.id ? 'active' : ''}`} onClick={() => setSlotFilter(s.id)}>
                {s.icon} {s.name}
              </button>
            ))}
          </div>
          <div className="item-grid">
            {items.map((def) => {
              const owned = engine.state.equipment[def.id] ?? 0;
              const cost = engine.equipmentCost(def.id);
              const locked = engine.state.level < def.unlockLevel;
              const can = engine.canAfford('gold', cost) && !locked;
              const equipped = engine.state.equipped[def.slot] === def.id;
              return (
                <div key={def.id} className="item-card">
                  <div className="item-head">
                    <span className="item-icon">{def.icon}</span>
                    <div className="item-title">
                      <strong>{def.name}</strong>
                      <RarityBadge rarity={def.rarity} size="sm" />
                    </div>
                    {owned > 0 && <span className="item-count">×{owned}</span>}
                  </div>
                  <p className="muted small">{def.statText}</p>
                  {owned > 0 && <p className="effect-now small">Nv {Math.max(1, owned)} · {def.statText}</p>}
                  {locked ? (
                    <div className="locked-text">🔒 Requer nível {def.unlockLevel}</div>
                  ) : (
                    <div className="item-actions">
                      <button className="btn btn-sm" disabled={!can} onClick={() => { if (engine.buyEquipment(def.id).ok) audio.buy(); }}>
                        🪙 {fmt(cost, 0)}
                      </button>
                      {owned > 0 && (
                        <button className={`btn btn-sm ${equipped ? 'ghost' : 'btn-primary'}`} onClick={() => engine.equipItem(def.id)}>
                          {equipped ? 'Equipado' : 'Equipar'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === 'consumables' && (
        <div className="item-grid">            {CONSUMABLE_DEFS.map((def) => {
            const count = engine.consumableCount(def.id);
            const cost = D(def.cost).mul(engine.costFactor());
            const can = engine.canAfford(def.currency, cost);
            const creditCost = def.creditCost ? D(def.creditCost).mul(engine.costFactor()) : null;
            const canCredits = creditCost ? engine.canAfford('credits', creditCost) : false;
            const locked = engine.state.level < def.unlockLevel;
            return (
              <div key={def.id} className="item-card">
                <div className="item-head">
                  <span className="item-icon">{def.icon}</span>
                  <div className="item-title">
                    <strong>{def.name}</strong>
                    {count > 0 && <span className="item-count">×{count}</span>}
                  </div>
                </div>
                <p className="muted small">{def.desc}</p>
                {locked ? (
                  <div className="locked-text">🔒 Requer nível {def.unlockLevel}</div>
                ) : (
                  <div className="item-actions">
                    <Tooltip text="Compra 1 unidade">
                      <button className="btn btn-sm" disabled={!can} onClick={() => { if (engine.buyConsumable(def.id).ok) audio.buy(); }}>
                        {def.currency === 'gold' ? '🪙' : '💎'} {fmt(cost, 0)}
                      </button>
                    </Tooltip>
                    {creditCost && (
                      <Tooltip text="Pague com Créditos 💳 (moeda principal)">
                        <button className="btn btn-sm" disabled={!canCredits} onClick={() => { if (engine.buyConsumable(def.id, 1, 'credits').ok) audio.buy(); }}>
                          💳 {fmt(creditCost, 0)}
                        </button>
                      </Tooltip>
                    )}
                    <button className="btn btn-sm btn-primary" disabled={count <= 0} onClick={() => { if (engine.useConsumable(def.id).ok) audio.buy(); }}>
                      Usar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'boxes' && (
        <>
          <div className="item-grid">
            {BOX_DEFS.map((box) => {
              const owned = engine.boxCount(box.id);
              const cost = engine.boxBuyCost(box.id);
              const can = engine.canAfford(box.currency, cost);
              const creditCost = box.creditCost ? D(box.creditCost).mul(engine.costFactor()) : null;
              const canCredits = creditCost ? engine.canAfford('credits', creditCost) : false;
              const locked = engine.state.level < box.unlockLevel;
              return (
                <div key={box.id} className="item-card box-card">
                  <div className="item-head">
                    <span className="box-icon">{box.icon}</span>
                    <div className="item-title">
                      <strong>{box.name}</strong>
                      {owned > 0 && <span className="item-count">×{owned}</span>}
                    </div>
                  </div>
                  <p className="muted small">{box.desc}</p>
                  {locked ? (
                    <div className="locked-text">🔒 Requer nível {box.unlockLevel}</div>
                  ) : (
                    <div className="item-actions">
                      <button className="btn btn-sm" disabled={!can} onClick={() => { if (engine.buyBox(box.id, 1).ok) audio.buy(); }}>
                        {box.currency === 'crystals' ? '💎' : box.currency === 'gold' ? '🪙' : '🎟️'} {fmt(cost, 0)}
                      </button>
                      {creditCost && (
                        <Tooltip text="Pague com Créditos 💳 (moeda principal)">
                          <button className="btn btn-sm" disabled={!canCredits} onClick={() => { if (engine.buyBox(box.id, 1, 'credits').ok) audio.buy(); }}>
                            💳 {fmt(creditCost, 0)}
                          </button>
                        </Tooltip>
                      )}
                      {owned > 0 && (
                        <button className="btn btn-sm btn-primary" onClick={() => onOpenBoxes()}>Abrir</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="muted small center">As caixas também podem ser abertas na tela Caixas 📦</p>
        </>
      )}

      {tab === 'credits' && (
        <>
          {online && conn && (
            <div className={`pix-conn-banner ${conn.ok ? 'ok' : 'err'}`}>
              <strong>{conn.ok ? '🟢 Pagamentos reais ativos' : '🔴 Sem conexão com o servidor de pagamentos'}</strong>
              <span className="muted small">{conn.label}</span>
              <button className="btn btn-xs" onClick={() => void testPixBackend().then(applyConn)}>↻ Verificar</button>
            </div>
          )}
          <p className="muted small">
            💳 <strong>Créditos são a MOEDA PRINCIPAL</strong> do jogo: pagam o <strong>Passe Premium</strong>, <strong>avatares pagos</strong>,
            <strong> caixas e consumíveis premium</strong> e entrada em eventos — além de serem convertidos em <strong>Diamantes 💎</strong> (1 crédito = 1 diamante).
            Compre via <strong>Pix {online ? '💳 real (Mercado Pago)' : '(simulação local)'}</strong>.
          </p>
          <div className="item-grid">
            {CREDIT_PACKS.map((p) => (
              <div key={p.id} className={`item-card pack-card ${p.featured ? 'featured' : ''}`}>
                {p.featured && <span className="pack-ribbon">🔥 MAIS VENDIDO</span>}
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
                  <button className={`btn btn-sm ${p.featured ? 'btn-primary' : ''}`} onClick={() => setConfirmCreditPack(p)}>
                    Comprar via Pix · {fmtBRL(p.priceBRL)}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="muted small center">
            💎 Também quer <strong>Diamantes</strong>? Compre nos pacotes da aba <strong>Moedas</strong> ou converta seus créditos na <strong>Carteira</strong> (1💳 = 1💎).
          </p>
        </>
      )}

      {tab === 'diamonds' && (
        <>
          <div className="diamond-shop-head">
            <span className="diamond-shop-icon">💎</span>
            <div>
              <strong>Loja de Diamantes</strong>
              <p className="muted small">Decoração EXCLUSIVA de perfil paga em diamantes — o emblema de quem investe no jogo.
                Ganhe diamantes nos pacotes da aba <strong>Moedas</strong> ou converta seus <strong>Créditos</strong> na Carteira (1💳 = 1💎).</p>
            </div>
          </div>
          <div className="diamond-balance">
            💎 Você tem <strong>{fmt(engine.getRes('crystals'), 0)}</strong> diamantes
          </div>
          {(Object.keys(AVATAR_CATALOG) as (keyof typeof AVATAR_CATALOG)[]).map((cat) => {
            const items = AVATAR_CATALOG[cat].filter((i) => i.diamondCost);
            if (items.length === 0) return null;
            return (
              <div key={cat}>
                <h4 className="diamond-section-title">💎 {DECOR_LABEL[cat]}</h4>
                <div className="item-grid">
                  {items.map((item) => {
                    const cost = item.diamondCost;
                    if (!cost) return null;
                    const owned = engine.state.avatarItems.includes(item.id);
                    const can = engine.canAfford('crystals', D(cost)) && !owned;
                    return (
                      <div key={item.id} className="item-card diamond-card">
                        <div className="item-head">
                          {cat === 'badges' ? (
                            <span className="diamond-badge-preview">{item.value}</span>
                          ) : (
                            <div className={`avatar avatar-lg ${cat === 'frames' || cat === 'effects' ? item.value : ''}`}>
                              {cat === 'icons' ? item.value : '💎'}
                            </div>
                          )}
                          <div className="item-title">
                            <strong>{item.label}</strong>
                            <span className="muted small">{cat === 'icons' ? 'Ícone de perfil' : cat === 'frames' ? 'Moldura do avatar' : cat === 'effects' ? 'Efeito animado' : 'Badge do perfil'}</span>
                          </div>
                          {owned && <span className="item-count owned-tag">✓ Possuído</span>}
                        </div>
                        <div className="item-actions">
                          {owned ? (
                            <span className="owned-text">Adicionado ao seu perfil ✨</span>
                          ) : (
                            <button
                              className="btn btn-sm diamond-buy"
                              disabled={!can}
                              onClick={() => {
                                const r = engine.buyAvatarItem(cat, item.id, 'diamonds');
                                if (r.ok) audio.buy();
                                else flash(`❌ ${r.reason ?? 'Falha na compra'}`);
                              }}
                            >
                              💎 {fmt(cost, 0)}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="muted small center">
            Os itens comprados aqui aparecem na tela <strong>Perfil → Avatar</strong> para equipar. 💎 Diamantes são a moeda exclusiva de itens de loja — obtidos apenas via Pix ou conversão de créditos.
          </p>
        </>
      )}

      {notice && <div className="shop-notice">{notice}</div>}

      {tab === 'packs' && (
        <>
          {online && conn && (
            <div className={`pix-conn-banner ${conn.ok ? 'ok' : 'err'}`}>
              <strong>{conn.ok ? '🟢 Pagamentos reais ativos' : '🔴 Sem conexão com o servidor de pagamentos'}</strong>
              <span className="muted small">{conn.label}</span>
              <button className="btn btn-xs" onClick={() => void testPixBackend().then(applyConn)}>↻ Verificar</button>
            </div>
          )}
          <p className="muted small">
            💎 <strong>Diamantes</strong> são a moeda paga do jogo — e todo pacote inclui <strong>Moedas 🪙</strong> bônus para turbinar sua jornada.
            Compra via <strong>Pix {online ? '💳 real (Mercado Pago)' : '(simulação local)'}</strong>.
          </p>
          <div className="item-grid">
            {COIN_PACKS.map((p) => (
              <div key={p.id} className={`item-card pack-card ${p.featured ? 'featured' : ''}`}>
                {p.featured && <span className="pack-ribbon">🔥 MAIS VENDIDO</span>}
                <div className="item-head">
                  <span className="pack-icon">{p.icon}</span>
                  <div className="item-title">
                    <strong>{p.name}</strong>
                    {p.tag && <span className="item-count">{p.tag}</span>}
                  </div>
                </div>
                <div className="pack-contents">
                  <div className="pack-row"><span>💎</span><strong>{fmt(p.diamonds, 0)}</strong><small>diamantes</small></div>
                  <div className="pack-row"><span>🪙</span><strong>{fmt(D(p.gold), 0)}</strong><small>moedas</small></div>
                </div>
                <div className="item-actions">
                  <button className={`btn btn-sm ${p.featured ? 'btn-primary' : ''}`} onClick={() => setConfirmPack(p)}>
                    Comprar via Pix · {packPriceLabel(p)}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="muted small center">
            {online
              ? '💳 Pagamento processado pelo Mercado Pago — o QR Code real aparece ao confirmar.'
              : '⚠️ Pagamento simulado localmente (gateway de teste) — nenhum valor é cobrado. Configure o backend Pix para cobranças reais.'}
          </p>
        </>
      )}

      {tab === 'equipment' && items.length === 0 && <EmptyState icon="🛡️" text="Nenhum equipamento encontrado." />}

      <Modal open={confirmPack !== null} onClose={() => { if (!buying) setConfirmPack(null); }} title="Confirmar compra" width={420}>
        {confirmPack && (
          <div className="pack-confirm">
            <div className="pack-confirm-head">
              <span className="pack-icon">{confirmPack.icon}</span>
              <div>
                <h4>{confirmPack.name}</h4>
                <p className="muted small">{confirmPack.tag}</p>
              </div>
            </div>
            <div className="pack-contents">
              <div className="pack-row"><span>💎</span><strong>{fmt(confirmPack.diamonds, 0)}</strong><small>diamantes</small></div>
              <div className="pack-row"><span>🪙</span><strong>{fmt(D(confirmPack.gold), 0)}</strong><small>moedas</small></div>
            </div>
            <p className="muted small center">
              Total: <strong>{packPriceLabel(confirmPack)}</strong>.{online
                ? ' Você será direcionado ao Pix para pagar — QR Code real pelo Mercado Pago.'
                : ' Compra simulada localmente — nada será cobrado.'}
            </p>
            <div className="modal-actions">
              <button className="btn" disabled={buying} onClick={() => setConfirmPack(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={buying} onClick={() => void doBuyPack()}>
                {buying ? 'Processando…' : `Pagar via Pix · ${packPriceLabel(confirmPack)}`}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* confirmação de compra de CRÉDITOS (moeda principal) */}
      <Modal open={confirmCreditPack !== null} onClose={() => { if (!buying) setConfirmCreditPack(null); }} title="Confirmar compra de créditos" width={420}>
        {confirmCreditPack && (
          <div className="pack-confirm">
            <div className="pack-confirm-head">
              <span className="pack-icon">{confirmCreditPack.icon}</span>
              <div>
                <h4>{confirmCreditPack.name}</h4>
                <p className="muted small">💳 Moeda principal — paga passe, avatares, caixas e eventos.</p>
              </div>
            </div>
            <div className="pack-contents">
              <div className="pack-row"><span>💳</span><strong>{fmt(confirmCreditPack.credits, 0)}</strong><small>créditos ({fmtBRL(creditsToBRL(confirmCreditPack.credits))})</small></div>
              <div className="pack-row"><span>💎</span><strong>{fmt(creditsToDiamonds(confirmCreditPack.credits), 0)}</strong><small>diamantes na conversão</small></div>
            </div>
            <p className="muted small center">
              Total: <strong>{fmtBRL(confirmCreditPack.priceBRL)}</strong>.{online
                ? ' Você será direcionado ao Pix para pagar — QR Code real pelo Mercado Pago.'
                : ' Compra simulada localmente — nada será cobrado.'}
            </p>
            <div className="modal-actions">
              <button className="btn" disabled={buying} onClick={() => setConfirmCreditPack(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={buying} onClick={() => void doBuyCreditPack()}>
                {buying ? 'Processando…' : `Pagar via Pix · ${fmtBRL(confirmCreditPack.priceBRL)}`}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* QR / pagamento em andamento (compartilhado com a Carteira) */}
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
