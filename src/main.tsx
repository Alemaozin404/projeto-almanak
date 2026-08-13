import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

// PWA instalável: registra o service worker (só em produção — no Electron/arquivo
// local a URL não é segura e o registro falha silenciosamente, sem efeito).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sem suporte — segue normal */ });
  });
}
