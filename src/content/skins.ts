/**
 * Catálogo de skins — conteúdo data-driven.
 * Adicionar novas skins aqui (ou em arquivos JSON importados) sem tocar no restante do jogo.
 */
import type { GameState } from '../game/types';
import { pct, type PartialModifiers } from '../core/modifiers';
import type { SkinRarityId } from './skinRarities';
import { eventById, eventStatus } from './events';

export type SkinCategory =
  | 'nucleo' | 'interface' | 'cursor' | 'numeros' | 'efeitos'
  | 'pets' | 'perfil' | 'fundo' | 'banner';

export type SkinObtain =
  | 'shop' | 'event' | 'season' | 'founder' | 'achievement'
  | 'challenge' | 'secret' | 'reward' | 'code' | 'prestige'
  | 'pass';

export type SkinStatus = 'available' | 'limited' | 'ended' | 'secret';

export interface CoreVisual { color: string; color2: string; glow: string }
export interface ProfileVisual { frame: string; border: string }
export interface BannerVisual { bg: string; text: string }

export interface SkinVisual {
  core?: CoreVisual;
  background?: string; // CSS background do app
  cursorEmoji?: string; // cursor custom (SVG data-uri gerado do emoji)
  cursorName?: string;
  numbers?: string; // classe do estilo dos números flutuantes
  particle?: string; // cor das partículas
  accent?: string; // override de cor de destaque (interface)
  profile?: ProfileVisual;
  banner?: BannerVisual;
  petTag?: string;
}

export interface SkinDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  rarity: SkinRarityId;
  category: SkinCategory;
  releaseAt?: number;
  availableAt?: number;
  expiresAt?: number;
  obtain: SkinObtain;
  eventId?: string;
  seasonId?: string;
  tags: string[];
  visual: SkinVisual;
  /** Bônus pequeno e opcional — skins são cosméticas por padrão. */
  bonus?: PartialModifiers;
  check: (s: GameState) => boolean;
}

/** Converte 'YYYY-MM-DD HH:mm' em timestamp local (compatível com relógio do jogador). */
export function at(dateStr: string): number {
  const [date, time = '00:00'] = dateStr.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mi || 0).getTime();
}

const ownedSet = (s: GameState) => new Set(s.skins?.owned ?? []);

export const SKINS: SkinDef[] = [
  // ── NÚCLEO ──────────────────────────────────────────────
  {
    id: 'classic', name: 'Clássico', icon: '⚡', desc: 'O visual original do Núcleo.', rarity: 'common', category: 'nucleo',
    obtain: 'shop', tags: ['inicial'],
    visual: { core: { color: '#37f5ff', color2: '#0b6bff', glow: 'rgba(55,245,255,0.7)' } },
    check: () => true,
  },
  {
    id: 'plasma', name: 'Plasma', icon: '🔥', desc: 'Energia em estado de plasma.', rarity: 'rare', category: 'nucleo',
    obtain: 'prestige', tags: ['prestígio'],
    visual: { core: { color: '#ff4d6d', color2: '#ff8a3d', glow: 'rgba(255,77,109,0.7)' } },
    check: (s) => s.prestige.count >= 1,
  },
  {
    id: 'aurora', name: 'Aurora', icon: '🌈', desc: 'Cores dançantes do norte.', rarity: 'epic', category: 'nucleo',
    obtain: 'prestige', tags: ['prestígio'],
    visual: { core: { color: '#3ddc84', color2: '#b06cff', glow: 'rgba(61,220,132,0.7)' } },
    check: (s) => s.prestige.count >= 3,
  },
  {
    id: 'royal', name: 'Ouro Real', icon: '👑', desc: 'Forjado em ouro puro.', rarity: 'legendary', category: 'nucleo',
    obtain: 'prestige', tags: ['ascensão'],
    visual: { core: { color: '#ffe14d', color2: '#ff8a3d', glow: 'rgba(255,225,77,0.7)' }, accent: '#ffd94d' },
    check: (s) => s.ascension.count >= 1,
  },
  {
    id: 'void', name: 'Vazio', icon: '🕳️', desc: 'Um buraco negro consciente.', rarity: 'mythic', category: 'nucleo',
    obtain: 'prestige', tags: ['transcendência'],
    visual: { core: { color: '#ff6bff', color2: '#4a0e4e', glow: 'rgba(255,107,255,0.8)' }, particle: '#ff6bff' },
    check: (s) => s.transcendence.count >= 1,
  },
  {
    id: 'frost', name: 'Gélido', icon: '❄️', desc: 'Congelado no tempo.', rarity: 'rare', category: 'nucleo',
    obtain: 'achievement', tags: ['inverno'],
    visual: { core: { color: '#9adcff', color2: '#ffffff', glow: 'rgba(154,220,255,0.7)' }, particle: '#9adcff' },
    check: (s) => (s.flags.event_participations ?? 0) >= 1,
  },
  {
    id: 'cyber_core', name: 'Núcleo Cyber', icon: '🤖', desc: 'Processador vivo da rede.', rarity: 'legendary', category: 'nucleo',
    obtain: 'event', eventId: 'cyber', releaseAt: at('2026-08-05'), expiresAt: at('2026-08-12 23:59'), tags: ['cyber', 'evento'],
    visual: { core: { color: '#3ddc84', color2: '#0b3d2e', glow: 'rgba(61,220,132,0.8)' }, accent: '#3ddc84' },
    bonus: pct({ critChance: 0.5 }),
    check: (s) => s.flags.skin_cyber_core === 1 || ownedSet(s).has('cyber_core'),
  },
  {
    id: 'lunar_core', name: 'Núcleo Lunar', icon: '🌙', desc: 'Esfera de luz prateada.', rarity: 'celestial', category: 'nucleo',
    obtain: 'event', eventId: 'lunar', releaseAt: at('2026-08-20'), expiresAt: at('2026-08-27 23:59'), tags: ['lunar', 'evento'],
    visual: { core: { color: '#e8e8ff', color2: '#6b6bff', glow: 'rgba(232,232,255,0.8)' } },
    check: (s) => s.flags.skin_lunar_core === 1 || ownedSet(s).has('lunar_core'),
  },
  {
    id: 'founder_core', name: 'Núcleo Fundador', icon: '👑', desc: 'Reservado aos primeiros clicadores.', rarity: 'founder', category: 'nucleo',
    obtain: 'founder', tags: ['fundador'],
    visual: { core: { color: '#ffd94d', color2: '#b8860b', glow: 'rgba(255,217,77,0.9)' } },
    check: (s) => s.flags.founder === 1 || ownedSet(s).has('founder_core'),
  },

  // ── FUNDO ───────────────────────────────────────────────
  {
    id: 'bg_nebula', name: 'Nebulosa', icon: '🌌', desc: 'Um mar de estrelas distantes.', rarity: 'epic', category: 'fundo',
    obtain: 'reward', releaseAt: at('2026-08-07'), tags: ['espaço'],
    visual: { background: 'radial-gradient(1200px 700px at 70% 20%, rgba(176,108,255,0.25), transparent 60%), radial-gradient(900px 600px at 10% 90%, rgba(55,245,255,0.15), transparent 60%), #070b16' },
    check: (s) => s.flags.skin_bg_nebula === 1 || ownedSet(s).has('bg_nebula'),
  },
  {
    id: 'bg_cyber', name: 'Cidade Digital', icon: '🌆', desc: 'Neon por toda parte.', rarity: 'legendary', category: 'fundo',
    obtain: 'event', eventId: 'cyber', releaseAt: at('2026-08-05'), expiresAt: at('2026-08-12 23:59'), tags: ['cyber', 'evento'],
    visual: { background: 'radial-gradient(1000px 600px at 80% 10%, rgba(61,220,132,0.2), transparent 60%), linear-gradient(180deg, #04120c, #070b16 60%), #070b16' },
    check: (s) => s.flags.skin_bg_cyber === 1 || ownedSet(s).has('bg_cyber'),
  },
  {
    id: 'bg_beach', name: 'Pôr do Sol', icon: '🌅', desc: 'Praia eterna de verão.', rarity: 'rare', category: 'fundo',
    obtain: 'event', eventId: 'verao', tags: ['verão'],
    visual: { background: 'radial-gradient(1100px 600px at 60% 0%, rgba(255,138,61,0.25), transparent 60%), linear-gradient(180deg, #1a0f07, #070b16 70%), #070b16' },
    check: (s) => s.flags.skin_bg_beach === 1 || ownedSet(s).has('bg_beach'),
  },
  {
    id: 'bg_void', name: 'Coração do Vazio', icon: '🕳️', desc: 'Onde a luz não chega.', rarity: 'mythic', category: 'fundo',
    obtain: 'prestige', tags: ['transcendência'],
    visual: { background: 'radial-gradient(900px 700px at 50% 30%, rgba(255,107,255,0.12), transparent 65%), #05040a' },
    check: (s) => s.transcendence.count >= 2,
  },

  // ── CURSOR ──────────────────────────────────────────────
  {
    id: 'cursor_bolt', name: 'Cursor Relâmpago', icon: '⚡', desc: 'Um raio segue seu clique.', rarity: 'rare', category: 'cursor',
    obtain: 'code', releaseAt: at('2026-08-07'), tags: ['cursor'],
    visual: { cursorEmoji: '⚡', cursorName: 'cursor-bolt' },
    check: (s) => ownedSet(s).has('cursor_bolt') || s.flags.skin_cursor_bolt === 1,
  },
  {
    id: 'cursor_cyber', name: 'Cursor Neon', icon: '💠', desc: 'Digital e afiado.', rarity: 'event', category: 'cursor',
    obtain: 'event', eventId: 'cyber', releaseAt: at('2026-08-05'), expiresAt: at('2026-08-12 23:59'), tags: ['cyber'],
    visual: { cursorEmoji: '💠', cursorName: 'cursor-cyber' },
    check: (s) => ownedSet(s).has('cursor_cyber') || s.flags.skin_cursor_cyber === 1,
  },
  {
    id: 'cursor_star', name: 'Cursor Estelar', icon: '✨', desc: 'Deixe um rastro de estrelas.', rarity: 'uncommon', category: 'cursor',
    obtain: 'achievement', tags: ['cursor'],
    visual: { cursorEmoji: '✨', cursorName: 'cursor-star' },
    check: (s) => (s.stats.prestigeCount ? Number(s.stats.prestigeCount) : 0) >= 2 || ownedSet(s).has('cursor_star'),
  },

  // ── NÚMEROS ─────────────────────────────────────────────
  {
    id: 'num_gold', name: 'Números de Ouro', icon: '🪙', desc: 'Números flutuantes dourados.', rarity: 'legendary', category: 'numeros',
    obtain: 'reward', tags: ['números'],
    visual: { numbers: 'num-gold' },
    bonus: pct({ goldGain: 5 }),
    check: (s) => ownedSet(s).has('num_gold') || s.flags.skin_num_gold === 1,
  },
  {
    id: 'num_neon', name: 'Números Neon', icon: '🟢', desc: 'Verde terminal, legível e vivo.', rarity: 'event', category: 'numeros',
    obtain: 'event', eventId: 'cyber', releaseAt: at('2026-08-05'), expiresAt: at('2026-08-12 23:59'), tags: ['cyber'],
    visual: { numbers: 'num-neon' },
    check: (s) => ownedSet(s).has('num_neon') || s.flags.skin_num_neon === 1,
  },

  // ── EFEITOS (partículas) ────────────────────────────────
  {
    id: 'fx_fire', name: 'Fagulhas de Fogo', icon: '🧨', desc: 'Seus cliques soltam brasas.', rarity: 'epic', category: 'efeitos',
    obtain: 'prestige', tags: ['efeitos'],
    visual: { particle: '#ff8a3d' },
    check: (s) => s.prestige.count >= 2,
  },
  {
    id: 'fx_cyber', name: 'Circuito', icon: '🔌', desc: 'Partículas em formato de rede.', rarity: 'event', category: 'efeitos',
    obtain: 'event', eventId: 'cyber', releaseAt: at('2026-08-05'), expiresAt: at('2026-08-12 23:59'), tags: ['cyber'],
    visual: { particle: '#3ddc84' },
    check: (s) => ownedSet(s).has('fx_cyber') || s.flags.skin_fx_cyber === 1,
  },
  {
    id: 'fx_snow', name: 'Neve', icon: '🌨️', desc: 'Flocos suaves de inverno.', rarity: 'event', category: 'efeitos',
    obtain: 'event', eventId: 'natal', tags: ['inverno', 'natal'],
    visual: { particle: '#e8f4ff' },
    check: (s) => ownedSet(s).has('fx_snow') || s.flags.skin_fx_snow === 1,
  },

  // ── INTERFACE ───────────────────────────────────────────
  {
    id: 'ui_cyber', name: 'Interface Neon', icon: '🧪', desc: 'Destaques verdes digitais.', rarity: 'event', category: 'interface',
    obtain: 'event', eventId: 'cyber', releaseAt: at('2026-08-05'), expiresAt: at('2026-08-12 23:59'), tags: ['cyber', 'interface'],
    visual: { accent: '#3ddc84' },
    check: (s) => ownedSet(s).has('ui_cyber') || s.flags.skin_ui_cyber === 1,
  },
  {
    id: 'ui_royal', name: 'Interface Real', icon: '🏛️', desc: 'Destaques dourados majestosos.', rarity: 'legendary', category: 'interface',
    obtain: 'prestige', tags: ['ascensão', 'interface'],
    visual: { accent: '#ffd94d' },
    check: (s) => s.ascension.count >= 1,
  },

  // ── PERFIL ──────────────────────────────────────────────
  {
    id: 'pf_celestial', name: 'Moldura Celestial', icon: '🔮', desc: 'Uma moldura que brilha como estrela.', rarity: 'celestial', category: 'perfil',
    obtain: 'challenge', tags: ['perfil', 'desafio'],
    visual: { profile: { frame: 'pf-celestial', border: 'rgba(55,245,255,0.8)' } },
    bonus: pct({ luck: 2 }),
    check: (s) => (s.stats.questsCompleted ? Number(s.stats.questsCompleted) : 0) >= 25 || ownedSet(s).has('pf_celestial'),
  },
  {
    id: 'pf_cyber', name: 'Moldura Cyber', icon: '🖥️', desc: 'Moldura de terminal.', rarity: 'event', category: 'perfil',
    obtain: 'event', eventId: 'cyber', releaseAt: at('2026-08-05'), expiresAt: at('2026-08-12 23:59'), tags: ['cyber', 'perfil'],
    visual: { profile: { frame: 'pf-cyber', border: 'rgba(61,220,132,0.8)' } },
    check: (s) => ownedSet(s).has('pf_cyber') || s.flags.skin_pf_cyber === 1,
  },

  // ── BANNER (banner do jogador) ──────────────────────────
  {
    id: 'banner_cyber', name: 'Banner Neon', icon: '🎴', desc: 'Banner de perfil verde-neon.', rarity: 'event', category: 'banner',
    obtain: 'event', eventId: 'cyber', releaseAt: at('2026-08-05'), expiresAt: at('2026-08-12 23:59'), tags: ['cyber', 'banner'],
    visual: { banner: { bg: 'linear-gradient(90deg,#0b3d2e,#04120c)', text: '#3ddc84' } },
    check: (s) => ownedSet(s).has('banner_cyber') || s.flags.skin_banner_cyber === 1,
  },
  {
    id: 'banner_gold', name: 'Banner Imperial', icon: '🏆', desc: 'Ouro para os campeões.', rarity: 'exclusive', category: 'banner',
    obtain: 'challenge', tags: ['banner', 'desafio'],
    visual: { banner: { bg: 'linear-gradient(90deg,#3a2a05,#0c1630)', text: '#ffd94d' } },
    check: (s) => (s.prestige.count ?? 0) >= 5 || ownedSet(s).has('banner_gold'),
  },

  // ── PETS ────────────────────────────────────────────────
  {
    id: 'pet_angel', name: 'Aura Angelical', icon: '😇', desc: 'Seus pets ganham uma aura dourada.', rarity: 'celestial', category: 'pets',
    obtain: 'challenge', tags: ['pets', 'desafio'],
    visual: { petTag: '✨' },
    check: (s) => Object.keys(s.pets).length >= 10 || ownedSet(s).has('pet_angel'),
  },
  {
    id: 'pet_cyber', name: 'Chips de Pet', icon: '🔩', desc: 'Pets com detalhes cibernéticos.', rarity: 'event', category: 'pets',
    obtain: 'event', eventId: 'cyber', releaseAt: at('2026-08-05'), expiresAt: at('2026-08-12 23:59'), tags: ['cyber', 'pets'],
    visual: { petTag: '🤖' },
    check: (s) => ownedSet(s).has('pet_cyber') || s.flags.skin_pet_cyber === 1,
  },

  // ── SECRETA ─────────────────────────────────────────────
  {
    id: 'secret_void', name: '???', icon: '❓', desc: 'Uma skin que não deveria existir…', rarity: 'exclusive', category: 'nucleo',
    obtain: 'secret', tags: ['secreta'],
    visual: { core: { color: '#000000', color2: '#1a0033', glow: 'rgba(0,0,0,0.9)' }, particle: '#ff6bff' },
    check: (s) => s.flags.secret_found === 1 || ownedSet(s).has('secret_void'),
  },

  // ── PASSE PREMIUM (Update 3.0) — exclusivas do passe, nunca na loja comum ──
  {
    id: 'pass_echo', name: 'Eco Prisma', icon: '🔷', desc: 'Uma distorção de luz do próprio tempo.', rarity: 'mythic', category: 'nucleo',
    obtain: 'pass', tags: ['passe', 'premium'],
    visual: { core: { color: '#7fd8ff', color2: '#3d5cff', glow: 'rgba(127,216,255,0.8)' }, accent: '#7fd8ff', particle: '#7fd8ff' },
    bonus: pct({ critChance: 1 }),
    check: (s) => ownedSet(s).has('pass_echo') || s.flags.skin_pass_echo === 1,
  },
  {
    id: 'pass_core', name: 'Núcleo Imperial', icon: '👑', desc: 'O coração de um império digital.', rarity: 'divine', category: 'nucleo',
    obtain: 'pass', tags: ['passe', 'premium'],
    visual: { core: { color: '#ffe14d', color2: '#ff9d2d', glow: 'rgba(255,225,77,0.9)' }, accent: '#ffe14d' },
    bonus: pct({ goldGain: 10 }),
    check: (s) => ownedSet(s).has('pass_core') || s.flags.skin_pass_core === 1,
  },
  {
    id: 'pass_glitch', name: 'Glitch Temporal', icon: '🕹️', desc: 'A realidade falha ao seu redor.', rarity: 'mythic', category: 'efeitos',
    obtain: 'pass', tags: ['passe', 'premium'],
    visual: { particle: '#ff2dff', numbers: 'num-glitch' },
    bonus: pct({ critChance: 1, luck: 5 }),
    check: (s) => ownedSet(s).has('pass_glitch') || s.flags.skin_pass_glitch === 1,
  },
  {
    id: 'pass_divine', name: 'Aura Divina', icon: '😇', desc: 'Luz pura envolve tudo o que você toca.', rarity: 'divine', category: 'perfil',
    obtain: 'pass', tags: ['passe', 'premium'],
    visual: { profile: { frame: 'pf-divine', border: 'rgba(255,225,77,0.9)' }, petTag: '✨' },
    bonus: pct({ luck: 5 }),
    check: (s) => ownedSet(s).has('pass_divine') || s.flags.skin_pass_divine === 1,
  },
  {
    id: 'pass_omega', name: 'Omega Supremo', icon: '⏳', desc: 'A forma final. Nível 100 do Passe Premium.', rarity: 'exclusive', category: 'fundo',
    obtain: 'pass', tags: ['passe', 'premium', 'lendário'],
    visual: { background: 'radial-gradient(1200px 800px at 50% 20%, rgba(255,225,77,0.18), transparent 60%), radial-gradient(900px 700px at 80% 80%, rgba(127,216,255,0.12), transparent 55%), #05040d', accent: '#ffe14d', particle: '#ffe14d' },
    bonus: pct({ luck: 10, goldGain: 10 }),
    check: (s) => ownedSet(s).has('pass_omega') || s.flags.skin_pass_omega === 1,
  },
  {
    id: 'pass_omega_alt', name: 'Omega Eterno', icon: '🌌', desc: 'O auge absoluto — concedido apenas no nível 100 do Passe Premium.', rarity: 'exclusive', category: 'efeitos',
    obtain: 'pass', tags: ['passe', 'premium', 'lendário'],
    visual: { core: { color: '#c9b6ff', color2: '#ff6bd6', glow: 'rgba(201,182,255,0.9)' }, accent: '#c9b6ff', particle: '#ff6bd6', numbers: 'num-neon' },
    bonus: pct({ critChance: 3, luck: 15, goldGain: 15 }),
    check: (s) => ownedSet(s).has('pass_omega_alt') || s.flags.skin_pass_omega_alt === 1,
  },
];

export const SKIN_MAP: Record<string, SkinDef> = Object.fromEntries(SKINS.map((s) => [s.id, s]));

export const SKIN_CATEGORIES: { id: SkinCategory; name: string; icon: string }[] = [
  { id: 'nucleo', name: 'Núcleo', icon: '⚡' },
  { id: 'fundo', name: 'Fundo', icon: '🌌' },
  { id: 'cursor', name: 'Cursor', icon: '🖱️' },
  { id: 'numeros', name: 'Números', icon: '🔢' },
  { id: 'efeitos', name: 'Efeitos', icon: '✨' },
  { id: 'interface', name: 'Interface', icon: '🎛️' },
  { id: 'perfil', name: 'Perfil', icon: '👤' },
  { id: 'banner', name: 'Banner', icon: '🎴' },
  { id: 'pets', name: 'Pets', icon: '🐾' },
];

export function equippedSkin(state: GameState): SkinDef {
  const idx = state.flags.skinIdx ?? 0;
  return SKINS[idx] ?? SKINS[0];
}

/** Skins possuídas: por compra/conquista OU por condição de progresso. */
export function unlockedSkins(state: GameState): SkinDef[] {
  const owned = new Set(state.skins?.owned ?? []);
  return SKINS.filter((s) => owned.has(s.id) || s.check(state));
}

export function isSkinOwned(state: GameState, id: string): boolean {
  const owned = new Set(state.skins?.owned ?? []);
  return owned.has(id) || SKIN_MAP[id]?.check(state) === true;
}

export function isSkinEquipped(state: GameState, id: string): boolean {
  return equippedSkin(state).id === id;
}

/** Status temporal de uma skin: limitada/eventual, encerrada ou disponível. */
export function skinStatus(def: SkinDef, nowMs: number = Date.now()): SkinStatus {
  if (def.obtain === 'secret') return 'secret';
  if (def.expiresAt && nowMs > def.expiresAt) return 'ended';
  // skins de evento acompanham o status do evento vinculado
  if (def.eventId) {
    const ev = eventById(def.eventId);
    if (ev) {
      const st = eventStatus(ev, nowMs);
      if (st === 'ended' || st === 'archived') return 'ended';
      return 'limited';
    }
  }
  if (def.expiresAt) return 'limited';
  return 'available';
}

// ── Skins ocultas / desconhecidas (Update 3.0) ────────────
/**
 * Índice misterioso estável: baseado na posição no catálogo, nunca no estado.
 * Skin não adquirida = conteúdo oculto (regra absoluta do Update 3.0).
 */
export function mysteryIndex(id: string): number {
  const idx = SKINS.findIndex((s) => s.id === id);
  return idx >= 0 ? idx + 1 : 999;
}

/** A skin está revelada para o jogador? (adquirida = revelada). */
export function isSkinRevealed(state: GameState, id: string): boolean {
  const owned = new Set(state.skins?.owned ?? []);
  return owned.has(id) || SKIN_MAP[id]?.check(state) === true;
}

/**
 * Apresentação de uma skin não adquirida: nunca revela nome/imagem/efeitos.
 * Retorna rótulo seguro (silhueta + número misterioso).
 */
export function mysteryLabel(id: string): string {
  return `??? #${String(mysteryIndex(id)).padStart(3, '0')}`;
}

/** Skin do passe premium ainda não revelada: rótulo de recompensa premium. */
export function premiumLockLabel(): string {
  return '🔒 RECOMPENSA PREMIUM';
}

/** Skins não adquiridas (ocultas). */
export function hiddenSkins(state: GameState): SkinDef[] {
  return SKINS.filter((s) => !isSkinRevealed(state, s.id));
}

/** Total real de skins (usado apenas internamente — a UI pode ocultar). */
export function skinCatalogTotal(): number {
  return SKINS.length;
}

/** Progresso da coleção progressiva: reveladas vs desconhecidas. */
export function collectionSkinProgress(state: GameState): { revealed: number; unknown: number } {
  const revealed = SKINS.filter((s) => isSkinRevealed(state, s.id)).length;
  return { revealed, unknown: SKINS.length - revealed };
}
