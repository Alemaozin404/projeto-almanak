/**
 * Sistema de status do jogador — data-driven.
 * No modo offline o status é apenas local (indicado na UI).
 */
export type StatusPreset =
  | 'online' | 'away' | 'afk' | 'dnd' | 'offline'
  | 'jogando' | 'farmando' | 'explorando' | 'evento';

export interface StatusDef {
  id: StatusPreset;
  label: string;
  icon: string;
  color: string;
}

export const STATUS_PRESETS: StatusDef[] = [
  { id: 'online', label: 'Online', icon: '🟢', color: '#3ddc84' },
  { id: 'jogando', label: 'Jogando', icon: '🟢', color: '#3ddc84' },
  { id: 'farmando', label: 'Farmando', icon: '🟢', color: '#3ddc84' },
  { id: 'away', label: 'Ausente', icon: '🟡', color: '#ffd94d' },
  { id: 'explorando', label: 'Explorando', icon: '🟡', color: '#ffd94d' },
  { id: 'afk', label: 'AFK', icon: '🔵', color: '#4da6ff' },
  { id: 'evento', label: 'Em evento', icon: '🟣', color: '#b06cff' },
  { id: 'dnd', label: 'Não perturbe', icon: '🔴', color: '#ff4d6d' },
  { id: 'offline', label: 'Offline', icon: '⚫', color: '#9aa5b1' },
];

export const STATUS_MAP: Record<StatusPreset, StatusDef> = Object.fromEntries(
  STATUS_PRESETS.map((s) => [s.id, s]),
) as Record<StatusPreset, StatusDef>;

export function statusOf(id: StatusPreset): StatusDef {
  return STATUS_MAP[id] ?? STATUS_MAP.online;
}
