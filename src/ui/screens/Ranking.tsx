import { useCallback, useEffect, useState } from 'react';
import { useGame } from '../context';
import { Panel } from '../kit';
import { SaveManager, SAVE_SLOTS, type SaveSlot } from '../../save/saveManager';
import type { RunRecord } from '../../game/types';
import { D, type Num } from '../../core/bignum';
import { onlineEnabled, fetchGlobalRank, submitGlobalRank, type RankEntry } from '../../online/api';
import { cloudPlayerId } from '../../online/cloudSave';

const RANK_KINDS = ['prestige', 'ascension', 'transcendence'] as const;
type RankKind = (typeof RANK_KINDS)[number];

const KIND_META: Record<RunRecord['kind'], { icon: string; label: string; unit: string }> = {
  prestige: { icon: '🌀', label: 'Prestígio', unit: 'fragmentos' },
  ascension: { icon: '👑', label: 'Ascensão', unit: 'moedas' },
  transcendence: { icon: '✨', label: 'Transcendência', unit: 'essência' },
};

const MEDALS = ['🥇', '🥈', '🥉'];

interface BestEntry {
  slot: SaveSlot;
  name: string;
  run: RunRecord;
}

/** Melhor ciclo de cada tipo por slot. */
function bestOfKind(loaded: { slot: SaveSlot; name: string; runs: RunRecord[] }[], kind: RunRecord['kind']): BestEntry[] {
  const bests: BestEntry[] = [];
  for (const l of loaded) {
    const best = l.runs
      .filter((r) => r.kind === kind)
      .sort((a, b) => D(b.gain).cmp(D(a.gain)))[0];
    if (best) bests.push({ slot: l.slot, name: l.name, run: best });
  }
  return bests.sort((a, b) => D(b.run.gain).cmp(D(a.run.gain)));
}

function podium(entries: BestEntry[], fmt: (v: Num, digits?: number) => string) {
  if (entries.length === 0) {
    return <p className="muted small">Nenhum ciclo ainda — faça um Prestígio para entrar no ranking!</p>;
  }
  return (
    <div className="rank-list">
      {entries.slice(0, 3).map((e, i) => (
        <div key={e.slot} className={`rank-row ${i === 0 ? 'rank-first' : ''}`}>
          <span className="rank-pos">{MEDALS[i] ?? `${i + 1}º`}</span>
          <span className="rank-slot">
            <strong>{e.name}</strong>
            <small>{e.slot.replace('slot', 'Save ')}</small>
          </span>
          <span className="rank-gain">
            <strong>{fmt(D(e.run.gain), 2)}</strong>
            <small>{KIND_META[e.run.kind].unit} · ciclo #{e.run.count}</small>
          </span>
          <small className="rank-date">{new Date(e.run.at).toLocaleDateString('pt-BR')}</small>
        </div>
      ))}
    </div>
  );
}

export function Ranking({ saveMgr }: { saveMgr: SaveManager }) {
  const { engine, fmt } = useGame();
  const s = engine.state;
  const [loaded, setLoaded] = useState<{ slot: SaveSlot; name: string; runs: RunRecord[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const online = onlineEnabled();
  const [globalKind, setGlobalKind] = useState<RankKind>('prestige');
  const [globalRanks, setGlobalRanks] = useState<Partial<Record<RankKind, RankEntry[]>>>({});
  const [globalLoading, setGlobalLoading] = useState(false);
  const [rankMsg, setRankMsg] = useState('');

  // ── ranking GLOBAL (online) ─────────────────────────────
  const loadGlobal = useCallback(async () => {
    if (!online) return;
    setGlobalLoading(true);
    const [p, a, t] = await Promise.all([
      fetchGlobalRank('prestige', 15),
      fetchGlobalRank('ascension', 15),
      fetchGlobalRank('transcendence', 15),
    ]);
    setGlobalRanks({ prestige: p, ascension: a, transcendence: t });
    setGlobalLoading(false);
  }, [online]);

  useEffect(() => {
    if (online) void loadGlobal();
  }, [online, loadGlobal]);

  async function submitBest() {
    if (!own) {
      setRankMsg('Carregue o save atual para publicar seus recordes.');
      return;
    }
    const playerId = cloudPlayerId(s);
    if (!playerId) {
      setRankMsg('Save sem identificador válido.');
      return;
    }
    setRankMsg('Publicando…');
    const published: string[] = [];
    for (const kind of RANK_KINDS) {
      const bestRun = own.runs
        .filter((r) => r.kind === kind)
        .sort((a, b) => D(b.gain).cmp(D(a.gain)))[0];
      if (!bestRun) continue;
      const r = await submitGlobalRank({
        playerId: String(playerId),
        name: own.name || 'Jogador',
        kind,
        gain: bestRun.gain.toString(),
        count: bestRun.count,
      });
      published.push(r.ok ? `${KIND_META[kind].label} #${bestRun.count}` : `${KIND_META[kind].label} (${r.reason ?? 'erro'})`);
    }
    setRankMsg(published.length > 0 ? `Publicado: ${published.join(' · ')}` : 'Nenhum ciclo para publicar ainda.');
    void loadGlobal();
  }

  const globalList = globalRanks[globalKind] ?? [];
  const globalMedals = ['🥇', '🥈', '🥉', '4º', '5º', '6º', '7º', '8º', '9º', '10º', '11º', '12º', '13º', '14º', '15º'];

  const load = useCallback(() => {
    setLoading(true);
    void Promise.all(
      SAVE_SLOTS.map(async (slot) => {
        const data = await saveMgr.readRanking(slot);
        return { slot, name: data?.name ?? '—', runs: data?.ranking ?? [] };
      }),
    ).then((all) => {
      setLoaded(all);
      setLoading(false);
    });
  }, [saveMgr]);

  useEffect(() => {
    load();
  }, [load]);

  const own = loaded.find((l) => l.slot === saveMgr.getSlot());

  const records: { icon: string; label: string; value: string }[] = [
    { icon: '🖱️', label: 'Cliques totais', value: fmt(s.stats.clicks ?? '0', 0) },
    { icon: '⚡', label: 'Energia produzida', value: fmt(s.stats.energyProduced ?? '0', 0) },
    { icon: '💥', label: 'Maior clique', value: fmt(s.stats.biggestClick ?? '0', 0) },
    { icon: '🔥', label: 'Maior crítico', value: fmt(s.stats.biggestCrit ?? '0', 0) },
    { icon: '🏭', label: 'Pico de produção/s', value: fmt(s.stats.energyPerSecMax ?? '0', 2) },
    { icon: '🎯', label: 'Combo máximo', value: fmt(s.stats.comboMax ?? '0', 0) },
    { icon: '🐾', label: 'Pets encontrados', value: fmt(s.stats.petsFound ?? '0', 0) },
    { icon: '📦', label: 'Caixas abertas', value: fmt(s.stats.boxesOpened ?? '0', 0) },
    { icon: '🌀', label: 'Prestígios', value: String(s.prestige.count) },
    { icon: '👑', label: 'Ascensões', value: String(s.ascension.count) },
    { icon: '✨', label: 'Transcendências', value: String(s.transcendence.count) },
  ];

  return (
    <div className="screen">
      {online && (
        <Panel
          title="🌐 Ranking global"
          icon="🌍"
          right={
            <div className="rank-actions">
              {globalLoading ? <span className="muted small">carregando…</span> : <button className="btn btn-xs ghost" onClick={() => void loadGlobal()}>⟳ Atualizar</button>}
              <button className="btn btn-xs btn-primary" onClick={() => void submitBest()}>🏆 Publicar meus recordes</button>
            </div>
          }
        >
          <div className="rank-kind-tabs">
            {RANK_KINDS.map((k) => (
              <button key={k} className={`chip-btn ${globalKind === k ? 'active' : ''}`} onClick={() => setGlobalKind(k)}>
                {KIND_META[k].icon} {KIND_META[k].label}
              </button>
            ))}
          </div>
          {rankMsg && <p className="muted small">{rankMsg}</p>}
          {globalList.length === 0 ? (
            <p className="muted small">Sem recordes globais ainda — publique seus melhores ciclos e dispute o pódio mundial! 🏆</p>
          ) : (
            <div className="rank-list">
              {globalList.map((e, i) => {
                const mine = String(e.playerId) === String(cloudPlayerId(s));
                return (
                  <div key={`${e.playerId}-${i}`} className={`rank-row ${mine ? 'rank-mine' : ''}`}>
                    <span className="rank-pos">{globalMedals[i] ?? `${i + 1}º`}</span>
                    <span className="rank-slot">
                      <strong>{e.name || 'Jogador'}</strong>
                      <small>{KIND_META[e.kind].unit}{mine ? ' · você' : ''}</small>
                    </span>
                    <span className="rank-gain">
                      <strong>{fmt(D(e.gain), 2)}</strong>
                      <small>ciclo #{e.count}</small>
                    </span>
                    <small className="rank-date">{new Date(e.at).toLocaleDateString('pt-BR')}</small>
                  </div>
                );
              })}
            </div>
          )}
          <p className="muted small" style={{ margin: '8px 0 0' }}>
            O ranking global publica apenas o seu MELHOR ciclo de cada tipo — sem dados do save, só o recorde.
          </p>
        </Panel>
      )}

      <Panel title="Ranking local" icon="🥇" right={<span className="muted small">Comparado entre os 3 slots de save</span>}>
        <p className="muted small" style={{ margin: 0 }}>
          Seus melhores ciclos de <strong>Prestígio</strong>, <strong>Ascensão</strong> e <strong>Transcendência</strong> são
          registrados automaticamente e comparados com os outros saves deste computador. Faça prestígios para conquistar o pódio!
        </p>
      </Panel>

      <Panel title="Seus recordes" icon="🏅">
        <div className="stats-grid">
          {records.map((r) => (
            <div key={r.label} className="stat-card">
              <span className="stat-icon">{r.icon}</span>
              <strong>{r.value}</strong>
              <span className="muted small">{r.label}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Pódio — Prestígio"
        icon="🌀"
        right={loading ? <span className="muted small">carregando…</span> : <button className="btn btn-xs ghost" onClick={load}>⟳ Atualizar</button>}
      >
        {podium(bestOfKind(loaded, 'prestige'), fmt)}
      </Panel>

      <Panel title="Pódio — Ascensão" icon="👑">
        {podium(bestOfKind(loaded, 'ascension'), fmt)}
      </Panel>

      <Panel title="Pódio — Transcendência" icon="✨">
        {podium(bestOfKind(loaded, 'transcendence'), fmt)}
      </Panel>

      <Panel title={`Seu histórico de ciclos (${own?.runs.length ?? 0})`} icon="📜">
        {!own || own.runs.length === 0 ? (
          <p className="muted small">Nenhum ciclo registrado neste save ainda.</p>
        ) : (
          <div className="history-list">
            {[...own.runs].reverse().map((r, i) => {
              const m = KIND_META[r.kind];
              return (
                <div key={i} className="history-item">
                  <span>{m.icon}</span>
                  <strong>{m.label} #{r.count}</strong>
                  <span className="rank-gain" style={{ marginLeft: 0 }}>+{fmt(D(r.gain), 2)} {m.unit}</span>
                  <small>{new Date(r.at).toLocaleDateString('pt-BR')}</small>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
