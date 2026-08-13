import { useState } from 'react';
import { NAV, type Screen } from './sidebar';
import { Modal } from './kit';
import { useGame } from './context';
import { debugEnabled } from '../debug/debug';

/** Telas principais na barra inferior do celular — o resto fica no modal "Mais". */
const PRIMARY: Screen[] = ['home', 'shop', 'boxes', 'quests', 'profile'];

export function MobileNav({ screen, onNavigate }: { screen: Screen; onNavigate: (s: Screen) => void }) {
  const { engine } = useGame();
  const debugOn = debugEnabled(engine);
  const [more, setMore] = useState(false);
  const primary = PRIMARY.map((id) => NAV.find((n) => n.id === id)!);
  const rest = NAV.filter((n) => !PRIMARY.includes(n.id));

  return (
    <>
      <nav className="mobile-nav" aria-label="Navegação">
        {primary.map((n) => (
          <button
            key={n.id}
            className={`mnav-btn ${screen === n.id ? 'active' : ''}`}
            onClick={() => onNavigate(n.id)}
            title={n.hint}
          >
            <span className="mnav-icon">{n.icon}</span>
            <span>{n.name}</span>
          </button>
        ))}
        <button className={`mnav-btn ${more ? 'active' : ''}`} onClick={() => setMore(true)} title="Mais telas">
          <span className="mnav-icon">☰</span>
          <span>Mais</span>
        </button>
      </nav>

      <Modal open={more} onClose={() => setMore(false)} title="☰ Mais telas" width={420}>
        <div className="mnav-more">
          {rest.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${screen === n.id ? 'active' : ''}`}
              onClick={() => { onNavigate(n.id); setMore(false); }}
              title={n.hint}
            >
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-name">{n.name}</span>
            </button>
          ))}
          {debugOn && (
            <>
              <button
                className={`nav-item ${screen === 'debug' ? 'active' : ''}`}
                onClick={() => { onNavigate('debug'); setMore(false); }}
                title="Ferramentas de desenvolvedor"
              >
                <span className="nav-icon">🛠️</span>
                <span className="nav-name">Debug</span>
              </button>
              <button
                className={`nav-item ${screen === 'admin' ? 'active' : ''}`}
                onClick={() => { onNavigate('admin'); setMore(false); }}
                title="Admin Control Center (permissões + auditoria)"
              >
                <span className="nav-icon">🛡️</span>
                <span className="nav-name">Admin</span>
              </button>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
