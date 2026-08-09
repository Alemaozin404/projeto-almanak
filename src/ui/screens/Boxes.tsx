import { useState, type CSSProperties } from 'react';
import { useGame } from '../context';
import { Modal, Panel, RarityBadge } from '../kit';
import { BOX_DEFS, boxOddsText } from '../../shop/boxes';
import type { BoxResult } from '../../shop/boxes';
import { rarityOf } from '../../core/rarities';
import { audio } from '../../audio/audio';
import { formatDate, formatClock } from '../../core/utils';

/** Raridade mínima para a explosão (Lendário e acima). */
const BOOM_ORDER = 4;
/** Raridade que adiciona tremor de tela + fanfarra (Divino e acima). */
const SHAKE_ORDER = 6;

/** Converte #rrggbb (ou #rgb) em "r, g, b" para usar em variáveis CSS de brilho. */
function hexToRgb(hex: string): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return '255, 255, 255';
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

export function Boxes() {
  const { engine, fmt } = useGame();
  const [showOdds, setShowOdds] = useState<string | null>(null);
  const [results, setResults] = useState<{ box: string; items: BoxResult[] } | null>(null);

  function open(boxId: string, count: number) {
    const res = engine.openBox(boxId, count);
    if (res) {
      setResults({ box: boxId, items: res });
      const best = res.reduce((m, r) => Math.max(m, rarityOf(r.rarity).order), -1);
      if (best >= SHAKE_ORDER) audio.achievement();
      else audio.box();
    }
  }

  return (
    <div className="screen">
      <Panel title="Caixas" icon="📦" right={<span className="muted small">Proteção contra duplicatas: pets ainda não descobertos têm 3× mais peso.</span>}>
        <div className="box-grid">
          {BOX_DEFS.map((box) => {
            const owned = engine.boxCount(box.id);
            const cost = engine.boxBuyCost(box.id);
            const can = engine.canAfford(box.currency, cost);
            const locked = engine.state.level < box.unlockLevel;
            return (
              <div key={box.id} className={`box-card big ${locked ? 'locked' : ''}`}>
                <div className="box-emoji">{box.icon}</div>
                <strong>{box.name}</strong>
                <p className="muted small">{box.desc}</p>
                <div className="box-odds" onClick={() => setShowOdds(box.id)} title="Ver probabilidades">
                  🎲 Probabilidades
                </div>
                <div className="box-owned">Você tem: <strong>×{owned}</strong></div>
                {locked ? (
                  <div className="locked-text">🔒 Requer nível {box.unlockLevel}</div>
                ) : (
                  <div className="box-buttons">
                    <button className="btn btn-sm" disabled={!can} onClick={() => { if (engine.buyBox(box.id, 1).ok) audio.buy(); }}>
                      Comprar · {fmt(cost, 0)}
                    </button>
                    <button className="btn btn-sm btn-primary" disabled={owned < 1} onClick={() => open(box.id, 1)}>Abrir 1</button>
                    <button className="btn btn-sm btn-primary" disabled={owned < 10} onClick={() => open(box.id, 10)}>Abrir 10</button>
                    <button className="btn btn-sm" disabled={owned < 1} onClick={() => open(box.id, owned)}>Abrir todas ({owned})</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {engine.state.boxHistory.length > 0 && (
        <Panel title="Histórico de aberturas" icon="🕘">
          <div className="history-list">
            {[...engine.state.boxHistory].reverse().slice(0, 30).map((h, i) => (
              <div key={i} className="history-item">
                <RarityBadge rarity={h.rarity} size="sm" />
                <span>{h.label}</span>
                <small className="muted">{formatDate(h.at)} {formatClock(h.at)}</small>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Modal open={showOdds !== null} onClose={() => setShowOdds(null)} title="Probabilidades" width={520}>
        {showOdds && (
          <div className="odds-list">
            {BOX_DEFS.filter((b) => b.id === showOdds).map((box) => (
              <div key={box.id}>
                <p className="muted small">{boxOddsText(box)}</p>
                <p className="muted small">
                  Tipo do conteúdo: Pets 55% · Equipamentos 25%+ · Recursos · Consumíveis · Tickets
                  (varia por caixa). Raridades mais altas exigem mundos mais avançados.
                </p>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={results !== null} onClose={() => setResults(null)} title="Resultados" width={520}>
        {results && (() => {
          const bestRar = results.items.reduce((m, r) => {
            const rr = rarityOf(r.rarity);
            return rr.order > m.order ? rr : m;
          }, rarityOf('common'));
          const boom = bestRar.order >= BOOM_ORDER;
          const tier6 = bestRar.order >= SHAKE_ORDER;
          return (
            <div
              className={`results-wrap ${boom ? 'boom' : ''} ${tier6 ? 'boom-tier6' : ''}`}
              style={{ '--boom-color': hexToRgb(bestRar.color) } as CSSProperties}
            >
              {boom && (
                <div className="boom-fx" aria-hidden="true">
                  <span className="boom-ring" />
                  <span className="boom-ring r2" />
                  <span className="boom-ring r3" />
                  <span className="boom-burst" />
                </div>
              )}
              <div className="results-grid">
                {results.items.map((r, i) => {
                  const rar = rarityOf(r.rarity);
                  const isBoom = rar.order >= BOOM_ORDER;
                  return (
                    <div
                      key={i}
                      className={`result-chip ${isBoom ? 'boom' : ''}`}
                      style={{ borderColor: rar.color, animationDelay: `${Math.min(i, 10) * 60}ms` }}
                    >
                      <RarityBadge rarity={r.rarity} size="sm" />
                      <span>{r.label}</span>
                      {r.kind === 'resource' && <small>+{fmt(r.amount, 0)}</small>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
