import type { Settings } from '../game/types';
import type { CritTier } from '../game/engine';
import { defaultSettings } from '../game/types';

type SettingsGetter = () => Settings;

function channelEnabled(s: Settings, key: 'sfx' | 'ui' | 'events' | 'notifications' | 'ambient'): boolean {
  const ch = s.audio?.[key];
  return ch ? ch.enabled && ch.volume > 0 : (s as any).sfxEnabled !== false;
}

/** Progressão de acordes do menu (A menor — pads etéreos). */
const MENU_CHORDS: number[][] = [
  [110, 164.81, 220, 261.63], // Am
  [87.31, 130.81, 174.61, 220], // F
  [130.81, 196, 261.63, 329.63], // C
  [98, 146.83, 196, 246.94], // G
];

/** Pentatônica de A menor — brilhos esparsos do ambiente. */
const SPARKLE_SCALE = [329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private menuAmbientTimer: ReturnType<typeof setInterval> | null = null;
  private menuWind: { src: AudioBufferSourceNode; lfo: OscillatorNode } | null = null;
  private noiseCache: AudioBuffer | null = null;
  private chordIdx = 0;
  private getSettings: SettingsGetter = () => defaultSettings();

  init(getSettings: SettingsGetter): void {
    this.getSettings = getSettings;
  }

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      try {
        const AC = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.9;
        this.master.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.connect(this.master);
        this.musicGain = this.ctx.createGain();
        this.musicGain.connect(this.master);
        this.ambientGain = this.ctx.createGain();
        this.ambientGain.connect(this.master);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, glideTo?: number, dest?: GainNode): void {
    const ctx = this.ensure();
    if (!ctx || !this.sfxGain) return;
    const target = dest ?? this.sfxGain;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(target);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private sfxEnabled(): boolean {
    const s = this.getSettings();
    return channelEnabled(s, 'sfx');
  }

  private uiEnabled(): boolean {
    const s = this.getSettings();
    return channelEnabled(s, 'ui');
  }

  private musicOn(): boolean {
    const s = this.getSettings();
    const ch = s.audio?.music;
    return ch ? ch.enabled && ch.volume > 0 : (s as any).musicEnabled === true;
  }

  click(combo: number): void {
    if (!this.sfxEnabled()) return;
    const f = 320 + Math.min(combo, 200) * 1.5;
    this.tone(f, 0.07, 'triangle', 0.12, 0, f * 1.4);
  }

  crit(tier: CritTier): void {
    if (!this.sfxEnabled()) return;
    const base = { normal: 0, crit: 660, super: 880, mega: 1100, ultra: 1400 }[tier];
    if (base === 0) return;
    this.tone(base, 0.12, 'sawtooth', 0.14, 0, base * 2);
    this.tone(base * 1.5, 0.18, 'square', 0.08, 0.03, base * 3);
  }

  buy(): void {
    if (!this.sfxEnabled()) return;
    this.tone(520, 0.06, 'square', 0.08);
    this.tone(780, 0.1, 'square', 0.06, 0.05);
  }

  error(): void {
    if (!this.sfxEnabled()) return;
    this.tone(180, 0.15, 'sawtooth', 0.08, 0, 120);
  }

  levelUp(): void {
    if (!this.sfxEnabled()) return;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.1, i * 0.07));
  }

  achievement(): void {
    if (!this.sfxEnabled()) return;
    [660, 830, 990, 1320].forEach((f, i) => this.tone(f, 0.16, 'square', 0.07, i * 0.09));
    this.tone(1980, 0.3, 'sine', 0.05, 0.35);
  }

  pet(): void {
    if (!this.sfxEnabled()) return;
    this.tone(440, 0.1, 'sine', 0.12, 0, 880);
    this.tone(660, 0.14, 'sine', 0.1, 0.1, 990);
  }

  box(): void {
    if (!this.sfxEnabled()) return;
    this.tone(200, 0.12, 'sawtooth', 0.1, 0, 120);
    this.tone(500, 0.14, 'square', 0.08, 0.12, 1000);
  }

  prestige(): void {
    if (!this.sfxEnabled()) return;
    [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.12, i * 0.12));
  }

  quest(): void {
    if (!this.sfxEnabled()) return;
    this.tone(700, 0.08, 'sine', 0.1, 0, 1050);
    this.tone(1050, 0.12, 'sine', 0.08, 0.08);
  }

  // ── música de fundo (sintetizada, offline) ──────────────
  /** Toca um acorde-pad da progressão com ataque lento e sub-grave. */
  private playChord(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const chord = MENU_CHORDS[this.chordIdx % MENU_CHORDS.length];
    this.chordIdx += 1;
    const t0 = ctx.currentTime;
    const dur = 9;
    chord.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.03, t0 + 1.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(this.musicGain!);
      osc.start(t0);
      osc.stop(t0 + dur + 0.3);
    });
    // sub-grave (dá peso à progressão)
    const sub = ctx.createOscillator();
    const sg = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.value = chord[0] * 0.5;
    sg.gain.setValueAtTime(0.0001, t0);
    sg.gain.exponentialRampToValueAtTime(0.018, t0 + 1.6);
    sg.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    sub.connect(sg);
    sg.connect(this.musicGain);
    sub.start(t0);
    sub.stop(t0 + dur + 0.3);
  }

  setMusic(on: boolean): void {
    const ctx = this.ensure();
    if (!ctx || !this.musicGain) return;
    if (on && !this.musicTimer) {
      this.musicTimer = setInterval(() => this.playChord(), 6000);
      this.playChord();
    } else if (!on && this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    if (this.musicGain) this.musicGain.gain.value = on ? (this.getSettings().audio.music?.volume ?? 0.4) : 0;
  }

  // ── ambiente do menu (vento espacial + brilhos) ──────────
  /** Liga música + ambiente do menu (segue as configurações de áudio). */
  startMenu(): void {
    const ctx = this.ensure();
    if (!ctx) return;
    this.updateVolumes();
    this.setMusic(this.musicOn());
    if (this.menuAmbientTimer) return;
    // ambiente desligado: não cria nós de áudio à toa
    if (!this.menuAmbienceOn()) return;
    this.startWind();
    this.menuAmbientTimer = setInterval(() => this.sparkle(), 1700);
    this.sparkle();
  }

  /** Desliga o ambiente do menu (a música continua, para o jogo assumir). */
  stopMenu(): void {
    if (this.menuAmbientTimer) {
      clearInterval(this.menuAmbientTimer);
      this.menuAmbientTimer = null;
    }
    if (this.menuWind) {
      this.menuWind.src.stop();
      this.menuWind.lfo.stop();
      this.menuWind = null;
    }
  }

  private menuAmbienceOn(): boolean {
    return channelEnabled(this.getSettings(), 'ambient');
  }

  /** Nota-cristal esparsa e silenciosa (canal de ambiente). */
  private sparkle(): void {
    if (Math.random() < 0.4) return; // pausas orgânicas
    const amb = this.ambientGain ?? undefined;
    const f = SPARKLE_SCALE[Math.floor(Math.random() * SPARKLE_SCALE.length)];
    this.tone(f, 1.6, 'sine', 0.014 + Math.random() * 0.018, 0, f * 1.03, amb);
    if (Math.random() < 0.45) this.tone(f * 2, 1.3, 'sine', 0.007, 0.06, undefined, amb);
  }

  /** Vento espacial: ruído filtrado com LFO no cutoff. */
  private startWind(): void {
    const ctx = this.ctx;
    if (!ctx || !this.ambientGain || this.menuWind) return;
    const buffer = this.noiseBuffer();
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.55;
    const g = ctx.createGain();
    g.gain.value = 0;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 240;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.ambientGain);
    src.start();
    lfo.start();
    g.gain.linearRampToValueAtTime(0.025, ctx.currentTime + 3);
    this.menuWind = { src, lfo };
  }

  private noiseBuffer(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!this.noiseCache) {
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseCache = buf;
    }
    return this.noiseCache;
  }

  /** Sons de interface (menus, equipar, favoritar) — canal independente. */
  ui(): void {
    if (!this.uiEnabled()) return;
    this.tone(740, 0.05, 'sine', 0.06);
  }

  /** Som de notificação/evento — canal independente. */
  notifySound(): void {
    const s = this.getSettings();
    if (!channelEnabled(s, 'notifications')) return;
    this.tone(880, 0.08, 'sine', 0.07, 0, 1200);
  }

  updateVolumes(): void {
    if (!this.ctx || !this.sfxGain || !this.musicGain || !this.ambientGain) return;
    const s = this.getSettings();
    this.sfxGain.gain.value = channelEnabled(s, 'sfx') ? (s.audio.sfx?.volume ?? 0.7) : 0;
    this.musicGain.gain.value = this.musicOn() ? (s.audio.music?.volume ?? 0.4) : 0;
    this.ambientGain.gain.value = channelEnabled(s, 'ambient') ? (s.audio.ambient?.volume ?? 0.3) : 0;
  }
}

export const audio = new AudioEngine();
