import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { GameEngine, type OfflineResult } from './game/engine';
import { SaveManager, type SaveSlot } from './save/saveManager';
import { GameContext } from './ui/context';
import { Sidebar, type Screen } from './ui/sidebar';
import { TopBar } from './ui/topbar';
import { Toasts } from './ui/toasts';
import { Modal } from './ui/kit';
import { MainMenu } from './ui/MainMenu';
import { Home } from './ui/screens/Home';
import { Upgrades } from './ui/screens/Upgrades';
import { Shop } from './ui/screens/Shop';
import { Wallet } from './ui/screens/Wallet';
import { Boxes } from './ui/screens/Boxes';
import { Pets } from './ui/screens/Pets';
import { Inventory } from './ui/screens/Inventory';
import { Skills } from './ui/screens/Skills';
import { Quests } from './ui/screens/Quests';
import { Achievements } from './ui/screens/Achievements';
import { Prestige } from './ui/screens/Prestige';
import { Events } from './ui/screens/Events';
import { Collection } from './ui/screens/Collection';
import { Profile } from './ui/screens/Profile';
import { Stats } from './ui/screens/Stats';
import { Ranking } from './ui/screens/Ranking';
import { Wardrobe } from './ui/screens/Wardrobe';
import { Updates } from './ui/screens/Updates';
import { SeasonHub } from './ui/screens/SeasonHub';
import { Pass } from './ui/screens/Pass';
import { Admin } from './ui/screens/Admin';
import { Settings } from './ui/screens/Settings';
import { Debug } from './ui/screens/Debug';
import { equippedSkin } from './content/skins';
import { UpdateManager } from './liveops/UpdateManager';
import { latestUpdate, updateByVersion } from './content/updates';
import { syncRemoteContent, SYNC_INTERVAL_MS } from './liveops/RemoteContent';
import { audio } from './audio/audio';
import { applyTheme } from './ui/theme';
import { bus } from './core/events';
import { formatNumber, formatFull, formatDuration } from './core/notation';
import type { Num } from './core/bignum';
import type { CSSProperties } from 'react';

/** Cursor custom gerado de um emoji (SVG data-uri) — offline, sem assets. */
function cursorDataUri(emoji: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='30' height='30'><text y='24' font-size='24'>${emoji}</text></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 4, auto`;
}

export default function App() {
  const [engine, setEngine] = useState<GameEngine | null>(null);
  const [screen, setScreen] = useState<Screen>('home');
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [offline, setOffline] = useState<OfflineResult | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMsg, setMenuMsg] = useState('');
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);

  // ── conteúdo online (LiveOps): sincroniza no boot e revalida periodicamente ──
  // Notícias, eventos, banners, códigos, changelog e manutenção vêm do servidor
  // (Vercel). Sem servidor configurado, o jogo usa o conteúdo local — nada muda.
  useEffect(() => {
    let alive = true;
    // força um re-render quando o conteúdo chega — as telas (banners, notícias,
    // eventos) passam a exibir os dados online imediatamente, sem esperar outro evento
    void syncRemoteContent().then((r) => { if (alive && r === 'online') force(); });
    const iv = window.setInterval(() => {
      void syncRemoteContent().then((r) => { if (alive && r === 'online') force(); });
    }, SYNC_INTERVAL_MS);
    return () => { alive = false; window.clearInterval(iv); };
  }, []);

  const saveMgrRef = useRef<SaveManager | null>(null);
  if (!saveMgrRef.current) saveMgrRef.current = new SaveManager();
  const engineRef = useRef<GameEngine | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // ── anexar/desanexar engine ──────────────────────────────
  const attach = useCallback((e: GameEngine, fixed?: string[]) => {
    engineRef.current = e;
    audio.init(() => e.state.settings);
    audio.updateVolumes();
    audio.stopMenu();
    audio.setMusic(e.state.settings.audio.music?.enabled ?? false);
    applyTheme(e.state.settings.theme);

    const unsub = e.subscribe(() => force());
    const offs = [
      bus.on('achievement', () => audio.achievement()),
      bus.on('levelUp', () => audio.levelUp()),
      bus.on('petFound', () => audio.pet()),
      bus.on('boxOpened', () => audio.box()),
      bus.on('prestige', () => audio.prestige()),
      bus.on('questDone', () => audio.quest()),
    ];
    let last = performance.now();
    const iv = window.setInterval(() => {
      const n = performance.now();
      const dt = n - last;
      last = n;
      // pausa a produção idle quando a janela fica oculta (configuração de gameplay)
      if (document.visibilityState === 'hidden' && e.state.settings?.gameplay?.pauseIdle) return;
      e.tick(dt);
    }, 100);
    saveMgrRef.current!.startAutoSave(e, e.state.settings.autoSaveMinutes);

    setEngine(e);
    setScreen('home');
    setMenuOpen(false);
    setShowUpdatePopup(UpdateManager.shouldShowPopup(e.state));
    // backup automático antes de uma atualização importante (primeira execução da versão)
    if (UpdateManager.shouldShowPopup(e.state)) {
      void saveMgrRef.current!.createBackup(e);
    }

    const off = e.computeOffline();
    if (off) setOffline(off);
    if (fixed && fixed.length > 0) {
      bus.emit('notify', {
        kind: 'default',
        title: 'Save corrigido automaticamente',
        desc: `${fixed.length} problema(s) detectado(s) e corrigido(s) pelo sistema de integridade.`,
      });
    }
    cleanupRef.current = () => {
      unsub();
      offs.forEach((o) => o());
      window.clearInterval(iv);
      saveMgrRef.current!.stopAutoSave();
    };
  }, []);

  const detach = useCallback(() => {
    const e = engineRef.current;
    if (e) void saveMgrRef.current!.save(e);
    cleanupRef.current?.();
    cleanupRef.current = null;
    engineRef.current = null;
    setEngine(null);
    setOffline(null);
    audio.startMenu();
  }, []);

  // ── teclado: Espaço / Enter clicam ───────────────────────
  const lastKeyRef = useRef(0);
  useEffect(() => {
    const h = (ev: KeyboardEvent) => {
      const e = engineRef.current;
      if (!e || (ev.code !== 'Space' && ev.code !== 'Enter')) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      // anti-automação: ignora repetições mais rápidas que ~33/s (segura o auto-repeat)
      const t = performance.now();
      if (t - lastKeyRef.current < 30) return;
      lastKeyRef.current = t;
      ev.preventDefault();
      e.click('key');
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // ── salvar ao fechar / ocultar ───────────────────────────
  useEffect(() => {
    const save = () => {
      const e = engineRef.current;
      if (e) void saveMgrRef.current!.save(e);
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  // ── fluxos de menu principal ─────────────────────────────
  const onNewGame = useCallback((slot: SaveSlot) => {
    const e = new GameEngine();
    saveMgrRef.current!.setSlot(slot);
    attach(e);
    void saveMgrRef.current!.save(e);
  }, [attach]);

  const onContinue = useCallback((slot: SaveSlot) => {
    void saveMgrRef.current!.load(slot).then((res) => {
      if (res) attach(res.engine, res.fixed);
      else bus.emit('notify', { kind: 'default', title: 'Falha ao carregar', desc: 'O save está corrompido ou não existe.' });
    });
  }, [attach]);

  const onImport = useCallback((slot: SaveSlot, text: string) => {
    void saveMgrRef.current!.importText(slot, text).then((r) => {
      bus.emit('notify', {
        kind: 'default',
        title: r.ok ? 'Save importado!' : 'Importação falhou',
        desc: r.ok ? 'Escolha Continuar para jogar.' : r.reason ?? 'Erro desconhecido',
      });
    });
  }, []);

  // ── formatação ───────────────────────────────────────────
  const fmt = useCallback((v: Num, digits?: number) => {
    const s = engineRef.current?.state.settings;
    return formatNumber(v, s?.notation ?? 'short', { digits });
  }, []);
  const fmtFull = useCallback((v: Num) => formatFull(v), []);

  // ── menu principal (sem jogo ativo) ──────────────────────
  if (!engine) {
    return (
      <>
        <MainMenu saveMgr={saveMgrRef.current!} onNewGame={onNewGame} onContinue={onContinue} onImport={onImport} />
        <Toasts />
      </>
    );
  }

  const s = engine.state;

  // ── skin global (fundo / cursor / accent) ────────────────
  const activeSkin = equippedSkin(s);
  const classNames = [
    'app',
    s.settings.reducedMotion ? 'rm' : '',
    s.settings.colorblindMode ? 'cb' : '',
    activeSkin.visual.background ? 'skin-bg' : '',
  ].filter(Boolean).join(' ');
  const appStyle: CSSProperties = {
    fontSize: `${(s.settings.interface.fontScale * s.settings.interface.uiScale).toFixed(3)}em`,
    ...(activeSkin.visual.background ? { background: activeSkin.visual.background } : {}),
    ...(activeSkin.visual.accent ? ({ '--accent': activeSkin.visual.accent } as CSSProperties) : {}),
    ...(activeSkin.visual.cursorEmoji ? { cursor: cursorDataUri(activeSkin.visual.cursorEmoji) } : {}),
  };

  // ── manutenção programada ────────────────────────────────
  const maint = UpdateManager.maintenanceActive();
  if (maint) {
    return (
      <div className="maint-screen">
        <div className="maint-card">
          <span className="maint-icon">🔧</span>
          <h2>MANUTENÇÃO</h2>
          <p className="muted">O jogo está passando por manutenção.</p>
          <div className="maint-info"><span>Motivo:</span><strong>{maint.reason}</strong></div>
          <div className="maint-info"><span>Previsão:</span><strong>{maint.eta}</strong></div>
          <p className="muted small">Seus saves estão seguros. Volte em alguns minutos.</p>
        </div>
      </div>
    );
  }

  function flashMenu(msg: string) {
    setMenuMsg(msg);
    setTimeout(() => setMenuMsg(''), 2500);
  }

  return (
    <GameContext.Provider value={{ engine, fmt, fmtFull }}>
      <div className={classNames} style={appStyle}>
        <div className="app-fx" aria-hidden="true">
          <div className="fx-stars" />
        </div>
        <Sidebar screen={screen} onNavigate={setScreen} />
        <div className="main">
          <TopBar onMenu={() => setMenuOpen(true)} worldName={engine.worldName()} />
          <main className="content">
            {screen === 'home' && <Home onNavigate={setScreen} />}
            {screen === 'upgrades' && <Upgrades />}
            {screen === 'shop' && <Shop onOpenBoxes={() => setScreen('boxes')} />}
            {screen === 'wallet' && <Wallet />}
            {screen === 'boxes' && <Boxes />}
            {screen === 'pets' && <Pets />}
            {screen === 'inventory' && <Inventory />}
            {screen === 'skills' && <Skills />}
            {screen === 'quests' && <Quests />}
            {screen === 'achievements' && <Achievements />}
            {screen === 'prestige' && <Prestige />}
            {screen === 'events' && <Events />}
            {screen === 'collection' && <Collection />}
            {screen === 'profile' && <Profile />}
            {screen === 'stats' && <Stats />}
            {screen === 'ranking' && <Ranking saveMgr={saveMgrRef.current!} />}
            {screen === 'wardrobe' && <Wardrobe />}
            {screen === 'updates' && <Updates />}
            {screen === 'season' && <SeasonHub />}
            {screen === 'pass' && <Pass />}
            {screen === 'admin' && <Admin />}
            {screen === 'settings' && <Settings saveMgr={saveMgrRef.current!} onBackToMenu={detach} onReload={() => onContinue(saveMgrRef.current!.getSlot())} />}
            {screen === 'debug' && <Debug />}
          </main>
        </div>
        <Toasts />

        <Modal open={showUpdatePopup} onClose={() => { UpdateManager.markSeen(engine.state); setShowUpdatePopup(false); engine.notify('update'); }} title="🚀 Nova atualização" width={460}>
          {(() => {
            // o popup anuncia SEMPRE a versão do app (GAME_VERSION) — conteúdo online
            // só alimenta a tela de Atualizações, sem confundir "nova versão do jogo"
            const patch = updateByVersion(UpdateManager.version) ?? latestUpdate();
            const highlight = patch.sections.find((s) => s.tag === 'DESTAQUE') ?? patch.sections[0];
            const items = highlight ? highlight.items.slice(0, 5) : [];
            return (
              <div className="update-popup">
                <span className="update-popup-icon">🚀</span>
                <h3>v{patch.version}</h3>
                <h4>{patch.title}</h4>
                <p className="muted small">{patch.description}</p>
                <ul className="update-popup-list">
                  {items.map((it, i) => <li key={i}>{it}</li>)}
                </ul>
                <div className="modal-actions">
                  <button className="btn" onClick={() => { UpdateManager.markSeen(engine.state); setShowUpdatePopup(false); setScreen('updates'); engine.notify('update'); }}>
                    Ver novidades
                  </button>
                  <button className="btn btn-primary" onClick={() => { UpdateManager.markSeen(engine.state); setShowUpdatePopup(false); engine.notify('update'); }}>
                    Continuar
                  </button>
                </div>
                {patch.reward && <p className="muted small center">Presente de atualização disponível na tela de Atualizações.</p>}
              </div>
            );
          })()}
        </Modal>

        <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" width={380}>
          <div className="menu-inline">
            <button className="btn" onClick={() => { void saveMgrRef.current!.save(engine).then((ok) => flashMenu(ok ? '✅ Save salvo!' : '❌ Falha ao salvar')); }}>💾 Salvar agora</button>
            <button className="btn" onClick={() => { void saveMgrRef.current!.exportToFile(engine).then((r) => flashMenu(r.ok ? '✅ Save exportado!' : r.reason ?? '❌ Falha')); }}>📤 Exportar save</button>
            <button className="btn" onClick={() => { void saveMgrRef.current!.createBackup(engine).then((b) => flashMenu(b ? `✅ Backup: ${b}` : '❌ Falha')); }}>🛡️ Criar backup</button>
            <button className="btn" onClick={() => { void saveMgrRef.current!.openDataDir(); }}>📁 Pasta de dados</button>
            <button className="btn" onClick={() => { detach(); }}>🏠 Voltar ao menu principal</button>
            <button className="btn btn-danger" onClick={() => window.close()}>⏻ Sair do jogo</button>
            {menuMsg && <div className="menu-toast">{menuMsg}</div>}
          </div>
        </Modal>

        <Modal open={offline !== null} onClose={() => setOffline(null)} title="⚡ Você ficou fora do jogo!" width={460}>
          {offline && (
            <div className="offline-box">
              <p className="muted">Durante <strong>{formatDuration(offline.seconds)}</strong>, seu Núcleo produziu:</p>
              <div className="offline-gains">
                <div><span>⚡ Energia</span><strong>{fmt(offline.energy, 2)}</strong></div>
                <div><span>🪙 Moedas</span><strong>{fmt(offline.gold, 2)}</strong></div>
              </div>
              <button className="btn btn-primary btn-big" onClick={() => { engine.applyOffline(offline); setOffline(null); }}>
                Coletar recompensas
              </button>
              <p className="muted small">Ganho offline = 50% da produção. Teto configurável nas Configurações.</p>
            </div>
          )}
        </Modal>
      </div>
    </GameContext.Provider>
  );
}
