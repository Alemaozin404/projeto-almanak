import { useState } from 'react';
import { useGame } from '../context';
import { ConfirmModal, Panel, RarityBadge, TabBar, EmptyState } from '../kit';
import { EQUIP_SLOTS } from '../../shop/equipment';
import { CONSUMABLE_DEFS } from '../../shop/consumables';
import { audio } from '../../audio/audio';

type InvTab = 'equipment' | 'consumables';

export function Inventory() {
  const { engine, fmt } = useGame();
  const s = engine.state;
  const [tab, setTab] = useState<InvTab>('equipment');
  const [sellTarget, setSellTarget] = useState<string | null>(null);

  return (
    <div className="screen">
      <Panel title="Inventário" icon="🎒">
        <TabBar
          tabs={[
            { id: 'equipment', name: 'Equipamentos', icon: '⚔️' },
            { id: 'consumables', name: 'Consumíveis', icon: '🧪' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </Panel>

      {tab === 'equipment' && (
        <div className="equip-layout">
          {EQUIP_SLOTS.map((slot) => {
            const equippedId = s.equipped[slot.id];
            const owned = Object.entries(s.equipment).filter(([id, c]) => c > 0 && id.startsWith(`eq_${slot.id}_`));
            return (
              <Panel key={slot.id} title={`${slot.icon} ${slot.name}`} className="equip-slot-panel">
                {equippedId ? (
                  <div className="equipped-item">
                    <RarityBadge rarity={s.equipment[equippedId] > 0 ? requireRarity(equippedId) : 'common'} size="sm" />
                    <strong>{requireName(equippedId)}</strong>
                    <span className="muted small">{requireStat(equippedId)}</span>
                    <button className="btn btn-xs ghost" onClick={() => engine.unequipSlot(slot.id)}>Remover</button>
                  </div>
                ) : (
                  <span className="muted small">Nada equipado</span>
                )}
                {owned.length > 0 && (
                  <div className="owned-list">
                    {owned.map(([id, count]) => (
                      <div key={id} className="owned-row">
                        <span>{requireName(id)} ×{count}</span>
                        <button className="btn btn-xs" onClick={() => engine.equipItem(id)}>Equipar</button>
                        <button className="btn btn-xs ghost" onClick={() => setSellTarget(id)}>Vender</button>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}

      {tab === 'consumables' && (
        <div className="item-grid">
          {CONSUMABLE_DEFS.map((def) => {
            const count = engine.consumableCount(def.id);
            return (
              <div key={def.id} className={`item-card ${count <= 0 ? 'dim' : ''}`}>
                <div className="item-head">
                  <span className="item-icon">{def.icon}</span>
                  <div className="item-title"><strong>{def.name}</strong><span className="item-count">×{count}</span></div>
                </div>
                <p className="muted small">{def.desc}</p>
                <button className="btn btn-sm btn-primary" disabled={count <= 0} onClick={() => { if (engine.useConsumable(def.id).ok) audio.buy(); }}>
                  Usar
                </button>
              </div>
            );
          })}
          {Object.keys(s.consumables).length === 0 && <EmptyState icon="🎒" text="Inventório vazio. Compre consumíveis na Loja." />}
        </div>
      )}

      <ConfirmModal
        open={sellTarget !== null}
        onClose={() => setSellTarget(null)}
        onConfirm={() => { if (sellTarget) engine.sellEquipment(sellTarget); }}
        title="Vender equipamento"
        desc={sellTarget ? `Vender ${requireName(sellTarget)} por ${fmt(engine.sellPreview(sellTarget), 0)} ouro?` : ''}
        confirmLabel="Vender"
        danger
      />
    </div>
  );
}

// helpers locais (imports evitados para não poluir)
import { EQUIPMENT_DEFS } from '../../shop/equipment';
import type { RarityId } from '../../game/types';

function requireRarity(id: string): RarityId {
  return EQUIPMENT_DEFS[id]?.rarity ?? 'common';
}
function requireName(id: string): string {
  return EQUIPMENT_DEFS[id]?.name ?? '???';
}
function requireStat(id: string): string {
  return EQUIPMENT_DEFS[id]?.statText ?? '';
}
