import { useEffect, useRef, useState } from 'react';
import { BannerManager, type ActiveBanner } from '../liveops/BannerManager';
import type { BannerDestination } from '../content/banners';
import type { Screen } from './sidebar';

const DEST_SCREEN: Record<BannerDestination, Screen> = {
  events: 'events',
  updates: 'updates',
  season: 'season',
  news: 'updates',
  shop: 'shop',
  boxes: 'boxes',
  skins: 'wardrobe',
  codes: 'updates',
  profile: 'profile',
  modal: 'updates',
};

export function BannerCarousel({ onNavigate, max = 4 }: { onNavigate: (s: Screen) => void; max?: number }) {
  const [now, setNow] = useState(Date.now());
  const [idx, setIdx] = useState(0);
  const paused = useRef(false);

  const banners: ActiveBanner[] = BannerManager.carousel(now, max);

  useEffect(() => {
    const iv = setInterval(() => {
      setNow(Date.now());
      if (!paused.current && banners.length > 1) setIdx((i) => (i + 1) % banners.length);
    }, 5000);
    return () => clearInterval(iv);
  }, [banners.length]);

  if (banners.length === 0) return null;

  const current = banners[Math.min(idx, banners.length - 1)];
  const b = current.def;
  const go = () => onNavigate(DEST_SCREEN[b.destination] ?? 'updates');

  return (
    <div
      className="banner-carousel"
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
    >
      <div
        className="banner-main"
        style={{ background: b.gradient, boxShadow: `0 0 24px ${b.glow}` }}
        onClick={go}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') go(); }}
      >
        <span className="banner-priority">{BannerManager.priorityLabel(b.priority)}</span>
        <span className="banner-icon">{b.icon}</span>
        <div className="banner-text">
          <h3>{b.title}</h3>
          <p>{b.subtitle}</p>
          {current.countdownText && <small className="banner-countdown">⏳ {current.countdownText}</small>}
          <span className="btn btn-sm btn-primary banner-cta">{b.cta}</span>
        </div>
      </div>

      {banners.length > 1 && (
        <>
          <button className="banner-arrow left" onClick={(ev) => { ev.stopPropagation(); setIdx((idx + banners.length - 1) % banners.length); }} aria-label="Anterior">◀</button>
          <button className="banner-arrow right" onClick={(ev) => { ev.stopPropagation(); setIdx((idx + 1) % banners.length); }} aria-label="Próximo">▶</button>
          <div className="banner-dots">
            {banners.map((bb, i) => (
              <button key={bb.def.id} className={`dot ${i === Math.min(idx, banners.length - 1) ? 'active' : ''}`} onClick={() => setIdx(i)} aria-label={`Banner ${i + 1}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
