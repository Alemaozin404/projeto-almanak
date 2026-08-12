import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { GameEngine, type OfflineResult } from './game/engine';
import { SaveManager, type SaveSlot } from './save/saveManager';
import { GameContext } from './ui/context';
import { Sidebar, type Screen } from './ui/sidebar';
import { TopBar } from './ui/topbar';
import { Toasts } from './ui/toasts';
import { Modal, ConfirmModal } from './ui/kit';
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
import { Account } from './ui/screens/Account';
import { Settings } from './ui/screens/Settings';
import { Debug } from './ui/screens/Debug';
import { equippedSkin } from './content/skins';
import { UpdateManager } from './liveops/UpdateManager';
import { latestUpdate, updateByVersion } from './content/updates';
import { syncRemoteContent, SYNC_INTERVAL_MS } from './liveops/RemoteContent';
import { startHeartbeat } from './online/heartbeat';
import { autoPushSave, autoSyncOnLoad } from './online/autoCloud';
import { getSession, pullAccountSave } from './online/account';
import { startAccountAutoSave, stopAccountAutoSave, checkAccountRestore, applyAccountRestore, pushAccountSaveNow, autoPushAccountSave, type AccountRestoreInfo } from './online/accountSync';
import { autoPublishBestRuns } from './online/autoRank';
import { audio } from './audio/audio';
import { applyTheme } from './ui/theme';
import { bus } from './core/events';
import { formatNumber, formatFull, formatDuration } from './core/notation';
import type { Num } from './core/bignum';
import type { CSSProperties } from 'react';

/** Data curta pt-BR para os modais (0 = nunca). */
function formatWhen(ts: number): string {
  if (!ts) return 'nunca';
  return new Date(ts).toLocaleString('pt-BR');
}

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
  const [accountOpen, setAccountOpen] = useState(false);
  // restauração automática do save da conta no boot aguardando confirmação
  const [pendingAccountRestore, setPendingAccountRestore] = useState<AccountRestoreInfo | null>(null);

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
  // heartbeat oculto: sinal ao servidor a cada 1 min (presença + atualização rápida)
  const heartbeatStopRef = useRef<(() => void) | null>(null);

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
      // ranking global: publica os melhores ciclos automaticamente (online por padrão)
      bus.on('prestige', () => void autoPublishBestRuns(e.state)),
      bus.on('ascension', () => void autoPublishBestRuns(e.state)),
      bus.on('transcendence', () => void autoPublishBestRuns(e.state)),
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
    // auto-save local + push do save para a nuvem e para a CONTA a cada save
    // (a conta mantém o progresso fresco entre app e site — o timer de 1h vira
    // apenas a rede de segurança)
    saveMgrRef.current!.startAutoSave(e, e.state.settings.autoSaveMinutes, (eng) => {
      void autoPushSave(eng, saveMgrRef.current!);
      void autoPushAccountSave(eng, saveMgrRef.current!);
    });
    // save automático da CONTA no servidor a cada 1 hora (quando conectado)
    startAccountAutoSave(e, saveMgrRef.current!);
    // sinal oculto de 1 min — mantém presença no servidor e detecta conteúdo novo
    heartbeatStopRef.current = startHeartbeat(
      e.state.createdAt,
      () => force(),
      () => {
        // manutenção JÁ ativa é coberta pela tela cheia — o aviso é só para a iminente
        if (UpdateManager.maintenanceActive()) return;
        const next = UpdateManager.nextMaintenance();
        bus.emit('notify', {
          kind: 'default',
          title: '🔧 Manutenção programada',
          desc: next
            ? `${next.reason} — previsão: ${next.eta}. Salve seu progresso antes do horário.`
            : 'O servidor sinalizou manutenção em breve — salve seu progresso.',
        });
      },
    );

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
      heartbeatStopRef.current?.();
      heartbeatStopRef.current = null;
      saveMgrRef.current!.stopAutoSave();
      stopAccountAutoSave();
    };
  }, []);

  const detach = useCallback(() => {
    const e = engineRef.current;
    if (e) {
      void saveMgrRef.current!.save(e).then((ok) => {
        if (ok) {
          void autoPushSave(e, saveMgrRef.current!, true);
          void autoPushAccountSave(e, saveMgrRef.current!, true);
        }
      });
    }
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
    const save = (forceAccount = false) => {
      const e = engineRef.current;
      if (e) {
        void saveMgrRef.current!.save(e).then((ok) => {
          if (ok) {
            void autoPushSave(e, saveMgrRef.current!);
            void autoPushAccountSave(e, saveMgrRef.current!, forceAccount);
          }
        });
      }
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') save();
    };
    // fechar o app/site é a ÚLTIMA chance de sincronizar a conta — ignora o
    // throttle para o outro dispositivo (app ↔ site) receber o progresso
    const onUnload = () => save(true);
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
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
    void saveMgrRef.current!.load(slot).then(async (res) => {
      if (res) {
        attach(res.engine, res.fixed);
        return;
      }
      // slot vazio → tenta restaurar o save da CONTA vinculado a este slot
      // (caso típico de máquina nova: o progresso volta no login)
      const session = getSession();
      if (session) {
        const cloud = await pullAccountSave(session.token);
        if (cloud.ok && cloud.info && (!cloud.info.slot || cloud.info.slot === slot)) {
          const imp = await saveMgrRef.current!.importText(slot, cloud.info.saveText);
          if (imp.ok) {
            const loaded = await saveMgrRef.current!.load(slot);
            if (loaded) {
              bus.emit('notify', {
                kind: 'default',
                title: '👤 Save da conta restaurado',
                desc: 'O slot estava vazio — o save vinculado à sua conta foi carregado automaticamente.',
              });
              attach(loaded.engine, loaded.fixed);
              return;
            }
          }
        }
      }
      bus.emit('notify', { kind: 'default', title: 'Falha ao carregar', desc: 'O save está corrompido ou não existe.' });
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

  // ── sincronização automática no boot (online por padrão) ──
  // 1. Nuvem (playerId): restaura quando mais recente; senão, sobe o local.
  // 2. Conta (quando logado): restaura o save vinculado ao slot atual se a
  //    conta estiver mais recente (mesmo mecanismo, vinculado ao slot).
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    let alive = true;
    void autoSyncOnLoad(saveMgrRef.current!, e).then(async (r) => {
      if (!alive) return;
      if (r === 'restored') {
        bus.emit('notify', {
          kind: 'default',
          title: '☁️ Save restaurado da nuvem',
          desc: 'Uma versão mais recente do seu save foi encontrada no servidor e carregada.',
        });
        onContinue(saveMgrRef.current!.getSlot());
        return;
      }
      // nuvem sem restauração → verifica a CONTA (save vinculado ao slot atual).
      // Se há candidato, PEDE CONFIRMAÇÃO antes de sobrescrever o save local.
      const check = await checkAccountRestore(saveMgrRef.current!, e);
      if (!alive) return;
      if (check.pending) {
        setPendingAccountRestore(check.info);
        return;
      }
      if (check.reason === 'no-save' || check.reason === 'local-newer') {
        // conta sem save (primeiro backup) OU local mais novo → sobe o local
        // (silencioso): o outro dispositivo (app ↔ site) restaura no próximo boot
        await pushAccountSaveNow(e, saveMgrRef.current!);
      }
    });
    return () => { alive = false; };
  }, [engine, onContinue]);

  // aplica a restauração confirmada do save da conta e recarrega o jogo
  const confirmAccountRestore = useCallback(() => {
    const info = pendingAccountRestore;
    setPendingAccountRestore(null);
    if (!info) return;
    const e = engineRef.current;
    if (!e) return;
    void applyAccountRestore(saveMgrRef.current!, e, info).then((ok) => {
      if (!ok) return;
      bus.emit('notify', {
        kind: 'default',
        title: '👤 Save da conta restaurado',
        desc: 'O save vinculado à sua conta (slot atual) foi carregado automaticamente.',
      });
      onContinue(saveMgrRef.current!.getSlot());
    });
  }, [pendingAccountRestore, onContinue]);

  // ── formatação ───────────────────────────────────────────
  const fmt = useCallback((v: Num, digits?: number) => {
    const s = engineRef.current?.state.settings;
    return formatNumber(v, s?.notation ?? 'short', { digits });
  }, []);
  const fmtFull = useCallback((v: Num) => formatFull(v), []);

  // ── menu principal (sem jogo ativo) ──────────────────────
  if (!engine) {
    return accountOpen ? (
      <>
        <Account saveMgr={saveMgrRef.current!} engine={null} />
        <div className="menu-account-back">
          <button className="btn btn-sm" onClick={() => setAccountOpen(false)}>← Voltar ao menu</button>
        </div>
        <Toasts />
      </>
    ) : (
      <>
        <MainMenu saveMgr={saveMgrRef.current!} onNewGame={onNewGame} onContinue={onContinue} onImport={onImport} onAccount={() => setAccountOpen(true)} />
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
          <TopBar onMenu={() => setMenuOpen(true)} worldName={engine.worldName()} onAccountClick={() => setScreen('account')} />
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
            {screen === 'account' && <Account saveMgr={saveMgrRef.current!} engine={engine} onReload={() => onContinue(saveMgrRef.current!.getSlot())} />}
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

        <ConfirmModal
          open={pendingAccountRestore !== null}
          onClose={() => setPendingAccountRestore(null)}
          onConfirm={confirmAccountRestore}
          title="Restaurar save da conta?"
          desc={
            pendingAccountRestore
              ? `O save da conta (${pendingAccountRestore.name}, salvo em ${formatWhen(pendingAccountRestore.savedAt)}) é mais novo que o save local deste slot (${pendingAccountRestore.localSavedAt ? formatWhen(pendingAccountRestore.localSavedAt) : 'sem save local'}). Um backup do save local é criado antes de restaurar. Deseja continuar?`
              : ''
          }
          confirmLabel="Restaurar e recarregar"
        />

        <Modal open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu" width={380}>
          <div className="menu-inline">
            <button className="btn" onClick={() => { void saveMgrRef.current!.save(engine).then((ok) => { flashMenu(ok ? '✅ Save salvo!' : '❌ Falha ao salvar'); if (ok) { void autoPushSave(engine, saveMgrRef.current!); void autoPushAccountSave(engine, saveMgrRef.current!, true); } }); }}>💾 Salvar agora</button>
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
