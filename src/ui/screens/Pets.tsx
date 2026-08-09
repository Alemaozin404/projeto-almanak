import { useState } from 'react';
import { useGame } from '../context';
import { ConfirmModal, Panel, RarityBadge, ProgressBar, Tooltip, EmptyState } from '../kit';
import { PET_MAP, PET_SLOT_COUNT, petLevelMult, petEvolveMult } from '../../pets/pets';
import { RARITY_LIST } from '../../core/rarities';
import { petXpForLevel } from '../../economy/formulas';
import { D } from '../../core/bignum';
import type { RarityId } from '../../game/types';
import { audio } from '../../audio/audio';

export function Pets() {
  const { engine, fmt } = useGame();
  const s = engine.state;
  const [filter, setFilter] = useState<RarityId | 'all'>('all');
  const [sellTarget, setSellTarget] = useState<string | null>(null);

  const owned = Object.values(s.pets).sort((a, b) => b.level - a.level);
  const filtered = filter === 'all' ? owned : owned.filter((p) => PET_MAP[p.id].rarity === filter);

  return (
    <div className="screen">
      <Panel title="Pets" icon="🐾" right={<span className="muted small">{Object.keys(s.pets).length} encontrados · {PET_SLOT_COUNT} slots</span>}>
        <div className="pet-slots">
          {Array.from({ length: PET_SLOT_COUNT }).map((_, i) => {
            const petId = s.petSlots[i];
            const inst = petId ? s.pets[petId] : null;
            const def = petId ? PET_MAP[petId] : null;
            return (
              <div key={i} className={`pet-slot ${inst ? 'filled' : ''}`} title={def ? `${def.name} — bônus ativos` : 'Slot vazio'}>
                {def && inst ? (
                  <>
                    <span className="pet-slot-icon">{def.icon}</span>
                    <small>{def.name}</small>
                    <RarityBadge rarity={def.rarity} size="sm" />
                    <span className="pet-slot-lvl">Nv {inst.level}</span>
                    <button className="btn btn-xs ghost" onClick={() => petId && engine.unequipPet(petId)}>Tirar</button>
                  </>
                ) : (
                  <span className="muted">+ Slot {i + 1}</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="chip-filter">
          <button className={`chip-btn ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Todos</button>
          {RARITY_LIST.map((r) => (
            <button key={r.id} className={`chip-btn ${filter === r.id ? 'active' : ''}`} style={filter === r.id ? { borderColor: r.color, color: r.color } : undefined} onClick={() => setFilter(r.id)}>
              {r.name}
            </button>
          ))}
        </div>
      </Panel>

      {filtered.length === 0 && <EmptyState icon="🐾" text="Nenhum pet aqui. Abra caixas para encontrar companheiros!" />}

      <div className="pet-grid">
        {filtered.map((inst) => {
          const def = PET_MAP[inst.id];
          const need = petXpForLevel(inst.level);
          const levelMult = petLevelMult(inst.level) * petEvolveMult(inst.evolves);
          const evolveCost = D(1000).mul(levelMult).mul(inst.level);
          const canEvolve = def.evolves && engine.canAfford('gold', evolveCost);
          const food = engine.consumableCount('pet_food');
          return (
            <div key={inst.id} className="pet-card">
              <div className="pet-head">
                <span className="pet-icon">{def.icon}</span>
                <div className="pet-title">
                  <strong>{def.name}</strong>
                  <RarityBadge rarity={def.rarity} size="sm" />
                </div>
                {s.petSlots.includes(inst.id) && <span className="equipped-tag">EQUIPADO</span>}
              </div>
              <div className="pet-level">
                <strong>Nv {inst.level}</strong>
                {inst.evolves > 0 && <span className="evolve-tag">✨ Evolução {inst.evolves} (×{Math.pow(2, inst.evolves)})</span>}
              </div>
              <ProgressBar value={D(inst.xp)} max={need} label={`${fmt(inst.xp, 0)}/${fmt(need, 0)} XP`} color="var(--pet)" />
              <p className="muted small pet-desc">{def.desc}</p>
              <div className="pet-bonus">{def.bonusText}</div>
              {def.skill && (
                <div className="pet-skill">
                  <strong>⚡ {def.skill.name}</strong>
                  <span className="muted small">{def.skill.desc}</span>
                </div>
              )}
              <div className="pet-actions">
                {s.petSlots.includes(inst.id) ? (
                  <button className="btn btn-sm ghost" onClick={() => engine.unequipPet(inst.id)}>Desequipar</button>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={() => engine.equipPet(inst.id)}>Equipar</button>
                )}
                <Tooltip text={`Usa 1 Ração Mágica (tem ${food})`}>
                  <button className="btn btn-sm" disabled={food <= 0} onClick={() => engine.feedPet(inst.id)}>🍖 Alimentar</button>
                </Tooltip>
                <Tooltip text={`Custa ${fmt(evolveCost, 0)} ouro`}>
                  <button className="btn btn-sm" disabled={!canEvolve} onClick={() => { if (engine.evolvePet(inst.id).ok) audio.levelUp(); }}>
                    ✨ Evoluir
                  </button>
                </Tooltip>
                <button className="btn btn-sm btn-danger" onClick={() => setSellTarget(inst.id)}>Vender</button>
              </div>
            </div>
          );
        })}
      </div>

      <ConfirmModal
        open={sellTarget !== null}
        onClose={() => setSellTarget(null)}
        onConfirm={() => { if (sellTarget) engine.sellPet(sellTarget); }}
        title="Vender pet"
        desc={sellTarget ? `Vender ${PET_MAP[sellTarget]?.name}? Isso remove o pet permanentemente.` : ''}
        confirmLabel="Vender"
        danger
      />
    </div>
  );
}
