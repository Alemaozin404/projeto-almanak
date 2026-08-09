import { useEffect, type ReactNode } from 'react';
import type { Num } from '../core/bignum';
import { rarityOf } from '../core/rarities';
import type { RarityId } from '../game/types';
import { xpForLevel } from '../economy/formulas';
import { useGame } from './context';

export function NumText({ v, digits }: { v: Num; digits?: number }) {
  const { fmt } = useGame();
  return <span>{fmt(v, digits)}</span>;
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="tip-wrap">
      {children}
      <span className="tip">{text}</span>
    </span>
  );
}

export function RarityBadge({ rarity, size = 'md' }: { rarity: RarityId; size?: 'sm' | 'md' }) {
  const r = rarityOf(rarity);
  return (
    <span className={`rarity-badge rarity-${r.id} ${size === 'sm' ? 'is-sm' : ''}`} style={{ color: r.color }}>
      {r.name}
    </span>
  );
}

export function Panel({ title, icon, children, className = '', right }: { title?: string; icon?: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      {(title || right) && (
        <header className="panel-head">
          <h3>{icon && <span className="panel-icon">{icon}</span>}{title}</h3>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

export function Card({ children, className = '', onClick, disabled, style }: { children: ReactNode; className?: string; onClick?: () => void; disabled?: boolean; style?: React.CSSProperties }) {
  return (
    <div
      className={`card ${className} ${onClick ? 'clickable' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  );
}

export function ProgressBar({ value, max, color, label }: { value: Num; max: Num; color?: string; label?: string }) {
  const pct = max && Number(max) > 0 ? Math.min(100, (Number(value) / Number(max)) * 100) : 0;
  return (
    <div className="progress" title={label}>
      <div className="progress-fill" style={{ width: `${pct}%`, background: color ?? 'var(--accent)' }} />
      {label && <span className="progress-label">{label}</span>}
    </div>
  );
}

export function TabBar<T extends string>({ tabs, active, onChange }: { tabs: { id: T; name: string; icon?: string }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="tabbar">
      {tabs.map((t) => (
        <button key={t.id} className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.icon && <span>{t.icon}</span>} {t.name}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, width = 480 }: { open: boolean; onClose?: () => void; title?: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        {title && (
          <header className="modal-head">
            <h2>{title}</h2>
            {onClose && <button className="icon-btn" onClick={onClose}>✕</button>}
          </header>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, desc, confirmLabel = 'Confirmar', danger }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; desc: ReactNode; confirmLabel?: string; danger?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="muted">{desc}</p>
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => { onConfirm(); onClose(); }}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function StatRow({ label, value, icon }: { label: string; value: ReactNode; icon?: string }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{icon && <span className="stat-icon">{icon}</span>}{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

export function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <p>{text}</p>
    </div>
  );
}

export function LevelBar({ xp, level }: { xp: Num; level: number }) {
  const { fmt } = useGame();
  const need = xpForLevel(level);
  const cur = Number(xp);
  return (
    <div className="progress" title={`${fmt(xp)} / ${fmt(need)} XP`}>
      <div className="progress-fill" style={{ width: `${Math.min(100, (cur / Number(need)) * 100)}%` }} />
      <span className="progress-label">{fmt(xp)} / {fmt(need)} XP</span>
    </div>
  );
}
