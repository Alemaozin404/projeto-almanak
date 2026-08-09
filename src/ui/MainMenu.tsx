import { useCallback, useEffect, useState } from 'react';
import { SaveManager, type SaveSlot } from '../save/saveManager';
import { ConfirmModal } from './kit';
import { formatDuration } from '../core/notation';
import { GAME_VERSION } from '../content/updates';
import { audio } from '../audio/audio';
import { applyTheme, storedTheme } from './theme';

/** A intro cinematográfica é exibida uma única vez por sessão. */
let introDone = false;

interface Props {
  saveMgr: SaveManager;
  onNewGame: (slot: SaveSlot) => void;
  onContinue: (slot: SaveSlot) => void;
  onImport: (slot: SaveSlot, text: string) => void;
}

export function MainMenu({ saveMgr, onNewGame, onContinue, onImport }: Props) {
  const [view, setView] = useState<'menu' | 'slots'>('menu');
  const [slots, setSlots] = useState<Awaited<ReturnType<SaveManager['listSlots']>>>([]);
  const [confirmDelete, setConfirmDelete] = useState<SaveSlot | null>(null);
  const [toast, setToast] = useState('');
  // intro cinematográfica — toca uma vez por sessão, pulável
  const [intro, setIntro] = useState(
    () => !introDone && !(typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  );
  const [closing, setClosing] = useState(false);

  // música + ambiente do menu (sintetizados) e tema persistido da última sessão
  useEffect(() => {
    audio.startMenu();
    applyTheme(storedTheme());
  }, []);

  const finishIntro = useCallback(() => {
    introDone = true;
    setClosing(true);
  }, []);

  useEffect(() => {
    if (!intro) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter') {
        const t = e.target as HTMLElement | null;
        if (t && ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
        e.preventDefault();
        finishIntro();
      }
    };
    window.addEventListener('keydown', h);
    const t = window.setTimeout(finishIntro, 4500);
    return () => {
      window.removeEventListener('keydown', h);
      window.clearTimeout(t);
    };
  }, [intro, finishIntro]);

  // fade-out suave antes de desmontar a intro
  useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => setIntro(false), 320);
    return () => window.clearTimeout(t);
  }, [closing]);

  async function refresh() {
    setSlots(await saveMgr.listSlots());
  }

  function openSlots() {
    void refresh();
    setView('slots');
  }

  async function handleImport(slot: SaveSlot) {
    const text = window.prompt('Cole o código do save (exportado como NC1...):');
    if (!text) return;
    onImport(slot, text);
    void refresh();
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  return (
    <div className="main-menu">
      {intro && (
        <div className={`intro ${closing ? 'closing' : ''}`} onClick={finishIntro} role="dialog" aria-label="Apresentação inicial — clique para pular">
          <div className="intro-stars" aria-hidden="true" />
          <span className="intro-streak s1" aria-hidden="true" />
          <span className="intro-streak s2" aria-hidden="true" />
          <span className="intro-streak s3" aria-hidden="true" />
          <span className="intro-streak s4" aria-hidden="true" />
          <span className="intro-streak s5" aria-hidden="true" />
          <div className="intro-scene">
            <span className="intro-ring r1" aria-hidden="true" />
            <span className="intro-ring r2" aria-hidden="true" />
            <span className="intro-ring r3" aria-hidden="true" />
            <div className="intro-orb">⚡</div>
          </div>
          <div className="intro-title-block">
            <h1>NÚCLEO <span>CLICKER</span></h1>
            <p>Toque o Núcleo. Evolua sem limites.</p>
          </div>
          <div className="intro-progress" aria-hidden="true" />
          <button className="intro-skip btn btn-xs" onClick={(e) => { e.stopPropagation(); finishIntro(); }}>
            PULAR ▸▸
          </button>
        </div>
      )}
      <div className="menu-backdrop" />
      <div className="menu-stars" aria-hidden="true" />
      <div className="menu-letterbox top" aria-hidden="true" />
      <div className="menu-letterbox bottom" aria-hidden="true"><span>✦ NÚCLEO CLICKER · v{GAME_VERSION} ✦</span></div>
      <div className="menu-content">
        <p className="menu-kicker">⟡ REATOR INFINITO ⟡</p>
        <h1 className="menu-title">
          <span className="menu-logo">⚡</span> NÚCLEO <span className="menu-sub">CLICKER</span>
        </h1>
        <p className="menu-tagline">Toque o Núcleo. Evolua sem limites.</p>
        <span className="menu-chip">💾 100% offline · sem anúncios</span>

        {view === 'menu' ? (
          <div className="menu-buttons">
            <button className="btn btn-primary btn-big" onClick={() => { audio.ui(); void refresh(); setView('slots'); }}>
              ▶ NOVO JOGO
            </button>
            <button className="btn btn-big" onClick={() => { audio.ui(); openSlots(); }}>💾 CONTINUAR</button>
            <button className="btn btn-big" onClick={() => { audio.ui(); flash('Configurações globais são salvas em cada save — acesse dentro do jogo.'); }}>
              ⚙ CONFIGURAÇÕES
            </button>
            <button className="btn btn-big" onClick={() => { audio.ui(); window.close(); }}>⏻ SAIR</button>
          </div>
        ) : (
          <div className="slot-list">
            <button className="btn btn-sm" onClick={() => { audio.ui(); setView('menu'); }}>← Voltar</button>
            {slots.map((meta) => (
              <div key={meta.slot} className={`slot-card ${meta.exists ? '' : 'empty'}`}>
                <div className="slot-info">
                  <strong>{meta.slot.toUpperCase()}</strong>
                  {meta.exists ? (
                    <>
                      <span>{meta.name} · Nv {meta.level} · {meta.prestige} prestígios</span>
                      <small>{formatDuration(meta.playTime)} jogados</small>
                    </>
                  ) : (
                    <span>Slot vazio</span>
                  )}
                </div>
                <div className="slot-actions">
                  {meta.exists ? (
                    <button className="btn btn-primary" onClick={() => { audio.ui(); onContinue(meta.slot); }}>Continuar</button>
                  ) : (
                    <button className="btn btn-primary" onClick={() => { audio.ui(); onNewGame(meta.slot); }}>Novo jogo</button>
                  )}
                  <button className="btn btn-sm" onClick={() => { audio.ui(); void handleImport(meta.slot); }}>Importar</button>
                  {meta.exists && <button className="btn btn-sm btn-danger" onClick={() => { audio.ui(); setConfirmDelete(meta.slot); }}>Apagar</button>}
                </div>
              </div>
            ))}
          </div>
        )}

        {toast && <div className="menu-toast">{toast}</div>}
      </div>

      <ConfirmModal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            void saveMgr.delete(confirmDelete);
            flash('Save apagado.');
            void refresh();
          }
        }}
        title="Apagar save"
        desc={`Tem certeza? O save ${confirmDelete?.toUpperCase()} será apagado permanentemente.`}
        confirmLabel="Apagar"
        danger
      />
    </div>
  );
}
