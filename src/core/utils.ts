export function now(): number {
  return Date.now();
}

export function rand(min = 0, max = 1): number {
  return min + Math.random() * (max - min);
}

export function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

export function chance(p: number): boolean {
  return Math.random() < p;
}

export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function pickWeighted<T>(entries: [T, number][]): T {
  let total = 0;
  for (const [, w] of entries) total += Math.max(0.0001, w);
  let r = Math.random() * total;
  for (const [v, w] of entries) {
    r -= Math.max(0.0001, w);
    if (r <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Hash simples (djb2) — usado para checksum de saves. */
export function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function clampNumber(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function todayKey(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function weekKey(): string {
  const d = new Date();
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Data futura a partir de agora (ms). */
export function addMs(ms: number): number {
  return now() + ms;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Remove caracteres de controle / limites de segurança de strings de save. */
export function sanitizeString(s: string, maxLen = 200): string {
  return s.replace(/[\u0000-\u001f]/g, '').slice(0, maxLen);
}
