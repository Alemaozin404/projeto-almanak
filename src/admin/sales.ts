/**
 * Sistema de venda de Diamantes 💎 e Moedas 🪙 do Admin Control Center.
 *
 * O administrador cria pacotes (combinando diamantes e/ou moedas) ou venda
 * separada (só diamante, só coin) e pode publicá-los no servidor online
 * (`POST /api/packs`) para os jogadores comprarem via Pix. O preço em R$ é
 * sempre definido aqui e revalidado pelo servidor — o cliente nunca arbitra
 * valor.
 *
 * Inclui a função de TESTE Pix: cobrança real de R$ 0,01 por 1 diamante
 * (gateway online) ou simulação local — valida o fluxo completo de ponta a
 * ponta antes de configurar preços reais.
 */
import { GameConfig } from '../config/GameConfig';
import type { CoinPackDef } from '../shop/packs';
import { pixBackendUrl, pixOnlineEnabled } from '../wallet/mp';
import { audit } from './audit';

/** Pacote criado pelo admin — CoinPackDef + conteúdo misto + controle de visibilidade. */
export interface AdminPack extends CoinPackDef {
  /** false = não aparece na loja. */
  enabled: boolean;
  /** Timestamp da última edição local. */
  updatedAt: number;
  /** Créditos 💳 concedidos (pacotes mistos). */
  credits?: number;
  /** XP ⚡ do passe premium concedido (pacotes mistos). */
  xp?: number;
  /** Skins desbloqueadas (IDs do catálogo — pacotes mistos). */
  skins?: string[];
  /** Caixas 📦 concedidas (pacotes mistos). */
  boxes?: { boxId: string; qty: number }[];
  /** Títulos 🏆 exclusivos (IDs do catálogo — pacotes mistos). */
  titles?: string[];
  /** Badges de avatar exclusivas (IDs do catálogo — pacotes mistos). */
  badges?: string[];
}

export interface PackValidation {
  ok: boolean;
  errors: string[];
}

const KEY = GameConfig.admin.salesStorageKey;

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadPacks(): AdminPack[] {
  const st = storage();
  if (!st) return [];
  try {
    const raw = st.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.priceBRL === 'number')
      : [];
  } catch {
    return [];
  }
}

function savePacks(items: AdminPack[]): void {
  storage()?.setItem(KEY, JSON.stringify(items));
}

/** Gera um id único baseado no nome (slug) + sufixo curto. */
export function packIdFromName(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'pacote';
  return `${base}_${Date.now().toString(36).slice(-4)}`;
}

/**
 * Validação de pacote. Regras:
 * - nome obrigatório;
 * - preço entre 0,01 e 1000 reais (o Pix real exige mínimo de 1 centavo);
 * - deve entregar PELO MENOS um item (fichas, moedas, diamantes, créditos,
 *   XP, skins ou caixas);
 * - quantidades não negativas e limitadas (anti-abuso).
 */
export function validatePack(p: Partial<AdminPack>): PackValidation {
  const errors: string[] = [];
  if (!p.name || p.name.trim().length === 0) errors.push('Nome obrigatório');
  const price = p.priceBRL;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0.01 || price > 1000) {
    errors.push('Preço deve ser entre R$ 0,01 e R$ 1.000');
  }
  const gold = Number(p.gold ?? 0);
  const diamonds = Number(p.diamonds ?? 0);
  if (!Number.isFinite(gold) || gold < 0 || gold > 1e15) errors.push('Moedas inválidas');
  if (!Number.isFinite(diamonds) || diamonds < 0 || diamonds > 1e7) errors.push('Diamantes inválidos');
  const credits = Number(p.credits ?? 0);
  if (!Number.isFinite(credits) || credits < 0 || credits > 1e7) errors.push('Créditos inválidos');
  const xp = Number(p.xp ?? 0);
  if (!Number.isFinite(xp) || xp < 0 || xp > 1e6) errors.push('XP inválido');
  const skins = Array.isArray(p.skins) ? p.skins : [];
  if (skins.length > 20) errors.push('Máximo de 20 skins por pacote');
  for (const sk of skins) {
    if (typeof sk !== 'string' || !/^[a-z0-9_]{1,40}$/.test(sk)) errors.push(`Skin inválida: ${sk}`);
  }
  const boxes = Array.isArray(p.boxes) ? p.boxes : [];
  if (boxes.length > 20) errors.push('Máximo de 20 caixas por pacote');
  for (const b of boxes) {
    if (!b || typeof b.boxId !== 'string' || b.boxId.length === 0 || b.boxId.length > 40) errors.push('Caixa inválida (id)');
    if (!Number.isInteger(b?.qty) || (b?.qty ?? 0) < 1 || (b?.qty ?? 0) > 1000) errors.push('Quantidade de caixa inválida');
  }
  const titles = Array.isArray(p.titles) ? p.titles : [];
  if (titles.length > 20) errors.push('Máximo de 20 títulos por pacote');
  for (const t of titles) {
    if (typeof t !== 'string' || !/^[a-z0-9_]{1,40}$/.test(t)) errors.push(`Título inválido: ${t}`);
  }
  const badges = Array.isArray(p.badges) ? p.badges : [];
  if (badges.length > 20) errors.push('Máximo de 20 badges por pacote');
  for (const b of badges) {
    if (typeof b !== 'string' || !/^[a-z0-9_]{1,40}$/.test(b)) errors.push(`Badge inválida: ${b}`);
  }
  const hasContent = gold > 0 || diamonds > 0 || credits > 0 || xp > 0 || skins.length > 0 || boxes.length > 0 || titles.length > 0 || badges.length > 0;
  if (!hasContent) errors.push('O pacote deve entregar pelo menos um item (moedas, diamantes, créditos, XP, skin, caixa, título ou badge)');
  if (gold > 0 && diamonds > 0 && !Number.isInteger(diamonds)) errors.push('Diamantes devem ser inteiros');
  return { ok: errors.length === 0, errors };
}

export function savePack(p: AdminPack): { ok: boolean; errors: string[] } {
  const v = validatePack(p);
  if (!v.ok) return v;
  const items = loadPacks();
  const idx = items.findIndex((x) => x.id === p.id);
  const fresh: AdminPack = { ...p, updatedAt: Date.now() };
  if (idx >= 0) items[idx] = fresh;
  else items.push(fresh);
  savePacks(items);
  const parts = [
    Number(p.gold) > 0 ? `${p.gold}🪙` : '',
    p.diamonds > 0 ? `${p.diamonds}💎` : '',
    p.credits ? `${p.credits}💳` : '',
    p.xp ? `${p.xp}⚡` : '',
    p.skins?.length ? `${p.skins.length}🎨` : '',
    p.boxes?.length ? `${p.boxes.reduce((a, b) => a + b.qty, 0)}📦` : '',
    p.titles?.length ? `${p.titles.length}🏆` : '',
    p.badges?.length ? `${p.badges.length}🔖` : '',
  ].filter(Boolean).join(' + ');
  audit({ actor: 'SUPER_ADMIN', action: 'CONTENT_SAVE', target: `pack:${p.id}`, detail: `${p.name} — R$ ${p.priceBRL} (${parts || 'sem conteúdo'})`, result: 'ok' });
  return { ok: true, errors: [] };
}

export function deletePack(id: string): { ok: boolean; reason?: string } {
  const items = loadPacks();
  const next = items.filter((x) => x.id !== id);
  if (next.length === items.length) return { ok: false, reason: 'Pacote inexistente' };
  savePacks(next);
  audit({ actor: 'SUPER_ADMIN', action: 'CONTENT_SAVE', target: `pack:${id}`, detail: 'excluído', result: 'ok' });
  return { ok: true };
}

export function togglePack(id: string): { ok: boolean; reason?: string } {
  const items = loadPacks();
  const p = items.find((x) => x.id === id);
  if (!p) return { ok: false, reason: 'Pacote inexistente' };
  p.enabled = !p.enabled;
  p.updatedAt = Date.now();
  savePacks(items);
  return { ok: true };
}

// ── sync com o servidor online ─────────────────────────────

interface PacksResponse {
  ok?: boolean;
  packs?: AdminPack[];
}

/** Busca os pacotes publicados no servidor (lista para a loja). */
export async function fetchServerPacks(): Promise<AdminPack[]> {
  const base = pixBackendUrl();
  if (!base) return [];
  try {
    const res = await fetch(`${base}/api/packs`, {
      headers: { 'x-app-secret': GameConfig.wallet.appSharedSecret },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as PacksResponse;
    return Array.isArray(data.packs) ? data.packs : [];
  } catch {
    return [];
  }
}

/** Publica/atualiza um pacote no servidor (o preço é validado lá também). */
export async function publishPackToServer(p: AdminPack): Promise<{ ok: boolean; reason?: string }> {
  const base = pixBackendUrl();
  if (!base) return { ok: false, reason: 'Backend Pix não configurado' };
  try {
    const res = await fetch(`${base}/api/packs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-app-secret': GameConfig.wallet.appSharedSecret },
      body: JSON.stringify(p),
    });
    const data = (await res.json()) as { ok?: boolean; reason?: string };
    if (!res.ok || data.ok !== true) return { ok: false, reason: data.reason ?? `Servidor recusou (${res.status})` };
    audit({ actor: 'SUPER_ADMIN', action: 'CONTENT_PUBLISH', target: `pack:${p.id}`, detail: `publicado: ${p.name} — R$ ${p.priceBRL}`, result: 'ok' });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

/** Remove um pacote do servidor. */
export async function deletePackFromServer(id: string): Promise<{ ok: boolean; reason?: string }> {
  const base = pixBackendUrl();
  if (!base) return { ok: false, reason: 'Backend Pix não configurado' };
  try {
    const res = await fetch(`${base}/api/packs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-app-secret': GameConfig.wallet.appSharedSecret },
    });
    const data = (await res.json()) as { ok?: boolean; reason?: string };
    if (!res.ok || data.ok !== true) return { ok: false, reason: data.reason ?? `Servidor recusou (${res.status})` };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Sem conexão com o servidor' };
  }
}

/** Pacotes habilitados que aparecem na loja: locais + publicados no servidor. */
export async function shopPacks(): Promise<AdminPack[]> {
  const local = loadPacks().filter((p) => p.enabled);
  const remote = await fetchServerPacks();
  const byId = new Map<string, AdminPack>();
  for (const p of local) byId.set(p.id, p);
  for (const p of remote) if (p.enabled !== false) byId.set(p.id, p);
  return [...byId.values()];
}

// ── função de TESTE Pix: R$ 0,01 → 1 diamante ──────────────

/** Pacote de teste — 1 diamante por R$ 0,01 (o servidor aceita este packId). */
export function testPack(): CoinPackDef {
  return {
    id: GameConfig.wallet.pixTestPackId,
    name: 'Teste Pix · 1💎',
    icon: '🧪',
    priceBRL: GameConfig.wallet.pixTestPriceBRL,
    gold: '0',
    diamonds: GameConfig.wallet.pixTestDiamonds,
    tag: 'Teste',
  };
}

/** O teste funciona com gateway online (cobrança real de 1 centavo) ou local. */
export function pixTestEnabled(): boolean {
  return pixOnlineEnabled();
}
