import { useSyncExternalStore } from 'react';
import { RESOURCE_LIST, type ResourceId } from '../economy/resources';
import { NumText, Tooltip } from './kit';
import { useGame } from './context';
import { NAV, type Screen } from './sidebar';
import { getCloudStatus, subscribeCloudStatus } from '../online/status';
import { getSessionSnapshot, subscribeAccountSession } from '../online/account';
import { hapticLight } from '../core/platform';

/** Header do app no celular: nível + título da tela + conta + menu + strip de recursos. */
export function MobileTopBar({ screen, onMenu, onAccountClick }: { screen: Screen; onMenu: () => void; onAccountClick?: () => void }) {
  const { engine } = useGame();
  const s = engine.state;
  const cloud = useSyncExternalStore(subscribeCloudStatus, getCloudStatus);
  // conta ativa: mostra quem está jogando (ou modo convidado) — reage a login/logout
  const account = useSyncExternalStore(subscribeAccountSession, getSessionSnapshot);
  const nav = NAV.find((n) => n.id === screen);

  return (
    <header className="mtopbar">
      <div className="mtopbar-row">
        <span className="mtop-level" title={`Nível ${s.level}`}>{s.level}</span>
        <span className="mtop-title">{nav?.icon ?? ''} <b>{nav?.name ?? ''}</b></span>
        <button
          className={`mtop-account${account ? '' : ' guest'}`}
          onClick={() => { hapticLight(); onAccountClick?.(); }}
          title={account ? `Conta: ${account.username} — clique para gerenciar` : 'Modo sem conta (convidado) — clique para criar ou entrar em uma conta'}
        >
          {account ? (
            <><span className="mtop-account-icon">👤</span><span className="mtop-account-name">{account.username}</span></>
          ) : (
            <><span className="mtop-account-icon">🎮</span><span className="mtop-account-name">Convidado</span></>
          )}
        </button>
        <button className="icon-btn mtop-menu" onClick={() => { hapticLight(); onMenu(); }} title="Menu">☰</button>
      </div>
      <div className="mtop-resources">
        {RESOURCE_LIST.map((r) => (
          <Tooltip key={r.id} text={`${r.name} — ${r.source}\nUso: ${r.use}`}>
            <div className="resource">
              <span className="res-icon" style={{ color: r.color }}>{r.icon}</span>
              <span className="res-value"><NumText v={engine.getRes(r.id as ResourceId)} /></span>
            </div>
          </Tooltip>
        ))}
        <span className={`cloud-mini cloud-${cloud}`} title="Status do servidor" />
      </div>
    </header>
  );
}
