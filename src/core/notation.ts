import { D, type Num } from './bignum';
import type { NotationMode } from '../game/types';

/** Sufixos curtos para notação 'short'. */
export const SHORT_SUFFIXES = [
  '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc',
  'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc',
  'Vg', 'UVg', 'DVg', 'TVg', 'QaVg', 'QiVg', 'SxVg', 'SpVg', 'OcVg', 'NoVg',
  'Tg', 'UTg', 'DTg', 'TTg', 'QaTg', 'QiTg', 'SxTg', 'SpTg', 'OcTg', 'NoTg',
  'Qd', 'UQd', 'DQd', 'TQd', 'QaQd', 'QiQd', 'SxQd', 'SpQd', 'OcQd', 'NoQd',
  'Qi2', 'UQi2', 'DQi2', 'TQi2', 'QaQi2', 'QiQi2', 'SxQi2', 'SpQi2', 'OcQi2', 'NoQi2',
  'Se', 'USe', 'DSe', 'TSe', 'QaSe', 'QiSe', 'SxSe', 'SpSe', 'OcSe', 'NoSe',
  'St', 'USt', 'DSt', 'TSt', 'QaSt', 'QiSt', 'SxSt', 'SpSt', 'OcSt', 'NoSt',
  'Og', 'UOg', 'DOg', 'TOg', 'QaOg', 'QiOg', 'SxOg', 'SpOg', 'OcOg', 'NoOg',
  'Nn', 'UNn', 'DNn', 'TNn', 'QaNn', 'QiNn', 'SxNn', 'SpNn', 'OcNn', 'NoNn',
  'Ce', 'UCe', 'DCe', 'TCe', 'QaCe', 'QiCe', 'SxCe', 'SpCe', 'OcCe', 'NoCe',
];

function groupInt(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export interface FormatOpts {
  digits?: number;
  maxDigits?: number;
}

function trimZeros(s: string): string {
  if (s.includes('.')) return s.replace(/\.?0+$/, '');
  return s;
}

/** Formata um número para exibição. */
export function formatNumber(v: Num, mode: NotationMode = 'short', opts: FormatOpts = {}): string {
  const d = D(v);
  if (d.isNaN()) return '0';
  const neg = d.isNegative();
  const abs = d.abs();

  const digits = opts.digits ?? 2;

  if (abs.lt(1000)) {
    if (abs.isZero()) return '0';
    if (abs.lt(1)) return trimZeros(abs.toFixed(digits));
    // números "pequenos" mostram inteiros com separadores
    return (neg ? '-' : '') + groupInt(abs.toFixed(0));
  }

  if (mode === 'scientific') {
    const exp = abs.e;
    const mant = abs.div(D(10).pow(exp));
    const m = mant.toFixed(Math.max(0, digits)).replace(/\.?0+$/, '');
    return `${neg ? '-' : ''}${m}e${exp}`;
  }

  if (mode === 'standard') {
    // padrão: dígitos completos com separadores até 1e21; depois científico
    if (abs.lt(D(10).pow(22))) {
      return (neg ? '-' : '') + groupInt(abs.toFixed(0));
    }
    const exp = abs.e;
    const mant = abs.div(D(10).pow(exp));
    return `${neg ? '-' : ''}${mant.toFixed(digits)}e${exp}`;
  }

  // short
  const order = Math.floor(abs.e / 3);
  if (order >= SHORT_SUFFIXES.length) {
    const exp = abs.e;
    const mant = abs.div(D(10).pow(exp));
    return `${neg ? '-' : ''}${mant.toFixed(digits)}e${exp}`;
  }
  const scaled = abs.div(D(10).pow(order * 3));
  let m = scaled.toFixed(digits);
  m = trimZeros(m);
  if (m.length > 6) m = scaled.toFixed(1);
  return `${neg ? '-' : ''}${m}${SHORT_SUFFIXES[order]}`;
}

/** Formato completo (tooltip): dígitos inteiros ou científico para gigantes. */
export function formatFull(v: Num): string {
  const d = D(v);
  if (d.isNaN()) return '0';
  if (d.lt(D(10).pow(30))) return d.isInteger() ? groupInt(d.toFixed(0)) : trimZeros(d.toFixed(4));
  const exp = d.e;
  const mant = d.div(D(10).pow(exp));
  return `${mant.toFixed(6).replace(/\.?0+$/, '')} × 10^${exp}`;
}

/** Duração legível: "8h 32m 5s". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (sec > 0 || parts.length === 0) parts.push(`${sec}s`);
  return parts.join(' ');
}
