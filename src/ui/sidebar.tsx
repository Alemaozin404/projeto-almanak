import { useGame } from './context';
import { debugEnabled } from '../debug/debug';
import { GAME_VERSION } from '../content/updates';

export type Screen =
  | 'home' | 'upgrades' | 'shop' | 'boxes' | 'pets' | 'inventory' | 'skills'
  | 'quests' | 'achievements' | 'prestige' | 'events' | 'collection'
  | 'profile' | 'stats' | 'ranking' | 'wardrobe' | 'updates' | 'season'
  | 'pass' | 'wallet' | 'admin'
  | 'settings' | 'debug';

export const NAV: { id: Screen; name: string; icon: string; hint: string }[] = [
  { id: 'home', name: 'Início', icon: '🏠', hint: 'O Núcleo — clique para gerar energia' },
  { id: 'upgrades', name: 'Upgrades', icon: '⬆️', hint: 'Melhorias permanentes' },
  { id: 'shop', name: 'Loja', icon: '🛒', hint: 'Equipamentos, consumíveis e caixas' },
  { id: 'wallet', name: 'Carteira', icon: '🎰', hint: 'Fichas, créditos e saque via Pix' },
  { id: 'boxes', name: 'Caixas', icon: '📦', hint: 'Abrir caixas e ganhar recompensas' },
  { id: 'pets', name: 'Pets', icon: '🐾', hint: 'Seus companheiros de bônus' },
  { id: 'inventory', name: 'Inventário', icon: '🎒', hint: 'Equipamentos, consumíveis e skins' },
  { id: 'skills', name: 'Habilidades', icon: '⚔️', hint: 'Árvore de habilidades' },
  { id: 'quests', name: 'Missões', icon: '🎯', hint: 'Missões diárias, semanais e permanentes' },
  { id: 'achievements', name: 'Conquistas', icon: '🏆', hint: 'Desafios de longo prazo' },
  { id: 'prestige', name: 'Prestígio', icon: '🌟', hint: 'Prestígio, ascensão e transcendência' },
  { id: 'events', name: 'Eventos', icon: '🎊', hint: 'Eventos temporários' },
  { id: 'collection', name: 'Coleção', icon: '📚', hint: 'Sua coleção completa' },
  { id: 'profile', name: 'Perfil', icon: '👤', hint: 'Seu perfil e títulos' },
  { id: 'stats', name: 'Estatísticas', icon: '📊', hint: 'Estatísticas detalhadas' },
  { id: 'ranking', name: 'Ranking', icon: '🥇', hint: 'Ranking local entre os slots de save' },
  { id: 'wardrobe', name: 'Armário', icon: '🎨', hint: 'Sua coleção de skins' },
  { id: 'updates', name: 'Atualizações', icon: '📰', hint: 'Patch notes, notícias e códigos' },
  { id: 'season', name: 'Temporada', icon: '🌟', hint: 'Season Hub — passe e recompensas' },
  { id: 'pass', name: 'Passe Premium', icon: '🎟️', hint: 'Passe Premium — 100 níveis de recompensas' },
  { id: 'settings', name: 'Configurações', icon: '⚙️', hint: 'Opções do jogo' },
];

export function Sidebar({ screen, onNavigate }: { screen: Screen; onNavigate: (s: Screen) => void }) {
  const { engine } = useGame();
  const debugOn = debugEnabled(engine);
  return (
    <nav className="sidebar">
      <div className="sidebar-logo" onClick={() => onNavigate('home')} title="Núcleo Clicker">
        <span className="logo-orb">⚡</span>
        <div>
          <strong>NÚCLEO</strong>
          <small>CLICKER</small>
        </div>
      </div>
      <ul className="nav-list">
        {NAV.map((n) => (
          <li key={n.id}>
            <button
              className={`nav-item ${screen === n.id ? 'active' : ''}`}
              onClick={() => onNavigate(n.id)}
              title={n.hint}
            >
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-name">{n.name}</span>
            </button>
          </li>
        ))}
        {debugOn && (
          <li>
            <button className={`nav-item ${screen === 'debug' ? 'active' : ''}`} onClick={() => onNavigate('debug')} title="Ferramentas de desenvolvedor">
              <span className="nav-icon">🛠️</span>
              <span className="nav-name">Debug</span>
            </button>
            <button className={`nav-item ${screen === 'admin' ? 'active' : ''}`} onClick={() => onNavigate('admin')} title="Admin Control Center (permissões + auditoria)">
              <span className="nav-icon">🛡️</span>
              <span className="nav-name">Admin</span>
            </button>
          </li>
        )}
      </ul>
      <div className="sidebar-foot">
        <span>v{GAME_VERSION}</span>
      </div>
    </nav>
  );
}
