import { useEffect, useState } from 'react';
import { useGame } from '../context';
import { ConfirmModal, Panel, TabBar } from '../kit';
import { audio } from '../../audio/audio';
import { applyTheme } from '../theme';
import { setDebug } from '../../debug/debug';
import { defaultSettings, defaultNotificationPrefs, defaultPrivacyPrefs, type AudioChannel, type NotificationPrefs, type PrivacyScope, type ThemeId } from '../../game/types';
import { STATUS_PRESETS } from '../../profile/status';
import { GAME_VERSION } from '../../content/updates';
import { pixBackendUrl, setPixBackendUrl, clearPixBackendUrl, pixOnlineEnabled, testPixBackend, isPixBackendUrlValid } from '../../wallet/mp';
import { onlineEnabled, serverUrl } from '../../online/api';
import { pushCloudSave, pullCloudSave, cloudPlayerId } from '../../online/cloudSave';
import { lastSyncAt, remoteGameVersion } from '../../liveops/RemoteContent';
import { debugEnabled } from '../../debug/debug';

interface Props {
  saveMgr: import('../../save/saveManager').SaveManager;
  onBackToMenu: () => void;
  onReload: () => void;
}

const AUDIO_CHANNELS: { id: AudioChannel; name: string; icon: string }[] = [
  { id: 'music', name: 'Música', icon: '🎵' },
  { id: 'sfx', name: 'Efeitos', icon: '🔊' },
  { id: 'ui', name: 'Interface', icon: '🖱️' },
  { id: 'events', name: 'Eventos', icon: '🎊' },
  { id: 'notifications', name: 'Notificações', icon: '🔔' },
  { id: 'ambient', name: 'Ambiente', icon: '🌿' },
];

const NOTIF_ITEMS: { key: keyof NotificationPrefs; name: string }[] = [
  { key: 'achievements', name: 'Conquistas desbloqueadas' },
  { key: 'newSkin', name: 'Nova skin' },
  { key: 'newPet', name: 'Novo pet' },
  { key: 'newQuest', name: 'Nova missão' },
  { key: 'eventStarted', name: 'Evento iniciado' },
  { key: 'eventEnding', name: 'Evento terminando' },
  { key: 'update', name: 'Atualizações' },
  { key: 'dailyReward', name: 'Recompensa diária' },
  { key: 'pass', name: 'Passe' },
  { key: 'offers', name: 'Ofertas' },
];

const PRIVACY_ITEMS: { key: keyof ReturnType<typeof defaultPrivacyPrefs>; name: string }[] = [
  { key: 'profile', name: 'Perfil' },
  { key: 'stats', name: 'Estatísticas' },
  { key: 'achievements', name: 'Conquistas' },
  { key: 'title', name: 'Título' },
  { key: 'collection', name: 'Coleção' },
  { key: 'pass', name: 'Passe' },
  { key: 'status', name: 'Status' },
];

const PRIVACY_LABEL: Record<PrivacyScope, string> = {
  public: 'Público',
  private: 'Privado',
  local: 'Somente local',
};

export function Settings({ saveMgr, onBackToMenu, onReload }: Props) {
  const { engine } = useGame();
  const s = engine.state;
  const [tab, setTab] = useState('geral');
  const [confirmReset, setConfirmReset] = useState(false);
  const [backups, setBackups] = useState<string[]>([]);
  const [saveMsg, setSaveMsg] = useState('');
  const [showBackups, setShowBackups] = useState(false);
  const [pixUrl, setPixUrl] = useState(pixBackendUrl());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; label: string } | null>(null);
  const [cloudMsg, setCloudMsg] = useState('');
  const [cloudBusy, setCloudBusy] = useState(false);
  const [confirmCloudPull, setConfirmCloudPull] = useState(false);
  const [cloudInfo, setCloudInfo] = useState<{ name: string; savedAt: number } | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const [updState, setUpdState] = useState<'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'dev'>('idle');
  const [updPercent, setUpdPercent] = useState(0);
  const [updMsg, setUpdMsg] = useState('');

  // ── auto-update (Electron) ──
  useEffect(() => {
    const up = window.api?.updater;
    if (!up) {
      setUpdState('dev');
      return;
    }
    void up.getVersion().then((v) => setAppVersion(v.version));
    const off = up.onEvent((e) => {
      switch (e.type) {
        case 'checking': setUpdState('checking'); break;
        case 'available': setUpdState('available'); setUpdMsg(`Nova versão disponível: v${e.version}`); break;
        case 'not-available': setUpdState('not-available'); setUpdMsg('Você já está na versão mais recente ✅'); break;
        case 'progress': setUpdState('downloading'); setUpdPercent(e.percent ?? 0); break;
        case 'downloaded': setUpdState('downloaded'); setUpdMsg('Atualização baixada! Reinicie para instalar.'); break;
        case 'error': setUpdState('error'); setUpdMsg(`Erro na atualização: ${e.message ?? 'desconhecido'}`); break;
        case 'dev': setUpdState('dev'); setUpdMsg('Auto-update disponível apenas na versão instalada.'); break;
      }
    });
    return off;
  }, []);

  function flashCloud(msg: string) {
    setCloudMsg(msg);
    setTimeout(() => setCloudMsg(''), 3500);
  }

  const playerId = cloudPlayerId(s);
  const online = onlineEnabled();

  const set = (patch: Partial<typeof s.settings>) => { engine.updateSettings(patch); audio.updateVolumes(); };
  const block = <K extends 'interface' | 'gameplay' | 'notifications' | 'privacy'>(b: K, patch: Partial<typeof s.settings[K]>) => engine.updateSettingsBlock(b, patch as any);

  function flash(msg: string) {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(''), 3000);
  }

  async function refreshBackups() {
    setBackups(await saveMgr.listBackups());
  }

  function restoreAudioDefaults() {
    engine.state.settings.audio = JSON.parse(JSON.stringify(defaultSettings().audio));
    engine.notify('settings');
    audio.updateVolumes();
    flash('Áudio restaurado aos padrões');
  }

  const g = s.settings.gameplay;
  const iface = s.settings.interface;

  return (
    <div className="screen">
      <Panel title="Configurações" icon="⚙️">
        <TabBar
          tabs={[
            { id: 'geral', name: 'Geral', icon: '🧩' },
            { id: 'interface', name: 'Interface', icon: '🎛️' },
            { id: 'graficos', name: 'Gráficos', icon: '🖼️' },
            { id: 'audio', name: 'Áudio', icon: '🔊' },
            { id: 'gameplay', name: 'Gameplay', icon: '🎮' },
            { id: 'notif', name: 'Notificações', icon: '🔔' },
            { id: 'acess', name: 'Acessibilidade', icon: '♿' },
            { id: 'privacidade', name: 'Privacidade', icon: '🔒' },
            { id: 'dados', name: 'Dados', icon: '💾' },
            ...(debugEnabled(engine) ? [{ id: 'pagamentos', name: 'Pagamentos', icon: '💳' }] : []),
            { id: 'sistema', name: 'Sistema', icon: '🖥️' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'geral' && (
          <div className="settings-grid">
            <div className="settings-col">
              <h4>🧩 Geral</h4>
              <label className="setting-row"><span>Idioma</span><select value="pt-BR"><option value="pt-BR">Português (BR)</option></select></label>
              <label className="setting-row"><span>Região</span><select value={s.settings.region} onChange={(e) => set({ region: e.target.value })}><option value="BR">Brasil</option><option value="US">Estados Unidos</option></select></label>
              <label className="setting-row"><span>Formato de números</span><select value={s.settings.numberFormat} onChange={(e) => set({ numberFormat: e.target.value as 'pt-BR' | 'en-US' })}><option value="pt-BR">pt-BR (1.234,56)</option><option value="en-US">en-US (1,234.56)</option></select></label>
              <label className="setting-row">
                <span>Notação numérica</span>
                <select value={s.settings.notation} onChange={(e) => set({ notation: e.target.value as 'short' | 'standard' | 'scientific' })}>
                  <option value="short">Curta (1.5M)</option>
                  <option value="standard">Padrão (1.500.000)</option>
                  <option value="scientific">Científica (1.5e6)</option>
                </select>
              </label>
            </div>
            <div className="settings-col">
              <h4>✅ Confirmações</h4>
              <label className="setting-row"><span>Confirmar compras</span><input type="checkbox" checked={g.confirmPurchases} onChange={(e) => block('gameplay', { confirmPurchases: e.target.checked })} /></label>
              <label className="setting-row"><span>Confirmar Prestígio</span><input type="checkbox" checked={g.confirmPrestige} onChange={(e) => block('gameplay', { confirmPrestige: e.target.checked })} /></label>
              <label className="setting-row"><span>Confirmar Ascensão</span><input type="checkbox" checked={g.confirmAscension} onChange={(e) => block('gameplay', { confirmAscension: e.target.checked })} /></label>
            </div>
            <div className="settings-col">
              <h4>📣 Exibição</h4>
              <label className="setting-row"><span>Mostrar tutoriais</span><input type="checkbox" checked={g.showTutorials} onChange={(e) => block('gameplay', { showTutorials: e.target.checked })} /></label>
              <label className="setting-row"><span>Mostrar dicas</span><input type="checkbox" checked={g.showTips} onChange={(e) => block('gameplay', { showTips: e.target.checked })} /></label>
              <label className="setting-row"><span>Mostrar popups</span><input type="checkbox" checked={s.settings.showPopups} onChange={(e) => set({ showPopups: e.target.checked })} /></label>
              <label className="setting-row"><span>Mostrar novidades</span><input type="checkbox" checked={s.settings.showNews} onChange={(e) => set({ showNews: e.target.checked })} /></label>
            </div>
          </div>
        )}

        {tab === 'interface' && (
          <div className="settings-grid">
            <div className="settings-col">
              <h4>🎛️ Interface</h4>
              <label className="setting-row"><span>Escala da interface ({Math.round(iface.uiScale * 100)}%)</span><input type="range" min={80} max={130} value={iface.uiScale * 100} onChange={(e) => block('interface', { uiScale: Number(e.target.value) / 100 })} /></label>
              <label className="setting-row"><span>Tamanho da fonte ({Math.round(iface.fontScale * 100)}%)</span><input type="range" min={85} max={125} value={iface.fontScale * 100} onChange={(e) => block('interface', { fontScale: Number(e.target.value) / 100 })} /></label>
              <label className="setting-row"><span>Transparência dos painéis ({Math.round(iface.transparency * 100)}%)</span><input type="range" min={50} max={100} value={iface.transparency * 100} onChange={(e) => block('interface', { transparency: Number(e.target.value) / 100 })} /></label>
            </div>
            <div className="settings-col">
              <h4>🌗 Tema</h4>
              <div className="theme-picker">
                {([['default', '🌌 Ciano Cósmico'], ['neon', '🌃 Neon Roxo-Pink']] as [ThemeId, string][]).map(([id, label]) => (
                  <button
                    key={id}
                    className={`chip-btn ${s.settings.theme === id ? 'active' : ''}`}
                    onClick={() => { engine.updateSettings({ theme: id }); applyTheme(id); }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="muted small">O tema se aplica ao menu e ao jogo, e é lembrado na próxima sessão. Skins equipadas continuam tendo prioridade no visual do Núcleo.</p>
            </div>
            <div className="settings-col">
              <h4>✨ Efeitos de interface</h4>
              <label className="setting-row"><span>Animações</span><input type="checkbox" checked={iface.animations} onChange={(e) => block('interface', { animations: e.target.checked })} /></label>
              <label className="setting-row"><span>Transições</span><input type="checkbox" checked={iface.transitions} onChange={(e) => block('interface', { transitions: e.target.checked })} /></label>
              <label className="setting-row"><span>Brilho / glow</span><input type="checkbox" checked={iface.glowEffects} onChange={(e) => block('interface', { glowEffects: e.target.checked })} /></label>
              <label className="setting-row"><span>Desfoque de fundo ({Math.round(iface.blur * 100)}%)</span><input type="range" min={0} max={100} value={iface.blur * 100} onChange={(e) => block('interface', { blur: Number(e.target.value) / 100 })} /></label>
            </div>
          </div>
        )}

        {tab === 'graficos' && (
          <div className="settings-grid">
            <div className="settings-col">
              <h4>🖼️ Gráficos</h4>
              <label className="setting-row"><span>Números flutuantes</span><input type="checkbox" checked={s.settings.showFloatingNumbers} onChange={(e) => set({ showFloatingNumbers: e.target.checked })} /></label>
              <label className="setting-row"><span>Partículas</span><input type="checkbox" checked={s.settings.showParticles} onChange={(e) => set({ showParticles: e.target.checked })} /></label>
              <label className="setting-row"><span>Reduzir animações (geral)</span><input type="checkbox" checked={s.settings.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} /></label>
              <p className="muted small">Qualidade e FPS são gerenciados automaticamente pelo Electron (VSync nativo). Animações pesadas podem ser desligadas aqui.</p>
            </div>
          </div>
        )}

        {tab === 'audio' && (
          <div className="settings-grid">
            {AUDIO_CHANNELS.map((ch) => {
              const c = s.settings.audio[ch.id] ?? { enabled: true, volume: 0.5 };
              return (
                <div className="settings-col" key={ch.id}>
                  <h4>{ch.icon} {ch.name}</h4>
                  <label className="setting-row"><span>Ativo</span><input type="checkbox" checked={c.enabled} onChange={(e) => { engine.setAudioChannel(ch.id, { enabled: e.target.checked }); audio.updateVolumes(); }} /></label>
                  <label className="setting-row"><span>Volume ({Math.round(c.volume * 100)}%)</span><input type="range" min={0} max={100} value={c.volume * 100} onChange={(e) => { engine.setAudioChannel(ch.id, { volume: Number(e.target.value) / 100 }); audio.updateVolumes(); }} /></label>
                </div>
              );
            })}
            <div className="settings-col">
              <button className="btn" onClick={() => { audio.updateVolumes(); flash('Som atualizado'); }}>🔊 Testar som</button>
              <button className="btn" onClick={() => { for (const ch of AUDIO_CHANNELS) engine.setAudioChannel(ch.id, { enabled: false, volume: 0 }); audio.updateVolumes(); flash('Mudo ativado'); }}>🔇 Mudo</button>
              <button className="btn" onClick={restoreAudioDefaults}>↺ Restaurar padrões de áudio</button>
            </div>
          </div>
        )}

        {tab === 'gameplay' && (
          <div className="settings-grid">
            <div className="settings-col">
              <h4>🎮 Automação</h4>
              <label className="setting-row"><span>Abrir caixas automaticamente</span><input type="checkbox" checked={g.autoOpenBoxes} onChange={(e) => block('gameplay', { autoOpenBoxes: e.target.checked })} /></label>
              <label className="setting-row"><span>Pausar produção idle em segundo plano</span><input type="checkbox" checked={g.pauseIdle} onChange={(e) => block('gameplay', { pauseIdle: e.target.checked })} /></label>
              <p className="muted small">A produção passiva é sempre automática. Essas opções ligam/desligam automações reais que você já possui.</p>
            </div>
            <div className="settings-col">
              <h4>💾 Save</h4>
              <label className="setting-row"><span>Auto-save ativado</span><input type="checkbox" checked={s.settings.autoSaveEnabled} onChange={(e) => { set({ autoSaveEnabled: e.target.checked }); if (e.target.checked) void saveMgr.startAutoSave(engine, s.settings.autoSaveMinutes); else saveMgr.stopAutoSave(); }} /></label>
              <label className="setting-row"><span>Intervalo (min)</span><input type="number" min={1} max={60} value={s.settings.autoSaveMinutes} onChange={(e) => { set({ autoSaveMinutes: Math.max(1, Number(e.target.value) || 1) }); saveMgr.startAutoSave(engine, Math.max(1, Number(e.target.value) || 1)); }} /></label>
              <label className="setting-row"><span>Teto offline (h)</span><input type="number" min={1} max={168} value={s.settings.offlineCapHours} onChange={(e) => set({ offlineCapHours: Math.max(1, Number(e.target.value) || 1) })} /></label>
            </div>
          </div>
        )}

        {tab === 'notif' && (
          <div className="settings-grid">
            <div className="settings-col">
              <h4>🔔 Notificações</h4>
              {NOTIF_ITEMS.map((n) => (
                <label key={n.key} className="setting-row">
                  <span>{n.name}</span>
                  <input type="checkbox" checked={s.settings.notifications[n.key]} onChange={(e) => block('notifications', { [n.key]: e.target.checked } as any)} />
                </label>
              ))}
              <button className="btn" onClick={() => block('notifications', defaultNotificationPrefs())}>↺ Restaurar padrões</button>
            </div>
          </div>
        )}

        {tab === 'acess' && (
          <div className="settings-grid">
            <div className="settings-col">
              <h4>♿ Acessibilidade</h4>
              <label className="setting-row"><span>Reduzir animações</span><input type="checkbox" checked={s.settings.reducedMotion} onChange={(e) => set({ reducedMotion: e.target.checked })} /></label>
              <label className="setting-row"><span>Modo daltônico (realça cores)</span><input type="checkbox" checked={s.settings.colorblindMode} onChange={(e) => set({ colorblindMode: e.target.checked })} /></label>
              <label className="setting-row"><span>Escala da interface ({Math.round(iface.uiScale * 100)}%)</span><input type="range" min={80} max={130} value={iface.uiScale * 100} onChange={(e) => block('interface', { uiScale: Number(e.target.value) / 100 })} /></label>
              <label className="setting-row"><span>Tamanho da fonte ({Math.round(iface.fontScale * 100)}%)</span><input type="range" min={85} max={125} value={iface.fontScale * 100} onChange={(e) => block('interface', { fontScale: Number(e.target.value) / 100 })} /></label>
            </div>
            <div className="settings-col">
              <h4>🟢 Status do jogador</h4>
              <label className="setting-row"><span>Status atual</span>
                <select value={s.profile.status} onChange={(e) => engine.setStatus(e.target.value as any)}>
                  {STATUS_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
                </select>
              </label>
              <p className="muted small">O status do perfil respeita o escopo de privacidade escolhido — nada além do save (quando a sincronização automática está ativa) sai do seu computador.</p>
            </div>
          </div>
        )}

        {tab === 'privacidade' && (
          <div className="settings-grid">
            <div className="settings-col">
              <h4>🔒 Privacidade</h4>
              {PRIVACY_ITEMS.map((p) => (
                <label key={p.key} className="setting-row">
                  <span>{p.name}</span>
                  <select value={s.settings.privacy[p.key]} onChange={(e) => block('privacy', { [p.key]: e.target.value as PrivacyScope } as any)}>
                    {(Object.keys(PRIVACY_LABEL) as PrivacyScope[]).map((sc) => <option key={sc} value={sc}>{PRIVACY_LABEL[sc]}</option>)}
                  </select>
                </label>
              ))}
              <button className="btn" onClick={() => block('privacy', defaultPrivacyPrefs())}>↺ Restaurar padrões</button>
              <p className="muted small">Os escopos controlam o que aparece publicamente no perfil e no ranking. O save em si é sincronizado com a nuvem apenas para recuperação entre computadores — nunca é exibido a outros jogadores.</p>
            </div>
            <div className="settings-col">
              <h4>🎁 Conteúdo</h4>
              <label className="setting-row"><span>Revelar recompensas premium do passe</span><input type="checkbox" checked={s.settings.revealPremiumRewards} onChange={(e) => set({ revealPremiumRewards: e.target.checked })} /></label>
              <p className="muted small">Quando desligado, recompensas premium não adquiridas aparecem como “??? — Recompensa Premium”.</p>
            </div>
          </div>
        )}

        {tab === 'dados' && (
          <div className="settings-grid">
            <div className="settings-col">
              <h4>☁️ Save na nuvem</h4>
              <p className="muted small">
                Online por padrão: o save é enviado ao servidor automaticamente a cada auto-save e ao
                sair do jogo, e a versão mais recente é restaurada ao abrir. Recupere seu progresso em
                outro computador com o mesmo identificador.
              </p>
              <label className="setting-row">
                <span>Sincronização automática</span>
                <input type="checkbox" checked={s.settings.cloudSyncEnabled} onChange={(e) => set({ cloudSyncEnabled: e.target.checked })} />
              </label>
              <label className="setting-row">
                <span>Identificador do save</span>
                <code className="settings-text-input" style={{ fontSize: 12, padding: '6px 8px', userSelect: 'all' }}>{playerId || '—'}</code>
              </label>
              <div className="settings-actions">
                <button
                  className="btn btn-sm btn-primary"
                  disabled={cloudBusy || !online || playerId === 0}
                  onClick={async () => {
                    setCloudBusy(true);
                    const text = saveMgr.exportText(engine);
                    const r = await pushCloudSave(playerId, text, s.name || 'Jogador');
                    setCloudBusy(false);
                    flashCloud(r.ok ? `✅ Save enviado à nuvem (${new Date(r.savedAt ?? Date.now()).toLocaleTimeString('pt-BR')})` : `❌ ${r.reason ?? 'Falha'}`);
                  }}
                >
                  {cloudBusy ? 'Enviando…' : '📤 Enviar save para a nuvem'}
                </button>
                <button
                  className="btn btn-sm"
                  disabled={cloudBusy || !online || playerId === 0}
                  onClick={async () => {
                    setCloudBusy(true);
                    const r = await pullCloudSave(playerId);
                    setCloudBusy(false);
                    if (r.ok && r.info) {
                      setCloudInfo({ name: r.info.name, savedAt: r.info.savedAt });
                      setConfirmCloudPull(true);
                    } else {
                      flashCloud(`❌ ${r.reason ?? 'Falha'}`);
                    }
                  }}
                >
                  📥 Baixar save da nuvem
                </button>
              </div>
              {cloudInfo && confirmCloudPull && (
                <p className="muted small settings-ok">
                  Save na nuvem: <strong>{cloudInfo.name || 'Jogador'}</strong> · último envio {new Date(cloudInfo.savedAt).toLocaleString('pt-BR')}. Confirme para sobrescrever o slot atual.
                </p>
              )}
              {!online && <p className="muted small settings-err">⚪ Backend não configurado — configure a URL do servidor para usar a nuvem.</p>}
              {!s.settings.cloudSyncEnabled && <p className="muted small settings-err">🔴 Sincronização automática desativada — o save fica apenas neste computador (os botões abaixo continuam manuais).</p>}
              {cloudMsg && <p className={`muted small ${cloudMsg.startsWith('✅') ? 'settings-ok' : 'settings-err'}`}>{cloudMsg}</p>}
              <div className="cloud-status muted small">
                <span>🖥️ Servidor: <code>{serverUrl() || '—'}</code></span>
                {remoteGameVersion() && <span>📦 Conteúdo online: <strong>v{remoteGameVersion()}</strong></span>}
                <span>🕒 Última sincronização: {lastSyncAt() ? new Date(lastSyncAt()).toLocaleTimeString('pt-BR') : 'nunca'}</span>
              </div>
            </div>
            <div className="settings-col">
              <h4>💾 Save</h4>
              <button className="btn" onClick={() => { void saveMgr.save(engine).then((ok) => flash(ok ? 'Save salvo!' : 'Falha ao salvar')); }}>Salvar agora</button>
              <button className="btn" onClick={() => { void saveMgr.exportToFile(engine).then((r) => flash(r.ok ? 'Exportado!' : r.reason ?? 'Falha')); }}>Exportar save (.ncsave)</button>
              <button className="btn" onClick={() => { void saveMgr.importFromFile(engine ? saveMgr.getSlot() : 'slot1').then((r) => { flash(r.ok ? 'Importado! Recarregue o jogo.' : r.reason ?? 'Falha'); if (r.ok) onReload(); }); }}>Importar save (.ncsave)</button>
              <button className="btn" onClick={() => { void saveMgr.createBackup(engine).then((b) => flash(b ? `Backup criado: ${b}` : 'Falha ao criar backup')); }}>Criar backup</button>
              <button className="btn" onClick={() => { setShowBackups(!showBackups); void refreshBackups(); }}>Backups ({backups.length})</button>
              {showBackups && (
                <div className="backup-list">
                  {backups.length === 0 && <span className="muted small">Nenhum backup.</span>}
                  {backups.map((b) => (
                    <div key={b} className="backup-row">
                      <small>{b}</small>
                      <button className="btn btn-xs" onClick={() => { void saveMgr.restoreBackup(b).then((ok) => { flash(ok ? 'Backup restaurado! Recarregue.' : 'Falha'); if (ok) onReload(); }); }}>Restaurar</button>
                      <button className="btn btn-xs ghost" onClick={() => { void saveMgr.deleteBackup(b); void refreshBackups(); }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn" onClick={() => { void saveMgr.openDataDir(); }}>Abrir pasta de dados</button>
              <button className="btn btn-danger" onClick={() => setConfirmReset(true)}>Resetar save atual</button>
            </div>
            <div className="settings-col">
              <h4>🛡️ Integridade</h4>
              <p className="muted small">Saves são validados contra corrupção e alterações impossíveis. Valores inválidos são corrigidos e registrados — nunca bloqueamos o jogador por falso positivo.</p>
              {s.log.length > 0 && (
                <div className="history-list">
                  {[...s.log].reverse().slice(0, 8).map((l, i) => (
                    <div key={i} className="history-item"><strong>{l.code}</strong><span className="muted small">{l.msg}</span></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'pagamentos' && (
          <div className="settings-grid">
            <div className="settings-col">
              <h4>💳 Pix — servidor de pagamentos</h4>
              <p className="muted small">
                Configure a URL do backend Pix (Mercado Pago) sem recompilar — visível apenas no modo desenvolvedor. Com a URL preenchida, a Carteira passa a criar cobranças reais; vazio = modo simulado (nada é cobrado).
              </p>
              <label className="setting-row">
                <span>URL do backend Pix</span>
                <input
                  type="text"
                  className="settings-text-input"
                  value={pixUrl}
                  onChange={(e) => setPixUrl(e.target.value)}
                  placeholder="https://seu-projeto.up.railway.app"
                />
              </label>
              {pixUrl.trim() && !isPixBackendUrlValid(pixUrl) && (
                <p className="muted small settings-err">URL deve começar com http:// ou https://</p>
              )}
              <div className="settings-actions">
                <button
                  className="btn btn-sm btn-primary"
                  disabled={pixUrl.trim() !== '' && !isPixBackendUrlValid(pixUrl)}
                  onClick={() => { setPixBackendUrl(pixUrl); setPixUrl(pixBackendUrl()); setTestResult(null); flash(pixOnlineEnabled() ? '✅ Backend Pix configurado — Carteira agora cobra de verdade.' : '✅ Modo simulado (sem backend)'); }}
                >
                  Salvar URL
                </button>
                <button
                  className="btn btn-sm"
                  disabled={testing || !pixUrl.trim()}
                  onClick={async () => {
                    setTesting(true);
                    setTestResult(null);
                    const r = await testPixBackend(pixUrl);
                    setTesting(false);
                    setTestResult(r.ok
                      ? { ok: true, label: `✅ Conectado! Mercado Pago: ${r.mp ?? 'ok'}` }
                      : { ok: false, label: `❌ ${r.reason ?? 'Falha'}` });
                  }}
                >
                  {testing ? 'Testando…' : 'Testar conexão'}
                </button>
                <button
                  className="btn btn-sm ghost"
                  onClick={() => { clearPixBackendUrl(); setPixUrl(''); setTestResult(null); flash('↺ URL removida — modo simulado'); }}
                >
                  Limpar
                </button>
              </div>
              {testResult && (
                <p className={`muted small ${testResult.ok ? 'settings-ok' : 'settings-err'}`}>{testResult.label}</p>
              )}
              <p className="muted small">
                Status atual: <strong>{pixOnlineEnabled() ? '🟢 online (pagamentos reais)' : '⚪ simulado (nada é cobrado)'}</strong>
              </p>
              <p className="muted small">O access token do Mercado Pago fica apenas no servidor — nunca no jogo.</p>
            </div>
          </div>
        )}

        {tab === 'sistema' && (
          <div className="settings-grid">
            <div className="settings-col">
              <h4>🖥️ Sistema</h4>
              <label className="setting-row"><span>Modo desenvolvedor</span><input type="checkbox" checked={s.flags.debugMode === 1} onChange={(e) => setDebug(engine, e.target.checked)} /></label>
              <p className="muted small">Habilita o painel de Debug e o acesso ao Admin Control Center na barra lateral.</p>
              <label className="setting-row"><span>Mostrar novidades (banners)</span><input type="checkbox" checked={s.settings.showNews} onChange={(e) => set({ showNews: e.target.checked })} /></label>
            </div>
            <div className="settings-col">
              <h4>🔄 Atualizações</h4>
              <p className="muted small">
                O app se atualiza automaticamente quando você publica uma versão nova no GitHub Releases.
              </p>
              <label className="setting-row"><span>Versão instalada</span><strong>{appVersion || GAME_VERSION}</strong></label>
              {updState === 'downloading' ? (
                <div className="upd-progress">
                  <div className="upd-progress-bar" style={{ width: `${updPercent}%` }} />
                  <span className="muted small">{updPercent}% baixado…</span>
                </div>
              ) : (
                <div className="settings-actions">
                  <button
                    className="btn btn-sm"
                    disabled={updState === 'checking' || !window.api?.updater}
                    onClick={async () => {
                      setUpdMsg('');
                      setUpdState('checking');
                      const r = await window.api!.updater.check();
                      if (!r.ok) {
                        setUpdState('error');
                        setUpdMsg(r.reason ?? 'Falha ao verificar');
                      } else if (!r.updateAvailable) {
                        setUpdState('not-available');
                        setUpdMsg('Você já está na versão mais recente ✅');
                      } else {
                        setUpdState('available');
                        setUpdMsg(`Nova versão disponível: v${r.version}`);
                      }
                    }}
                  >
                    {updState === 'checking' ? 'Verificando…' : 'Verificar atualizações'}
                  </button>
                  {(updState === 'available' || updState === 'error') && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={async () => {
                        setUpdState('downloading');
                        setUpdPercent(0);
                        setUpdMsg('Baixando…');
                        const r = await window.api!.updater.download();
                        if (!r.ok) {
                          setUpdState('error');
                          setUpdMsg(r.reason ?? 'Falha ao baixar');
                        }
                      }}
                    >
                      Baixar atualização
                    </button>
                  )}
                  {updState === 'downloaded' && (
                    <button className="btn btn-sm btn-primary" onClick={() => void window.api!.updater.install()}>
                      Instalar e reiniciar
                    </button>
                  )}
                </div>
              )}
              {updMsg && <p className={`muted small ${updState === 'error' ? 'settings-err' : 'settings-ok'}`}>{updMsg}</p>}
            </div>
          </div>
        )}

        {saveMsg && <div className="menu-toast">{saveMsg}</div>}
      </Panel>

      <ConfirmModal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => { setDebug(engine, false); onBackToMenu(); }}
        title="Resetar save atual"
        desc="Isso apaga TODO o progresso deste slot. Tem certeza?"
        confirmLabel="Apagar tudo"
        danger
      />

      <ConfirmModal
        open={confirmCloudPull}
        onClose={() => setConfirmCloudPull(false)}
        onConfirm={() => {
          setConfirmCloudPull(false);
          void (async () => {
            const r = await pullCloudSave(playerId);
            if (!r.ok || !r.info) {
              flashCloud(`❌ ${r.reason ?? 'Falha ao baixar'}`);
              return;
            }
            const imp = await saveMgr.importText(saveMgr.getSlot(), r.info.saveText);
            if (imp.ok) {
              flashCloud('✅ Save baixado da nuvem! Recarregando…');
              setTimeout(onReload, 600);
            } else {
              flashCloud(`❌ ${imp.reason ?? 'Save da nuvem inválido'}`);
            }
          })();
        }}
        title="Baixar save da nuvem"
        desc="Isso SOBRESCREVE o save atual deste slot com a versão da nuvem. Tem certeza?"
        confirmLabel="Sobrescrever e carregar"
      />


    </div>
  );
}
