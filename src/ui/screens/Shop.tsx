import { useState } from 'react';
import { useGame } from '../context';
import { RarityBadge, Panel, TabBar, EmptyState, Tooltip, Modal } from '../kit';
import { EQUIP_SLOTS, EQUIPMENT_LIST, type EquipSlot } from '../../shop/equipment';
import { CONSUMABLE_DEFS } from '../../shop/consumables';
import { BOX_DEFS } from '../../shop/boxes';
import { COIN_PACKS, packPriceLabel, type CoinPackDef } from '../../shop/packs';
import { D } from '../../core/bignum';
import { audio } from '../../audio/audio';

type ShopTab = 'equipment' | 'consumables' | 'boxes' | 'packs';

export function Shop({ onOpenBoxes }: { onOpenBoxes: () => void }) {
  const { engine, fmt } = useGame();
  const [tab, setTab] = useState<ShopTab>('equipment');
  const [slotFilter, setSlotFilter] = useState<EquipSlot | 'all'>('all');
  const [confirmPack, setConfirmPack] = useState<CoinPackDef | null>(null);
  const [buying, setBuying] = useState(false);
  const [notice, setNotice] = useState('');

  const items = slotFilter === 'all' ? EQUIPMENT_LIST : EQUIPMENT_LIST.filter((e) => e.slot === slotFilter);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  }

  async function doBuyPack() {
    if (!confirmPack) return;
    setBuying(true);
    const r = await engine.buyCoinPack(confirmPack.id);
    setBuying(false);
    if (r.ok) {
      flash(`🛍️ ${confirmPack.name} entregue! +${r.diamonds} 💎 e +${r.gold} 🪙`);
    } else {
      flash(`❌ ${r.reason ?? 'Falha na compra'}`);
    }
    setConfirmPack(null);
  }

  return (
    <div className="screen">
      <Panel title="Loja" icon="🛒">
        <TabBar
          tabs={[
            { id: 'equipment', name: 'Equipamentos', icon: '⚔️' },
            { id: 'consumables', name: 'Consumíveis', icon: '🧪' },
            { id: 'boxes', name: 'Caixas', icon: '📦' },
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
        <div className="item-grid">
          {CONSUMABLE_DEFS.map((def) => {
            const count = engine.consumableCount(def.id);
            const cost = D(def.cost).mul(engine.costFactor());
            const can = engine.canAfford(def.currency, cost);
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

      {notice && <div className="shop-notice">{notice}</div>}

      {tab === 'packs' && (
        <>
          <p className="muted small">
            💎 <strong>Diamantes</strong> são a moeda paga do jogo — e todo pacote inclui <strong>Moedas 🪙</strong> bônus para turbinar sua jornada.
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
                    Comprar · {packPriceLabel(p)}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <p className="muted small center">Compra simulada localmente (gateway de teste) — nenhum valor é cobrado.</p>
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
            <p className="muted small center">Total: <strong>{packPriceLabel(confirmPack)}</strong> — compra simulada, nenhum valor será cobrado.</p>
            <div className="modal-actions">
              <button className="btn" disabled={buying} onClick={() => setConfirmPack(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={buying} onClick={() => void doBuyPack()}>
                {buying ? 'Processando…' : `Confirmar · ${packPriceLabel(confirmPack)}`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
