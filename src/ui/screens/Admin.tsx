import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../context';
import { Panel, TabBar, Modal } from '../kit';
import { setupAdminPin, loginAdmin, logoutAdmin, isAdminLoggedIn, hasAdminPin } from '../../admin/auth';
import { audit, securityLog, auditLog, securityLogEntries, clearAuditLogs, formatAudit, type AuditEntry } from '../../admin/audit';
import { roleHas, ROLE_LABELS, type Permission } from '../../admin/permissions';
import { loadContent, saveDraft, publishContent, deleteContent, autoBackup, backupList, restoreBackup, lastBackupTime, validateContent, type AdminContent, type ContentKind, type ContentStatus } from '../../admin/content';
import { loadPacks, savePack, deletePack, togglePack, fetchServerPacks, publishPackToServer, deletePackFromServer, validatePack, packIdFromName, testPack, pixTestEnabled, type AdminPack } from '../../admin/sales';
import { GAME_VERSION } from '../../content/updates';
import { activeSeason } from '../../content/seasons';
import { GAME_PASS_LEVELS } from '../../pass/GamePass';
import { EventManager } from '../../liveops/EventManager';
import { SKINS } from '../../content/skins';
import { audio } from '../../audio/audio';
import { D } from '../../core/bignum';
import { fmtBRL } from '../../shop/packs';
import { GameConfig } from '../../config/GameConfig';
import { testPixBackend } from '../../wallet/mp';
import { fetchOnlinePlayers, type OnlinePlayer } from '../../online/api';

const STATUS_FLOW: ContentStatus[] = ['DRAFT', 'REVIEW', 'SCHEDULED', 'PUBLISHED', 'DISABLED', 'ARCHIVED'];

function endingSoonCount(): number {
  return EventManager.all().filter((e) => EventManager.status(e) === 'ending_soon').length;
}

export function Admin() {
  const { engine } = useGame();
  const [authed, setAuthed] = useState(isAdminLoggedIn());
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [tab, setTab] = useState('dashboard');
  const [, force] = useState(0);
  const refresh = () => force((x) => x + 1);

  const content = useMemo(() => loadContent(), [authed, tab]);

  // ── autenticação ──
  if (!authed) {
    const firstTime = !hasAdminPin();
    return (
      <div className="screen">
        <Panel title="🛡 Admin Control Center" icon="🛡️">
          <div className="admin-login">
            <span style={{ fontSize: 56 }}>🛡️</span>
            <h3>{firstTime ? 'Configurar acesso de administrador' : 'Entrar no Admin Control Center'}</h3>
            <p className="muted small">
              {firstTime
                ? 'Defina um PIN local. Ele é armazenado apenas como hash + sal (nunca em texto puro).'
                : 'Digite seu PIN local para continuar. Nenhuma credencial é armazenada no frontend.'}
            </p>
            <input type="password" className="wardrobe-search" placeholder="PIN (mín. 4 caracteres)" value={pin} onChange={(e) => setPin(e.target.value)} maxLength={64} />
            {pinMsg && <p className="muted small" style={{ color: 'var(--danger)' }}>{pinMsg}</p>}
            <button
              className="btn btn-primary"
              onClick={() => {
                const r = firstTime ? setupAdminPin(pin) : loginAdmin(pin);
                if (r.ok) {
                  securityLog('LOGIN_ADMIN', 'Sessão local iniciada');
                  setAuthed(true);
                  setPin('');
                  setPinMsg('');
                  audio.levelUp();
                } else {
                  securityLog('LOGIN_FAILED', 'Tentativa de login falhou');
                  setPinMsg(r.reason ?? 'Falha');
                }
              }}
            >
              {firstTime ? 'Configurar PIN' : 'Entrar'}
            </button>
            <p className="muted small">Ações administrativas são auditadas (tela Logs). O modo é puramente local e offline.</p>
          </div>
        </Panel>
      </div>
    );
  }

  const role = 'SUPER_ADMIN' as const;
  const has = (p: Permission) => roleHas(role, p);

  function flashSave(msg: string) {
    setPinMsg(msg);
    setTimeout(() => setPinMsg(''), 3000);
  }

  return (
    <div className="screen">
      <Panel
        title="🛡 Admin Control Center"
        icon="🛡️"
        right={
          <span className="muted small">
            {ROLE_LABELS[role]} · <button className="btn btn-xs ghost" onClick={() => { logoutAdmin(); securityLog('LOGOUT_ADMIN', 'Sessão encerrada'); setAuthed(false); }}>Sair</button>
          </span>
        }
      >
        <TabBar
          tabs={[
            { id: 'dashboard', name: 'Dashboard', icon: '📊' },
            { id: 'online', name: 'Online', icon: '🟢' },
            { id: 'content', name: 'Conteúdo', icon: '🗂️' },
            { id: 'sales', name: 'Vendas', icon: '💰' },
            { id: 'rewards', name: 'Recompensas', icon: '🎁' },
            { id: 'simulate', name: 'Simular', icon: '🧪' },
            { id: 'logs', name: 'Logs', icon: '📜' },
            { id: 'security', name: 'Segurança', icon: '🔐' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'dashboard' && (
          <div className="admin-grid">
            <div className="admin-stat"><span>Versão do jogo</span><strong>v{GAME_VERSION}</strong></div>
            <div className="admin-stat"><span>Save version</span><strong>v{engine.state.schemaVersion}</strong></div>
            <div className="admin-stat"><span>Evento atual</span><strong>{EventManager.active()[0]?.name ?? 'Nenhum'}</strong></div>
            <div className="admin-stat"><span>Temporada</span><strong>{activeSeason()?.name ?? 'Nenhuma'}</strong></div>
            <div className="admin-stat"><span>Passe premium</span><strong>{engine.state.premiumPass.owned ? 'Ativo' : 'Inativo'}</strong></div>
            <div className="admin-stat"><span>Skins no catálogo</span><strong>{SKINS.length}</strong></div>
            <div className="admin-stat"><span>Conteúdo publicado</span><strong>{content.filter((c) => c.status === 'PUBLISHED').length}</strong></div>
            <div className="admin-stat"><span>Último backup</span><strong>{lastBackupTime() ? new Date(lastBackupTime()!).toLocaleString('pt-BR') : '—'}</strong></div>
            <div className="admin-stat"><span>Alertas</span><strong>{endingSoonCount() > 0 ? `⚠ ${endingSoonCount()} evento(s) terminando` : '✓ Sem alertas'}</strong></div>
            <div className="admin-stat"><span>Erros recentes (log)</span><strong>{engine.state.log.length}</strong></div>
          </div>
        )}

        {tab === 'online' && <OnlineTab flashSave={flashSave} />}

        {tab === 'content' && (
          <div>
            <div className="admin-actions">
              <button className="btn btn-sm" onClick={() => { const b = autoBackup(); flashSave(`Backup criado (${b.count} itens)`); refresh(); }}>🗃️ Backup agora</button>
              <button className="btn btn-sm" onClick={() => { const list = backupList(); if (list.length === 0) { flashSave('Nenhum backup disponível'); return; } const r = restoreBackup(list[0]); flashSave(r.ok ? 'Último backup restaurado' : `❌ ${r.reason ?? 'Falha'}`); refresh(); }}>↺ Restaurar último</button>
            </div>
            <h4>Itens de conteúdo ({content.length})</h4>
            <div className="history-list">
              {content.length === 0 && <p className="muted small">Nenhum item criado ainda. Crie um rascunho abaixo.</p>}
              {content.map((c) => (
                <div key={`${c.kind}-${c.id}`} className="admin-content-row">
                  <span className={`content-status content-${c.status.toLowerCase()}`}>{c.status}</span>
                  <strong>{c.name}</strong>
                  <span className="muted small">{c.kind} · v{c.version}</span>
                  <div>
                    <button className="btn btn-xs" onClick={() => { const r = publishContent(c.id, c.kind); flashSave(r.ok ? `Publicado: ${c.name}` : `❌ ${r.reason ?? 'validação falhou'}`); refresh(); }}>Publicar</button>
                    <button className="btn btn-xs ghost" onClick={() => { deleteContent(c.id, c.kind); refresh(); }}>Excluir</button>
                  </div>
                </div>
              ))}
            </div>
            <h4 style={{ marginTop: 12 }}>Novo rascunho</h4>
            <DraftForm
              onDone={(msg) => { flashSave(msg); refresh(); }}
            />
          </div>
        )}

        {tab === 'sales' && <SalesTab onDone={flashSave} refresh={refresh} />}

        {tab === 'rewards' && has('GRANT_REWARDS') && <RewardsTab onDone={flashSave} />}
        {tab === 'rewards' && !has('GRANT_REWARDS') && <p className="locked-text">⛔ Permissão negada: GRANT_REWARDS</p>}

        {tab === 'simulate' && <SimulateTab />}

        {tab === 'logs' && (
          <LogsTab entries={auditLog()} />
        )}

        {tab === 'security' && (
          <div>
            <LogsTab entries={securityLogEntries()} />
            <div className="admin-actions" style={{ marginTop: 10 }}>
              <button className="btn btn-sm btn-danger" onClick={() => { clearAuditLogs(); refresh(); }}>Limpar logs</button>
            </div>
          </div>
        )}

        {pinMsg && <div className="menu-toast">{pinMsg}</div>}
      </Panel>
    </div>
  );
}

function DraftForm({ onDone }: { onDone: (msg: string) => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ContentKind>('event');
  const [status, setStatus] = useState<ContentStatus>('DRAFT');
  const [price, setPrice] = useState('100');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  function save() {
    const id = `admin_${kind}_${Date.now()}`;
    const payload: Record<string, unknown> = {
      price: Number(price),
      startAt: startAt ? new Date(startAt).getTime() : undefined,
      endAt: endAt ? new Date(endAt).getTime() : undefined,
    };
    const draft: AdminContent = {
      id, kind, name, status, payload,
      createdAt: Date.now(), updatedAt: Date.now(), version: 1,
    };
    const r = validateContent(draft);
    if (!r.ok) {
      setErrors(r.errors);
      audit({ actor: 'SUPER_ADMIN', action: 'CONTENT_SAVE', target: `${kind}:${id}`, detail: `validação falhou: ${r.errors.join('; ')}`, result: 'error' });
      return;
    }
    saveDraft(draft);
    onDone(`Rascunho salvo: ${name}`);
    setName(''); setPrice('100'); setStartAt(''); setEndAt(''); setErrors([]);
  }

  return (
    <div className="draft-form">
      <div className="admin-form-row">
        <label><span>Nome</span><input className="wardrobe-search" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do conteúdo" /></label>
        <label><span>Tipo</span>
          <select className="wardrobe-select" value={kind} onChange={(e) => setKind(e.target.value as ContentKind)}>
            {(['event', 'skin', 'banner', 'news', 'pass', 'season', 'reward'] as ContentKind[]).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label><span>Status</span>
          <select className="wardrobe-select" value={status} onChange={(e) => setStatus(e.target.value as ContentStatus)}>
            {STATUS_FLOW.map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
        </label>
      </div>
      <div className="admin-form-row">
        <label><span>Preço (≥ 0)</span><input className="wardrobe-search" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label><span>Início</span><input className="wardrobe-search" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></label>
        <label><span>Fim</span><input className="wardrobe-search" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></label>
      </div>
      {errors.length > 0 && <p className="muted small" style={{ color: 'var(--danger)' }}>{errors.join(' · ')}</p>}
      <div className="modal-actions">
        <button className="btn btn-sm" onClick={save}>💾 Salvar rascunho</button>
      </div>
    </div>
  );
}

// ── aba Online: jogadores com presença ativa (sinais do heartbeat) ──

const ONLINE_POLL_MS = 10_000;

function OnlineTab({ flashSave }: { flashSave: (msg: string) => void }) {
  const [players, setPlayers] = useState<OnlinePlayer[]>([]);
  const [conn, setConn] = useState<{ ok: boolean; label: string } | null>(null);
  const [lastCheck, setLastCheck] = useState(0);
  const online = pixTestEnabled();

  const load = useCallback(async () => {
    const list = await fetchOnlinePlayers();
    if (list === null) {
      // servidor inacessível/recusou — falha de conexão, não "ninguém online"
      setConn({ ok: false, label: 'Sem conexão com o servidor de presença' });
      return;
    }
    setPlayers(list);
    setLastCheck(Date.now());
    setConn({ ok: true, label: `${list.length} jogador(es) online` });
  }, []);

  useEffect(() => {
    if (!online) { setConn(null); setPlayers([]); return; }
    void load();
    const iv = window.setInterval(() => { void load(); }, ONLINE_POLL_MS);
    return () => window.clearInterval(iv);
  }, [online, load]);

  const now = Date.now();
  return (
    <div>
      <div className="admin-actions">
        <button className="btn btn-sm" disabled={!online} onClick={() => void load()}>↻ Atualizar agora</button>
        <span className="muted small">
          {online ? `Atualiza automaticamente a cada ${Math.round(ONLINE_POLL_MS / 1000)}s` : 'Backend não configurado — sem dados de presença'}
        </span>
      </div>

      {conn && (
        <div className={`pix-conn-banner ${conn.ok ? 'ok' : 'err'}`} style={{ marginBottom: 10 }}>
          <strong>{conn.ok ? '🟢 Servidor de presença conectado' : '🔴 Servidor de presença offline'}</strong>
          <span className="muted small">{conn.label}{lastCheck ? ` · ${new Date(lastCheck).toLocaleTimeString('pt-BR')}` : ''}</span>
          <button className="btn btn-xs" onClick={() => void load()}>↻ Verificar</button>
        </div>
      )}

      <h4>🟢 Jogadores online agora ({players.length})</h4>
      <p className="muted small">
        Presença registrada pelos sinais de heartbeat (a cada 1 min) — jogadores que não enviam sinal há mais de 3 minutos saem da lista.
      </p>

      <div className="history-list" style={{ marginTop: 8 }}>
        {!online && <p className="muted small">Configure o backend (Configurações → Pagamentos) para ver jogadores online.</p>}
        {online && players.length === 0 && <p className="muted small">Nenhum jogador online no momento.</p>}
        {players.map((p) => {
          const age = now - p.lastSeenAt;
          const ageLabel = age < 1000 ? 'agora' : age < 60_000 ? `há ${Math.floor(age / 1000)}s` : `há ${Math.floor(age / 60_000)}min`;
          return (
            <div key={p.playerId} className="admin-content-row">
              <span className="content-status content-published">🟢 ATIVO</span>
              <strong>Jogador #{p.playerId}</strong>
              <span className="muted small">{p.gameVersion ? `v${p.gameVersion}` : 'v—'} · sinal {ageLabel}</span>
              <div>
                <button className="btn btn-xs ghost" onClick={() => { void navigator.clipboard?.writeText(p.playerId).catch(() => {}); flashSave(`📋 ID ${p.playerId} copiado`); }}>📋 ID</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RewardsTab({ onDone }: { onDone: (msg: string) => void }) {
  const { engine } = useGame();
  const [gold, setGold] = useState('100000');
  const [crystals, setCrystals] = useState('100');
  const [skinId, setSkinId] = useState('classic');

  function grant() {
    engine.addRes('gold', D(gold));
    if (Number(crystals) > 0) engine.addRes('crystals', D(crystals));
    if (skinId) engine.grantSkin(skinId);
    audit({ actor: 'SUPER_ADMIN', action: 'REWARD_GRANT', target: 'player', detail: `+${gold} ouro, +${crystals} cristais, skin ${skinId}`, result: 'ok' });
    onDone('Recompensa concedida e registrada em log');
  }

  return (
    <div>
      <h4>🎁 Conceder recompensas (gera log de auditoria)</h4>
      <div className="admin-form-row">
        <label><span>Moedas</span><input className="wardrobe-search" value={gold} onChange={(e) => setGold(e.target.value)} /></label>
        <label><span>Diamantes</span><input className="wardrobe-search" value={crystals} onChange={(e) => setCrystals(e.target.value)} /></label>
        <label><span>Skin</span>
          <select className="wardrobe-select" value={skinId} onChange={(e) => setSkinId(e.target.value)}>
            {SKINS.map((sk) => <option key={sk.id} value={sk.id}>{sk.name}</option>)}
          </select>
        </label>
      </div>
      <button className="btn btn-sm" onClick={grant}>🎁 Conceder</button>
    </div>
  );
}

function SimulateTab() {
  const { engine } = useGame();
  const s = engine.state;
  const [summary, setSummary] = useState<string[]>([]);

  /** Simulação SOMENTE para visualização — nunca altera os dados reais do jogador. */
  function preview(p: string) {
    const clone = JSON.parse(JSON.stringify(s)) as typeof s;
    const lines: string[] = [];
    switch (p) {
      case 'new':
        lines.push('Como um novo jogador veria:', 'Nível 1 · sem prestígio · sem ascensão · sem passe · Armário quase vazio.');
        break;
      case 'premium':
        clone.premiumPass.owned = true;
        lines.push('Como um jogador com Passe Premium veria:', `Trilha premium com ${GAME_PASS_LEVELS.length} níveis e recompensas exclusivas.`);
        break;
      case 'skins': {
        for (const sk of SKINS.slice(0, 6)) if (!clone.skins.owned.includes(sk.id)) clone.skins.owned.push(sk.id);
        lines.push('Como uma coleção parcial veria:', `${clone.skins.owned.length} skins reveladas no Armário; as demais continuam ocultas (???).`);
        break;
      }
      case 'event': {
        const ev = EventManager.active()[0];
        lines.push('Eventos no momento:', ev ? `${ev.icon} ${ev.name} ativo com moeda própria e passe.` : 'Nenhum evento ativo agora.');
        break;
      }
    }
    setSummary(lines);
    audit({ actor: 'SUPER_ADMIN', action: 'SAVE_EDIT', target: 'simulate', detail: `preview ${p} (somente visualização — dados reais intactos)`, result: 'ok' });
  }

  return (
    <div>
      <h4>🧪 Sandbox — simular como um jogador veria</h4>
      <p className="muted small">🛡 A simulação é <strong>somente visualização</strong>: nenhum dado real é alterado (requisito de segurança do Admin). Tudo é auditado.</p>
      <div className="chip-filter">
        {[['new', 'Novo jogador'], ['premium', 'Passe Premium'], ['skins', 'Coleção parcial'], ['event', 'Evento ativo']].map(([id, label]) => (
          <button key={id} className="chip-btn" onClick={() => preview(id)}>{label}</button>
        ))}
      </div>
      {summary.length > 0 && (
        <div className="premium-reward-box" style={{ marginTop: 12 }}>
          <strong>Pré-visualização</strong>
          {summary.map((l, i) => <p key={i} className={`muted small ${i === 0 ? '' : 'center'}`}>{l}</p>)}
        </div>
      )}
      <p className="muted small" style={{ marginTop: 8 }}>Estado atual: nível {s.level} · prestígio {s.prestige.count} · ascensão {s.ascension.count} · passe {s.premiumPass.owned ? 'sim' : 'não'}.</p>
    </div>
  );
}

function LogsTab({ entries }: { entries: AuditEntry[] }) {
  return (
    <div className="history-list">
      {entries.length === 0 && <p className="muted small">Nenhum registro ainda.</p>}
      {entries.slice(0, 60).map((e, i) => (
        <div key={i} className="history-item"><span className={`content-status content-${e.result}`}>{e.action}</span><span className="muted small">{formatAudit(e)}</span></div>
      ))}
    </div>
  );
}

// ── aba Vendas (sistema de venda de diamantes/moedas + teste Pix) ──

const PACK_ICONS = ['💎', '🪙', '👑', '🌟', '🔥', '🎁', '⚡', '💰'];

function SalesTab({ onDone, refresh }: { onDone: (msg: string) => void; refresh: () => void }) {
  const { engine } = useGame();
  const [packs, setPacks] = useState<AdminPack[]>(() => loadPacks());
  const [serverPacks, setServerPacks] = useState<AdminPack[]>([]);
  const [editing, setEditing] = useState<AdminPack | null>(null);
  const [form, setForm] = useState({ name: '', icon: '💎', priceBRL: '', gold: '', diamonds: '', tag: '', featured: false });
  const [errors, setErrors] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [conn, setConn] = useState<{ ok: boolean; label: string } | null>(null);
  const online = pixTestEnabled();

  // status da conexão com o backend (aviso claro quando offline)
  const applyConn = useCallback((r: { ok: boolean; mp?: string; reason?: string }) => {
    setConn(r.ok
      ? { ok: true, label: `Mercado Pago: ${r.mp ?? 'ok'}` }
      : { ok: false, label: r.reason ?? 'Sem conexão' });
  }, []);

  useEffect(() => {
    if (!online) { setConn(null); return; }
    let alive = true;
    void testPixBackend().then((r) => { if (alive) applyConn(r); });
    return () => { alive = false; };
  }, [online, applyConn]);

  // ── teste Pix (R$ 0,01 → 1💎) ──
  const [testOrder, setTestOrder] = useState<{ orderId: string; pixCode: string; qrCodeBase64?: string; amountBRL: number; status: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollTest = useCallback(async (orderId: string) => {
    const r = await engine.checkPixOrder(orderId);
    setTestOrder((prev) => (prev ? { ...prev, status: r.status } : prev));
    if (r.status === 'approved' || r.status === 'rejected' || r.status === 'cancelled') {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      setTestOrder(null);
      if (r.status === 'approved') {
        onDone(`✅ Pix aprovado! +${r.diamonds ?? 0}💎 e +${D(r.gold ?? 0).toFixed(0)}🪙 entregues.`);
        audio.buy();
      } else {
        onDone(`❌ Pix ${r.status}.`);
      }
      refresh();
    }
  }, [engine, onDone, refresh]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; };
  }, []);

  // carrega a lista publicada no servidor ao abrir
  useEffect(() => {
    if (!online) return;
    void fetchServerPacks().then((list) => setServerPacks(list));
  }, [online]);

  function resetForm() {
    setEditing(null);
    setForm({ name: '', icon: '💎', priceBRL: '', gold: '', diamonds: '', tag: '', featured: false });
    setErrors([]);
  }

  function startEdit(p: AdminPack) {
    setEditing(p);
    setForm({ name: p.name, icon: p.icon, priceBRL: String(p.priceBRL), gold: p.gold, diamonds: String(p.diamonds), tag: p.tag ?? '', featured: p.featured ?? false });
    setErrors([]);
  }

  function submit() {
    const draft: AdminPack = {
      id: editing?.id ?? packIdFromName(form.name || 'pacote'),
      name: form.name.trim(),
      icon: form.icon || '💎',
      priceBRL: Number(form.priceBRL),
      gold: String(Math.max(0, Math.floor(Number(form.gold) || 0))),
      diamonds: Math.max(0, Math.floor(Number(form.diamonds) || 0)),
      tag: form.tag.trim() || undefined,
      featured: form.featured,
      enabled: editing?.enabled ?? true,
      updatedAt: Date.now(),
    };
    const v = validatePack(draft);
    if (!v.ok) { setErrors(v.errors); return; }
    savePack(draft);
    setPacks(loadPacks());
    onDone(`💾 Pacote salvo: ${draft.name}`);
    resetForm();
  }

  async function publish(p: AdminPack) {
    setSyncing(true);
    const r = await publishPackToServer(p);
    setSyncing(false);
    onDone(r.ok ? `☁️ Publicado: ${p.name}` : `❌ ${r.reason ?? 'Falha'}`);
    if (r.ok) setServerPacks(await fetchServerPacks());
  }

  async function removeRemote(p: AdminPack) {
    setSyncing(true);
    const r = await deletePackFromServer(p.id);
    setSyncing(false);
    onDone(r.ok ? `🗑️ Removido do servidor: ${p.name}` : `❌ ${r.reason ?? 'Falha'}`);
    if (r.ok) setServerPacks(await fetchServerPacks());
  }

  async function runTestPix() {
    if (testing) return;
    setTesting(true);
    const pack = testPack();
    const r = await engine.buyPixPack({ id: pack.id, name: pack.name, priceBRL: pack.priceBRL, gold: pack.gold, diamonds: pack.diamonds });
    setTesting(false);
    if (!r.ok) {
      onDone(`❌ ${r.reason ?? 'Falha no teste'}`);
      return;
    }
    if (r.pending && r.orderId) {
      setTestOrder({ orderId: r.orderId, pixCode: r.pixCode ?? '', qrCodeBase64: r.qrCodeBase64, amountBRL: pack.priceBRL, status: 'pending' });
      pollRef.current = setInterval(() => void pollTest(r.orderId!), GameConfig.wallet.pixPollingMs);
    } else {
      onDone(`✅ Teste Pix (simulado) aprovado — +${r.diamonds ?? 0}💎 entregues!`);
      refresh();
    }
  }

  const remoteIds = new Set(serverPacks.map((p) => p.id));

  return (
    <div>
      {online && conn && (
        <div className={`pix-conn-banner ${conn.ok ? 'ok' : 'err'}`} style={{ marginBottom: 10 }}>
          <strong>{conn.ok ? '🟢 Backend Pix conectado' : '🔴 Backend Pix offline'}</strong>
          <span className="muted small">{conn.label}</span>
          <button className="btn btn-xs" onClick={() => void testPixBackend().then(applyConn)}>↻ Verificar</button>
        </div>
      )}
      <div className="admin-actions">
        <button className="btn btn-sm btn-primary" onClick={() => void runTestPix()} disabled={testing}>
          🧪 Testar Pix R$ 0,01 → 1💎 {!online ? '(simulado)' : conn && !conn.ok ? '(sem conexão)' : '(cobrança real)'}
        </button>
        <button className="btn btn-sm" onClick={() => void fetchServerPacks().then((l) => { setServerPacks(l); onDone(`📥 ${l.length} pacote(s) do servidor`); })} disabled={!online}>
          📥 Buscar do servidor
        </button>
      </div>

      <h4>💎 Pacotes de diamantes/moedas ({packs.length})</h4>
      <p className="muted small">
        Crie pacotes combinando 💎 diamantes e 🪙 moedas, ou <strong>venda separada</strong> (só diamante ou só coin).
        Pacotes com <span className="content-status content-published">PUBLISHED</span> no servidor ficam disponíveis para os jogadores via Pix.
      </p>

      <div className="history-list" style={{ marginTop: 8 }}>
        {packs.length === 0 && <p className="muted small">Nenhum pacote criado ainda.</p>}
        {packs.map((p) => {
          const onServer = remoteIds.has(p.id);
          return (
            <div key={p.id} className="admin-content-row">
              <span className="pack-icon" style={{ fontSize: 18 }}>{p.icon}</span>
              <div>
                <strong>{p.name}</strong>
                <span className="muted small"> {fmtBRL(p.priceBRL)} · +{p.gold} 🪙 · +{p.diamonds} 💎{p.tag ? ` · ${p.tag}` : ''}</span>
                <div className="muted small">
                  <button className="btn btn-xs" onClick={() => { togglePack(p.id); setPacks(loadPacks()); }}>{p.enabled ? '🟢 ativo' : '⏸ pausado'}</button>
                  <span className={`content-status ${onServer ? 'content-published' : 'content-draft'}`} style={{ marginLeft: 6 }}>{onServer ? 'PUBLISHED' : 'LOCAL'}</span>
                </div>
              </div>
              <div>
                {!onServer && <button className="btn btn-xs" disabled={syncing} onClick={() => void publish(p)}>☁️ Publicar</button>}
                {onServer && <button className="btn btn-xs ghost" disabled={syncing} onClick={() => void removeRemote(p)}>🗑️ Remoto</button>}
                <button className="btn btn-xs ghost" onClick={() => startEdit(p)}>Editar</button>
                <button className="btn btn-xs ghost" onClick={() => { deletePack(p.id); setPacks(loadPacks()); onDone(`🗑️ ${p.name} excluído`); }}>Excluir</button>
              </div>
            </div>
          );
        })}
      </div>

      <h4 style={{ marginTop: 14 }}>{editing ? `✏️ Editar pacote: ${editing.name}` : '➕ Novo pacote'}</h4>
      <div className="draft-form">
        <div className="admin-form-row">
          <label><span>Nome</span><input className="wardrobe-search" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: 100 Diamantes" /></label>
          <label><span>Ícone</span>
            <div className="chip-filter" style={{ gap: 4 }}>
              {PACK_ICONS.map((ic) => (
                <button key={ic} className={`chip-btn ${form.icon === ic ? 'active' : ''}`} onClick={() => setForm({ ...form, icon: ic })} style={{ padding: '2px 8px' }}>{ic}</button>
              ))}
            </div>
          </label>
        </div>
        <div className="admin-form-row">
          <label><span>Preço (R$)</span><input className="wardrobe-search" type="number" min={0.01} step="0.01" value={form.priceBRL} onChange={(e) => setForm({ ...form, priceBRL: e.target.value })} placeholder="0.01" /></label>
          <label><span>Moedas 🪙</span><input className="wardrobe-search" type="number" min={0} value={form.gold} onChange={(e) => setForm({ ...form, gold: e.target.value })} placeholder="0 = só diamante" /></label>
          <label><span>Diamantes 💎</span><input className="wardrobe-search" type="number" min={0} value={form.diamonds} onChange={(e) => setForm({ ...form, diamonds: e.target.value })} placeholder="0 = só coin" /></label>
          <label><span>Tag</span><input className="wardrobe-search" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} placeholder="Opcional" /></label>
        </div>
        <div className="admin-form-row">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> Destaque 🔥
          </label>
          <button className="btn btn-sm" onClick={() => setForm({ ...form, gold: '0' })}>Só diamante</button>
          <button className="btn btn-sm" onClick={() => setForm({ ...form, diamonds: '0' })}>Só coin</button>
        </div>
        {errors.length > 0 && <p className="muted small" style={{ color: 'var(--danger)' }}>{errors.join(' · ')}</p>}
        <div className="modal-actions">
          <button className="btn btn-sm btn-primary" onClick={submit}>{editing ? '💾 Salvar alterações' : '➕ Criar pacote'}</button>
          {editing && <button className="btn btn-sm ghost" onClick={resetForm}>Cancelar</button>}
        </div>
      </div>

      {/* modal do teste Pix */}
      <Modal open={testOrder !== null} onClose={() => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; setTestOrder(null); }} title="🧪 Teste Pix — R$ 0,01" width={440}>
        {testOrder && (
          <div className="pix-receipt">
            <p className="muted small center">
              {testOrder.status === 'pending' ? 'Aguardando pagamento…' : testOrder.status}
            </p>
            {testOrder.qrCodeBase64 && (
              <div className="pix-qr-wrap">
                <img className="pix-qr-img" src={`data:image/png;base64,${testOrder.qrCodeBase64}`} alt="QR Code Pix" />
              </div>
            )}
            <div className="wallet-summary">
              <div><span>Item</span><strong>Teste 1💎 (R$ {testOrder.amountBRL.toFixed(2)})</strong></div>
              <div><span>Conteúdo</span><strong>+1 diamante ao aprovar</strong></div>
            </div>
            {testOrder.pixCode && (
              <div className="pix-code-box">
                <small className="muted">Código Pix copia-e-cola</small>
                <code className="pix-code">{testOrder.pixCode}</code>
                <button className="btn btn-sm" onClick={() => { void navigator.clipboard?.writeText(testOrder.pixCode).catch(() => {}); onDone('📋 Código copiado!'); }}>📋 Copiar</button>
              </div>
            )}
            <p className="muted small center">
              {online
                ? '⏳ Pague 1 centavo no app do seu banco — quando o Pix compensar, o servidor aprova e +1💎 entra na sua conta. Vale para validar o fluxo real.'
                : '⚠️ Modo simulado (sem backend): o pedido é aprovado na hora e +1💎 é entregue.'}
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => { if (pollRef.current) clearInterval(pollRef.current); pollRef.current = null; setTestOrder(null); }}>Fechar</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
