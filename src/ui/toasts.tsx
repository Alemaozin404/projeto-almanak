import { useEffect, useState } from 'react';
import { bus } from '../core/events';
import { uid } from '../core/utils';

interface Toast {
  id: string;
  kind: string;
  title: string;
  desc?: string;
}

const KIND_ICONS: Record<string, string> = {
  ach: '🏆',
  pet: '🐾',
  buff: '🧪',
  level: '🆙',
  prestige: '🌟',
  ascension: '👑',
  transcendence: '✨',
  title: '🎖️',
  skin: '🎨',
  essence: '💜',
  event: '🎊',
  quest: '🎯',
  warn: '⚠️',
  default: 'ℹ️',
};

export function Toasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const off = bus.on('notify', (p) => {
      const id = uid();
      setToasts((prev) => [...prev.slice(-4), { id, kind: p.kind, title: p.title, desc: p.desc }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    });
    return off;
  }, []);

  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <span className="toast-icon">{KIND_ICONS[t.kind] ?? KIND_ICONS.default}</span>
          <div className="toast-body">
            <strong>{t.title}</strong>
            {t.desc && <p>{t.desc}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
