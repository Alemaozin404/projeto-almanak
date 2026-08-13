/**
 * Conta — tela do sistema de contas.
 *
 * Fluxos:
 * - Registro: nome de usuário + e-mail Gmail + senha → envia código de
 *   confirmação → verificação → e-mail de agradecimento → login automático.
 * - Login: usuário/e-mail + senha → sessão local. Conta não confirmada cai
 *   direto na verificação.
 * - Recuperação: e-mail → código de recuperação → nova senha.
 * - Conectado: o save é enviado ao servidor automaticamente a cada 1 hora;
 *   botões manuais de enviar/baixar completam a sincronização.
 *
 * Funciona no menu principal (engine = null — sem sincronização) e dentro do
 * jogo (engine presente — sync habilitado).
 */
import { useEffect, useSyncExternalStore, useState } from 'react';
import type { GameEngine } from '../../game/engine';
import { SAVE_SLOTS, type SaveManager, type SaveSlot } from '../../save/saveManager';
import {
  getSession, setSession, clearSession,
  registerAccount, verifyAccount, resendVerification, loginAccount, logoutAccount,
  requestRecovery, resetPassword, changePassword, fetchAccountMe,
  pullAccountSave, getAccountSlotPref, setAccountSlotPref, linkAccountSlot,
  type AccountInfo, type AccountSession,
} from '../../online/account';
import { pushAccountSaveNow, checkAccountRestore, applyAccountRestore, subscribeAccountSync, getAccountSyncSnapshot, type AccountRestoreInfo } from '../../online/accountSync';
import { onlineEnabled } from '../../online/api';
import { Panel, ConfirmModal } from '../kit';

interface Props {
  saveMgr: SaveManager;
  engine: GameEngine | null;
  onReload?: () => void;
  /** Volta ao menu principal (usado quando a conta nova não tem save e não veio do guest). */
  onBackToMenu?: () => void;
}

type View = 'login' | 'register' | 'recover' | 'verify';

const GMAIL_RE = /@gmail\.com$/i;

function formatWhen(ts: number): string {
  if (!ts) return 'nunca';
  return new Date(ts).toLocaleString('pt-BR');
}

export function Account({ saveMgr, engine, onReload, onBackToMenu }: Props) {
  const [view, setView] = useState<View>('login');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [session, setSessionState] = useState<AccountSession | null>(() => getSession());
  const [info, setInfo] = useState<AccountInfo | null>(null);

  // campos de formulário
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [devCode, setDevCode] = useState('');
  const [verifySentAt, setVerifySentAt] = useState<string | null>(null);
  const [recoverSentAt, setRecoverSentAt] = useState<string | null>(null);
  // troca de senha (logado)
  const [changeCurrent, setChangeCurrent] = useState('');
  const [changeNew, setChangeNew] = useState('');
  const [changeNew2, setChangeNew2] = useState('');
  // credenciais da tela que originou a verificação (login automático pós-confirmação)
  const [pendingLogin, setPendingLogin] = useState<{ login: string; password: string } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [restoreInfo, setRestoreInfo] = useState<{ name: string; savedAt: number } | null>(null);
  // restauração automática pós-login aguardando confirmação do jogador
  const [pendingAutoRestore, setPendingAutoRestore] = useState<AccountRestoreInfo | null>(null);
  // estado de sincronização EM TEMPO REAL (mesmo store da TopBar): enviando agora, último erro, última sync
  const sync = useSyncExternalStore(subscribeAccountSync, getAccountSyncSnapshot);
  // slot escolhido para vincular o save da conta ('' = automático → slot do jogo atual)
  const [slotPref, setSlotPrefState] = useState<SaveSlot | ''>(() => getAccountSlotPref());

  const online = onlineEnabled();

  function flash(kind: 'ok' | 'err', text: string) {
    setMsg({ kind, text });
  }

  function go(v: View) {
    setView(v);
    setMsg(null);
  }

  // sessão local existente → valida no servidor e atualiza os dados
  useEffect(() => {
    let alive = true;
    if (!session) {
      setInfo(null);
      return;
    }
    void fetchAccountMe(session.token).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setInfo({ ...r, username: r.username || session.username, email: r.email || session.email });
        // máquina nova (sem preferência local) → herda o slot vinculado no servidor,
        // evitando que o próximo envio re-vincule o save da conta ao slot local por acidente
        if (!getAccountSlotPref() && r.saveSlot) {
          setAccountSlotPref(r.saveSlot as SaveSlot);
          setSlotPrefState(r.saveSlot as SaveSlot);
        }
      } else if (r.status === 401) {
        // sessão morta no servidor → remove a sessão local
        clearSession();
        setSessionState(null);
        setInfo(null);
      } else {
        // servidor fora do ar — mantém a sessão local, sem dados frescos
        setInfo({ username: session.username, email: session.email, verified: session.verified });
      }
    });
    return () => { alive = false; };
  }, [session]);


  // ── registro ───────────────────────────────────────────────
  async function handleRegister() {
    setBusy(true);
    setMsg(null);
    if (username.trim().length < 3) { flash('err', 'Escolha um nome de usuário (mín. 3 caracteres).'); setBusy(false); return; }
    if (!GMAIL_RE.test(email.trim())) { flash('err', 'Use um e-mail @gmail.com para receber os códigos e o agradecimento.'); setBusy(false); return; }
    if (password.length < 8) { flash('err', 'A senha deve ter pelo menos 8 caracteres.'); setBusy(false); return; }
    if (password !== password2) { flash('err', 'As senhas não conferem.'); setBusy(false); return; }
    const r = await registerAccount({ username: username.trim(), email: email.trim(), password });
    setBusy(false);
    if (!r.ok) { flash('err', r.reason); return; }
    setPendingLogin({ login: username.trim(), password });
    setDevCode(r.devCode ?? '');
    setVerifySentAt(email.trim());
    go('verify');
  }

  // ── verificação (código de confirmação) ────────────────────
  async function handleVerify() {
    setBusy(true);
    setMsg(null);
    const r = await verifyAccount(email, code.trim());
    setBusy(false);
    if (!r.ok) { flash('err', r.reason); return; }
    if (pendingLogin) {
      // confirmação concluída → login automático (e-mail de agradecimento enviado)
      const l = await loginAccount(pendingLogin.login, pendingLogin.password);
      setPendingLogin(null);
      setDevCode('');
      setVerifySentAt(null);
      if (l.ok) {
        const s: AccountSession = { username: l.username, email: l.email, verified: true, token: l.token };
        setSession(s);
        setSessionState(s);
        setInfo({ username: l.username, email: l.email, verified: true, hasSave: l.hasSave, saveName: l.saveName, saveSavedAt: l.saveSavedAt, saveSlot: l.saveSlot });
        setPassword('');
        setPassword2('');
        flash('ok', 'Conta confirmada! 💛 E-mail de agradecimento enviado. Bem-vindo(a), ' + l.username + '!');
        setView('login');
        // só migra o save guest quando NÃO havia outra conta conectada antes
        // (primeira conta criada para guardar o progresso) — vindo de outra
        // conta, o mundo novo começa do zero
        const hadSession = !!getSession();
        void autoRestoreOnLogin(!hadSession);
        return;
      }
      flash('ok', 'Conta confirmada! 💛 E-mail de agradecimento enviado. Agora entre com sua senha.');
      go('login');
      return;
    }
    flash('ok', 'Conta confirmada! 💛 E-mail de agradecimento enviado. Agora entre com sua senha.');
    setDevCode('');
    setVerifySentAt(null);
    go('login');
  }

  async function handleResend() {
    setBusy(true);
    setMsg(null);
    const r = await resendVerification(email);
    setBusy(false);
    if (!r.ok) { flash('err', r.reason); return; }
    setDevCode(r.devCode ?? '');
    flash('ok', 'Novo código enviado para ' + email + '.');
  }

  /**
   * Após logar: recarrega o jogo com o MUNDO DA CONTA logada. Cada conta tem
   * seus próprios slots locais (SaveManager com escopo por username) — então:
   *   1. se a conta já tem save local nesta máquina → carrega ele;
   *   2. senão, se tem save no servidor → restaura (outro dispositivo);
   *   3. senão → mundo ZERADO (conta nova): migra o save guest apenas se o
   *      jogador veio do modo sem conta (primeira conta criada para guardar o
   *      progresso); vindo de OUTRA conta, começa do zero (nada é herdado).
   */
  async function autoRestoreOnLogin(fromGuest: boolean) {
    // sem jogo aberto (menu): o MainMenu lista os slots da conta — nada a fazer
    if (!engine || !onReload) return;
    const slot = saveMgr.getSlot();
    // 1. save local da conta nesta máquina (escopo já trocado em applyAccountSwitch)
    const local = await saveMgr.load(slot);
    if (local) {
      onReload();
      return;
    }
    // 2. save da conta no servidor (máquina nova / outro dispositivo)
    const session = getSession();
    if (session) {
      const cloud = await pullAccountSave(session.token);
      if (cloud.ok && cloud.info) {
        const imp = await saveMgr.importText(slot, cloud.info.saveText);
        if (imp.ok) {
          onReload();
          return;
        }
      }
    }
    // 3. conta nova sem nenhum save — só o guest (modo sem conta) migra para
    //    ela, para quem criou a primeira conta não perder o progresso.
    if (fromGuest) {
      await pushAccountSaveNow(engine, saveMgr);
      onReload();
      return;
    }
    // vindo de OUTRA conta → mundo zerado: volta ao menu para criar um novo jogo
    onBackToMenu?.();
  }

  async function handleConfirmAutoRestore() {
    if (!pendingAutoRestore || !engine) return;
    const info = pendingAutoRestore;
    setPendingAutoRestore(null);
    setBusy(true);
    const ok = await applyAccountRestore(saveMgr, engine, info);
    setBusy(false);
    if (ok) {
      flash('ok', 'Save da conta restaurado! Recarregando…');
      setTimeout(() => onReload?.(), 600);
    } else {
      flash('err', 'Falha ao restaurar o save da conta.');
    }
  }

  // ── login ──────────────────────────────────────────────────
  async function handleLogin() {
    setBusy(true);
    setMsg(null);
    const login = username.trim() || email.trim();
    if (!login || !password) { flash('err', 'Informe usuário (ou e-mail) e senha.'); setBusy(false); return; }
    const r = await loginAccount(login, password);
    setBusy(false);
    if (!r.ok) { flash('err', r.reason); return; }
    if (!r.verified) {
      // conta não confirmada → pede o código antes de entrar
      setPendingLogin({ login, password });
      setEmail(r.email || email.trim());
      setVerifySentAt(r.email || email.trim());
      setDevCode('');
      go('verify');
      return;
    }
    const s: AccountSession = { username: r.username, email: r.email, verified: true, token: r.token };
    // fromGuest = true só quando não havia outra conta conectada (modo sem
    // conta) — ao trocar de conta (Willzinn → CEO), o mundo do CEO começa
    // zerado e nada do Willzinn migra para ele
    const hadSession = !!getSession();
    await applyAccountSwitch(s, r, !hadSession);
  }

  /**
   * Aplica a troca de conta: salva o mundo atual no escopo ANTIGO (guest ou
   * outra conta), troca o escopo do SaveManager para a conta logada e recarrega
   * o jogo — cada conta tem seu próprio mundo (slots locais particionados + save
   * no servidor). Tudo do usuário (progresso, amigos, presentes) pertence à conta.
   * `fromGuest` = não havia outra conta conectada antes (primeira conta).
   */
  async function applyAccountSwitch(s: AccountSession, info: { hasSave?: boolean; saveName?: string; saveSavedAt?: number; saveSlot?: string; username: string; email: string; verified: boolean }, fromGuest = false) {
    // 1. persiste o mundo atual no escopo atual (guest ou outra conta) antes de trocar
    if (engine) await saveMgr.save(engine);
    // 2. troca a sessão e o escopo do save local
    setSession(s);
    setSessionState(s);
    saveMgr.setAccountScope(s.username);
    setInfo({ username: info.username || s.username, email: info.email || s.email, verified: info.verified === true, hasSave: info.hasSave === true, saveName: info.saveName ?? '', saveSavedAt: info.saveSavedAt ?? 0, saveSlot: info.saveSlot ?? '' });
    setPassword('');
    setPassword2('');
    setView('login');
    flash('ok', 'Login realizado! Bem-vindo(a), ' + s.username + '!');
    // 3. recarrega o jogo com o mundo DA conta logada (slot particionado dela)
    void autoRestoreOnLogin(fromGuest);
  }

  async function handleLogout() {
    // 1. persiste o mundo da conta no escopo dela (para voltar depois)
    if (engine) await saveMgr.save(engine);
    const s = getSession();
    if (s) await logoutAccount(s.token);
    clearSession();
    // 2. volta para o modo sem conta (guest) — o mundo guest fica intacto
    saveMgr.setAccountScope(null);
    setSessionState(null);
    setInfo(null);
    setPendingLogin(null);
    setPendingAutoRestore(null); // modal de restauração não pode sobreviver ao logout
    setPassword('');
    setPassword2('');
    setNewPassword('');
    setNewPassword2('');
    setCode('');
    setDevCode('');
    setChangeCurrent('');
    setChangeNew('');
    setChangeNew2('');
    go('login');
    flash('ok', 'Você saiu da conta. O mundo da conta ficou guardado — volte quando quiser.');
    // 3. recarrega com o mundo GUEST (slot local sem conta): se o guest não tem
    //    save, volta ao menu para o jogador escolher novo jogo/importar
    const guestHasSave = (await saveMgr.listSlots()).some((m) => m.exists);
    if (engine && onReload && guestHasSave) onReload();
    else onBackToMenu?.();
  }

  // ── recuperação de senha ───────────────────────────────────
  async function handleRecover() {
    setBusy(true);
    setMsg(null);
    if (!GMAIL_RE.test(email.trim())) { flash('err', 'Informe o e-mail @gmail.com cadastrado.'); setBusy(false); return; }
    const r = await requestRecovery(email.trim());
    setBusy(false);
    if (!r.ok) { flash('err', r.reason); return; }
    setDevCode(r.devCode ?? '');
    setRecoverSentAt(email.trim());
    flash('ok', 'Se existir conta com este e-mail, o código de recuperação foi enviado.');
  }

  async function handleReset() {
    setBusy(true);
    setMsg(null);
    if (newPassword.length < 8) { flash('err', 'A nova senha deve ter pelo menos 8 caracteres.'); setBusy(false); return; }
    if (newPassword !== newPassword2) { flash('err', 'As senhas não conferem.'); setBusy(false); return; }
    const r = await resetPassword(email.trim(), code.trim(), newPassword);
    setBusy(false);
    if (!r.ok) { flash('err', r.reason); return; }
    setRecoverSentAt(null);
    setCode('');
    setNewPassword('');
    setNewPassword2('');
    go('login');
    flash('ok', 'Senha redefinida! Entre com a nova senha.');
  }

  // ── troca de senha (logado) ────────────────────────────────
  async function handleChangePassword() {
    if (!session) return;
    setBusy(true);
    setMsg(null);
    if (changeNew.length < 8) { flash('err', 'A nova senha deve ter pelo menos 8 caracteres.'); setBusy(false); return; }
    if (changeNew !== changeNew2) { flash('err', 'As senhas não conferem.'); setBusy(false); return; }
    const r = await changePassword(session.token, changeCurrent, changeNew);
    setBusy(false);
    if (!r.ok) { flash('err', r.reason); return; }
    setChangeCurrent('');
    setChangeNew('');
    setChangeNew2('');
    flash('ok', 'Senha alterada com sucesso! 🔒');
  }

  // ── slot de vínculo do save da conta ───────────────────────
  async function handleLinkSlot(slot: SaveSlot | '') {
    if (!session) return;
    setBusy(true);
    setMsg(null);
    const r = await linkAccountSlot(session.token, slot);
    setBusy(false);
    if (!r.ok) {
      flash('err', r.reason);
      return; // mantém a escolha anterior (o servidor não mudou)
    }
    // só persiste a escolha depois de o servidor aceitar
    setSlotPrefState(slot);
    setAccountSlotPref(slot);
    // se havia save guardado, o servidor re-vinculou — reflete no estado local
    setInfo((prev) => (prev && prev.hasSave ? { ...prev, saveSlot: slot } : prev));
    flash('ok', slot ? `Save da conta vinculado ao ${slot.toUpperCase()}.` : 'Vínculo automático — o save segue o slot do jogo atual.');
  }

  // ── sincronização do save ──────────────────────────────────
  async function handlePushSave() {
    if (!engine) return;
    setBusy(true);
    setMsg(null);
    const r = await pushAccountSaveNow(engine, saveMgr);
    setBusy(false);
    if (r.ok) flash('ok', 'Save enviado para a conta! ✅');
    else flash('err', r.reason ?? 'Falha ao enviar');
  }

  async function handlePullSave() {
    if (!session) return;
    setBusy(true);
    setMsg(null);
    const r = await pullAccountSave(session.token);
    setBusy(false);
    if (!r.ok) { flash('err', r.reason); return; }
    setRestoreInfo({ name: r.info.name, savedAt: r.info.savedAt });
    setConfirmRestore(true);
  }

  // ── render ─────────────────────────────────────────────────
  const loggedIn = session !== null;

  return (
    <div className="screen">
      <Panel title="Conta" icon="👤">
        {!online && !loggedIn && (
          <p className="muted small settings-err">⚪ Backend não configurado — configure a URL do servidor para usar contas.</p>
        )}

        {loggedIn ? (
          <div className="account-grid">
            <div className="settings-col">
              <div className="account-card">
                <span className="account-avatar">👤</span>
                <div>
                  <strong>{info?.username ?? session.username}</strong>
                  <div className="muted small">{session.email}</div>
                  <span className={`account-badge ${session.verified ? 'ok' : 'warn'}`}>
                    {session.verified ? '✅ Confirmada' : '⚠️ E-mail não confirmado'}
                  </span>
                </div>
              </div>

              <h4>☁️ Save automático no servidor</h4>
              <p className="muted small">
                Com a conta conectada, o jogo envia seus dados automaticamente ao servidor a cada 1 hora.
                Você também pode sincronizar na hora:
              </p>
              <div className="settings-actions">
                <button
                  className="btn btn-sm btn-primary"
                  disabled={busy || !engine || !online}
                  onClick={() => void handlePushSave()}
                  title={engine ? 'Enviar o save atual para a conta' : 'Abra um jogo para sincronizar'}
                >
                  {busy ? 'Enviando…' : '📤 Enviar save agora'}
                </button>
                <button
                  className="btn btn-sm"
                  disabled={busy || !engine || !online}
                  onClick={() => void handlePullSave()}
                  title={engine ? 'Baixar o save guardado na conta' : 'Abra um jogo para sincronizar'}
                >
                  📥 Baixar save da conta
                </button>
              </div>
              {!engine && <p className="muted small settings-err">💡 Abra um jogo (Continuar) para sincronizar o save.</p>}
              {engine && engine.state.settings.cloudSyncEnabled === false && (
                <p className="muted small settings-err">🔴 Sincronização automática desativada nas Configurações — o envio automático de 1h está pausado (os botões acima continuam manuais).</p>
              )}
              <div className="account-sync-live">
                {sync.syncing && (
                  <p className="muted small account-sync-live-on"><span className="account-sync-spin">↻</span> Sincronizando o save com a conta…</p>
                )}
                {!sync.syncing && sync.lastError && (
                  <p className="muted small settings-err">⚠️ Último envio falhou: {sync.lastError}</p>
                )}
                <p className="muted small">🕒 Última sincronização: {sync.lastSyncAt ? formatWhen(sync.lastSyncAt) : 'ainda não'}</p>
              </div>

              <h4>🎯 Slot de vínculo do save</h4>
              <p className="muted small">
                Escolha a qual slot o save da conta fica vinculado — a restauração automática
                no login só acontece no slot escolhido.
              </p>
              <div className="slot-filter">
                <button
                  className={`chip-btn ${slotPref === '' ? 'active' : ''}`}
                  disabled={busy || !online}
                  onClick={() => void handleLinkSlot('')}
                  title="Usar o slot do jogo aberto no momento do envio"
                >
                  AUTO
                </button>
                {SAVE_SLOTS.map((s) => (
                  <button
                    key={s}
                    className={`chip-btn ${slotPref === s ? 'active' : ''}`}
                    disabled={busy || !online}
                    onClick={() => void handleLinkSlot(s)}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
              {slotPref === '' && <p className="muted small">🔀 Automático: o save da conta segue o slot do jogo que você abrir.</p>}
              {info?.hasSave && info.saveSlot && (
                <p className="muted small settings-ok">🔗 Save guardado na conta vinculado ao <strong>{info.saveSlot.toUpperCase()}</strong>.</p>
              )}
              {info?.hasSave && info.saveSavedAt ? (
                <p className="muted small settings-ok">
                  💾 Há um save guardado na conta — enviado em {formatWhen(info.saveSavedAt)}
                  {info.saveName ? ` (${info.saveName})` : ''}. Use “Baixar save da conta” para restaurá-lo.
                </p>
              ) : (
                <p className="muted small">💾 Nenhum save guardado na conta ainda — o próximo envio automático cria o primeiro backup.</p>
              )}
              {!online && <p className="muted small settings-err">⚪ Backend não configurado — o save automático fica pausado.</p>}
            </div>

            <div className="settings-col">
              <h4>🔐 Segurança</h4>
              <label className="setting-row"><span>Senha atual</span>
                <input className="settings-text-input" type="password" value={changeCurrent} onChange={(e) => setChangeCurrent(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
              </label>
              <label className="setting-row"><span>Nova senha</span>
                <input className="settings-text-input" type="password" value={changeNew} onChange={(e) => setChangeNew(e.target.value)} placeholder="mín. 8 caracteres" autoComplete="new-password" />
              </label>
              <label className="setting-row"><span>Confirmar nova senha</span>
                <input className="settings-text-input" type="password" value={changeNew2} onChange={(e) => setChangeNew2(e.target.value)} placeholder="repita a senha" autoComplete="new-password" />
              </label>
              <div className="settings-actions">
                <button
                  className="btn btn-sm btn-primary"
                  disabled={busy || !online}
                  onClick={() => void handleChangePassword()}
                >
                  {busy ? 'Alterando…' : '🔒 Trocar senha'}
                </button>
              </div>
              <button className="btn btn-sm ghost" onClick={() => void handleLogout()}>🚪 Sair da conta</button>
              <p className="muted small">Trocar a senha derruba as outras sessões da conta (esta continua logada). A senha é armazenada apenas como hash seguro no servidor.</p>
            </div>
          </div>
        ) : view === 'login' ? (
          <div className="account-form">
            <h4>🔑 Entrar</h4>
            <label className="setting-row"><span>Usuário ou e-mail</span>
              <input className="settings-text-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="nome_de_usuario" autoComplete="username" />
            </label>
            <label className="setting-row"><span>Senha</span>
              <input className="settings-text-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
            </label>
            <div className="settings-actions">
              <button className="btn btn-primary" disabled={busy || !online} onClick={() => void handleLogin()}>
                {busy ? 'Entrando…' : 'Entrar'}
              </button>
            </div>
            <div className="account-links">
              <button className="btn btn-sm ghost" onClick={() => { setPendingLogin(null); setDevCode(''); setVerifySentAt(null); go('register'); }}>Criar conta</button>
              <button className="btn btn-sm ghost" onClick={() => { setDevCode(''); setRecoverSentAt(null); go('recover'); }}>Esqueci a senha</button>
            </div>
          </div>
        ) : view === 'register' ? (
          <div className="account-form">
            <h4>📝 Criar conta</h4>
            <label className="setting-row"><span>Nome de usuário</span>
              <input className="settings-text-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="3 a 20 caracteres" autoComplete="username" />
            </label>
            <label className="setting-row"><span>E-mail (Gmail)</span>
              <input className="settings-text-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@gmail.com" autoComplete="email" />
            </label>
            <label className="setting-row"><span>Senha</span>
              <input className="settings-text-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mín. 8 caracteres" autoComplete="new-password" />
            </label>
            <label className="setting-row"><span>Confirmar senha</span>
              <input className="settings-text-input" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="repita a senha" autoComplete="new-password" />
            </label>
            <div className="settings-actions">
              <button className="btn btn-primary" disabled={busy || !online} onClick={() => void handleRegister()}>
                {busy ? 'Criando…' : 'Criar conta'}
              </button>
              <button className="btn btn-sm ghost" onClick={() => go('login')}>← Voltar</button>
            </div>
            <p className="muted small">Ao criar a conta, enviaremos um código de confirmação para o seu Gmail. Depois de confirmar, você recebe um e-mail de agradecimento. 🎁</p>
          </div>
        ) : view === 'recover' ? (
          <div className="account-form">
            <h4>🔑 Recuperar senha</h4>
            {!recoverSentAt ? (
              <>
                <label className="setting-row"><span>E-mail (Gmail) cadastrado</span>
                  <input className="settings-text-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@gmail.com" autoComplete="email" />
                </label>
                <div className="settings-actions">
                  <button className="btn btn-primary" disabled={busy || !online} onClick={() => void handleRecover()}>
                    {busy ? 'Enviando…' : 'Enviar código de recuperação'}
                  </button>
                  <button className="btn btn-sm ghost" onClick={() => go('login')}>← Voltar</button>
                </div>
              </>
            ) : (
              <>
                <p className="muted small settings-ok">🔑 Código de recuperação enviado para {recoverSentAt}. Ele expira em 15 minutos.</p>
                <label className="setting-row"><span>Código de recuperação</span>
                  <input className="settings-text-input code-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" inputMode="numeric" maxLength={6} />
                </label>
                <label className="setting-row"><span>Nova senha</span>
                  <input className="settings-text-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="mín. 8 caracteres" autoComplete="new-password" />
                </label>
                <label className="setting-row"><span>Confirmar nova senha</span>
                  <input className="settings-text-input" type="password" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} placeholder="repita a senha" autoComplete="new-password" />
                </label>
                <div className="settings-actions">
                  <button className="btn btn-primary" disabled={busy || !online} onClick={() => void handleReset()}>
                    {busy ? 'Redefinindo…' : 'Redefinir senha'}
                  </button>
                  <button className="btn btn-sm ghost" onClick={() => { setRecoverSentAt(null); go('login'); }}>← Voltar</button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="account-form">
            <h4>🔐 Confirmar e-mail</h4>
            <p className="muted small">
              {verifySentAt
                ? <>Enviamos um código de confirmação para <strong>{verifySentAt}</strong>. Digite-o abaixo para ativar sua conta.</>
                : 'Digite o código de confirmação enviado para o seu e-mail.'}
            </p>
            <label className="setting-row"><span>E-mail</span>
              <input className="settings-text-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@gmail.com" autoComplete="email" />
            </label>
            <label className="setting-row"><span>Código de confirmação</span>
              <input className="settings-text-input code-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="000000" inputMode="numeric" maxLength={6} />
            </label>
            {devCode && (
              <p className="muted small settings-ok">🧪 Modo desenvolvedor (sem Gmail configurado no servidor): código <strong>{devCode}</strong></p>
            )}
            <div className="settings-actions">
              <button className="btn btn-primary" disabled={busy || !online} onClick={() => void handleVerify()}>
                {busy ? 'Confirmando…' : 'Confirmar conta'}
              </button>
              <button className="btn btn-sm" disabled={busy} onClick={() => void handleResend()}>Reenviar código</button>
              <button className="btn btn-sm ghost" onClick={() => { setPendingLogin(null); go('login'); }}>← Voltar</button>
            </div>
            <p className="muted small">Ao confirmar, você recebe um e-mail de agradecimento. 💛</p>
          </div>
        )}

        {msg && <p className={`muted small ${msg.kind === 'ok' ? 'settings-ok' : 'settings-err'}`}>{msg.text}</p>}
      </Panel>

      <ConfirmModal
        open={pendingAutoRestore !== null}
        onClose={() => setPendingAutoRestore(null)}
        onConfirm={() => void handleConfirmAutoRestore()}
        title="Restaurar save da conta?"
        desc={
          pendingAutoRestore
            ? `O save da conta (${pendingAutoRestore.name}, salvo em ${formatWhen(pendingAutoRestore.savedAt)}) é mais novo que o save local deste slot (${pendingAutoRestore.localSavedAt ? formatWhen(pendingAutoRestore.localSavedAt) : 'sem save local'}). Um backup do save local é criado antes de restaurar. Deseja continuar?`
            : ''
        }
        confirmLabel="Restaurar e recarregar"
      />

      <ConfirmModal
        open={confirmRestore}
        onClose={() => setConfirmRestore(false)}
        onConfirm={() => {
          setConfirmRestore(false);
          void (async () => {
            if (!session) return;
            const r = await pullAccountSave(session.token);
            if (!r.ok) { flash('err', r.reason); return; }
            // paridade com a restauração automática (applyAccountRestore): backup
            // do save local ANTES de sobrescrever — o modal promete isso e o
            // download manual não pode ser a exceção (o botão exige engine)
            if (engine) await saveMgr.createBackup(engine);
            const imp = await saveMgr.importText(saveMgr.getSlot(), r.info.saveText);
            if (imp.ok) {
              flash('ok', 'Save da conta restaurado! Recarregando…');
              onReload?.();
            } else {
              flash('err', imp.reason ?? 'Save da conta inválido');
            }
          })();
        }}
        title="Baixar save da conta"
        desc={
          restoreInfo
            ? `Isso SOBRESCREVE o save atual deste slot com o save da conta (enviado em ${formatWhen(restoreInfo.savedAt)}${restoreInfo.name ? ` — ${restoreInfo.name}` : ''}). Tem certeza?`
            : 'Isso SOBRESCREVE o save atual deste slot com o save da conta. Tem certeza?'
        }
        confirmLabel="Sobrescrever e carregar"
      />
    </div>
  );
}
