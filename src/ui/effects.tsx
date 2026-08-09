import { useEffect, useRef, useState } from 'react';
import { uid } from '../core/utils';

export interface FloatingNum {
  id: string;
  text: string;
  crit: boolean;
  label?: string;
  x: number;
  y: number;
}

export function useFloatingNumbers(limit = 40) {
  const [nums, setNums] = useState<FloatingNum[]>([]);

  function add(text: string, crit: boolean, x: number, y: number, label?: string) {
    const id = uid();
    setNums((prev) => [...prev.slice(-(limit - 1)), { id, text, crit, x, y, label }]);
    setTimeout(() => setNums((prev) => prev.filter((n) => n.id !== id)), 1200);
  }

  const layer = (
    <div className="float-layer">
      {nums.map((n) => (
        <span
          key={n.id}
          className={`float-num ${n.crit ? 'float-crit' : ''} ${n.label ? `float-${n.label.toLowerCase().replace(/[^a-z]/g, '')}` : ''}`}
          style={{ left: n.x, top: n.y }}
        >
          {n.label && <b>{n.label}</b>}
          {n.text}
        </span>
      ))}
    </div>
  );

  return { add, layer };
}

interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
}

export function useParticles(max = 120) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particles = useRef<Particle[]>([]);
  const raf = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    });
    ro.observe(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let running = true;

    const frame = () => {
      if (!running) return;
      raf.current = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.current = particles.current.filter((p) => p.life > 0);
      for (const p of particles.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.life -= 1;
        ctx.globalAlpha = Math.max(0, p.life / 30);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    frame();
    return () => {
      running = false;
      cancelAnimationFrame(raf.current);
      ro.disconnect();
    };
  }, []);

  function burst(x: number, y: number, color: string, count = 10) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = x - rect.left;
    const cy = y - rect.top;
    for (let i = 0; i < count; i++) {
      if (particles.current.length >= max) particles.current.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = 0.8 + Math.random() * 2.4;
      particles.current.push({
        id: uid(),
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1.2,
        color,
        life: 25 + Math.random() * 15,
      });
    }
  }

  const canvas = <canvas ref={canvasRef} className="particle-canvas" />;

  return { burst, canvas };
}
