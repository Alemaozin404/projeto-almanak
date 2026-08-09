import { useMemo, useState } from 'react';
import { useGame } from '../context';
import { Panel, TabBar } from '../kit';
import { setupAdminPin, loginAdmin, logoutAdmin, isAdminLoggedIn, hasAdminPin } from '../../admin/auth';
import { audit, securityLog, auditLog, securityLogEntries, clearAuditLogs, formatAudit, type AuditEntry } from '../../admin/audit';
import { roleHas, ROLE_LABELS, type Permission } from '../../admin/permissions';
import { loadContent, saveDraft, publishContent, deleteContent, autoBackup, backupList, restoreBackup, lastBackupTime, validateContent, type AdminContent, type ContentKind, type ContentStatus } from '../../admin/content';
import { GAME_VERSION } from '../../content/updates';
import { activeSeason } from '../../content/seasons';
import { GAME_PASS_LEVELS } from '../../pass/GamePass';
import { EventManager } from '../../liveops/EventManager';
import { SKINS } from '../../content/skins';
import { audio } from '../../audio/audio';
import { D } from '../../core/bignum';

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
            { id: 'content', name: 'Conteúdo', icon: '🗂️' },
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
