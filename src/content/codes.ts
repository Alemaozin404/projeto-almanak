/**
 * Códigos resgatáveis — conteúdo local pré-configurado (jogo offline).
 * Cada código pode ser usado uma vez por save.
 */
import type { EventRewardSpec } from './rewards';

export interface CodeDef {
  id: string; // o próprio código (maiúsculas)
  desc: string;
  rewards: EventRewardSpec;
  expiresAt?: number;
  /** Quantidade de usos por save (padrão 1). */
  limit?: number;
}

function at(dateStr: string): number {
  const [date, time = '00:00'] = dateStr.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mi] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mi || 0).getTime();
}

export let CODES: CodeDef[] = [
  { id: 'WELCOME2', desc: 'Boas-vindas à 2.0: moedas e uma skin dourada.', rewards: { gold: '1000000', skins: ['num_gold'] }, expiresAt: at('2027-01-01 00:00') },
  { id: 'CYBER2026', desc: 'Pacote Cyber: moedas, caixa do evento e passe premium do Cyber.', rewards: { gold: '2500000', boxes: [{ boxId: 'event', qty: 2 }], premiumPasses: ['cyber'], skins: ['cursor_cyber'] }, expiresAt: at('2026-08-12 23:59') },
  { id: 'UPDATE210', desc: 'Presente de atualização: moedas e fragmentos.', rewards: { gold: '1500000', fragments: 50, consumables: [{ id: 'pet_food', qty: 5 }] }, expiresAt: at('2026-12-31 23:59') },
  { id: 'FOUNDER', desc: 'Skin Fundador exclusiva.', rewards: { skins: ['founder_core'], flags: { founder: 1 } }, expiresAt: at('2027-01-01 00:00') },
];

/** Hidrata os códigos com dados do servidor (GET /api/content). */
export function hydrateCodes(items: CodeDef[]): void {
  CODES = Array.isArray(items)
    ? items.filter((c) => c && typeof c.id === 'string')
    : CODES;
}
