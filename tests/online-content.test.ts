/**
 * Hidratação de conteúdo remoto (server → jogo).
 * Simula o que acontece quando GET /api/content chega: os módulos de conteúdo
 * passam a refletir os dados do servidor, e as funções (latestUpdate, etc.)
 * leem os dados online automaticamente.
 */
import { describe, expect, it } from 'vitest';
import { NEWS, hydrateNews, type NewsItem } from '../src/content/news';
import { UPDATES, latestUpdate, type PatchNote } from '../src/content/updates';
import { EVENTS_ALL, hydrateEvents, activeEvents, type EventDef } from '../src/content/events';
import { CODES } from '../src/content/codes';
import { MAINTENANCE_WINDOWS, hydrateMaintenance } from '../src/content/maintenance';
import { applyRemoteContent } from '../src/liveops/RemoteContent';
// NOTE: o Vitest isola os módulos por arquivo de teste — a hidratação feita aqui
// não vaza para os demais testes, então não precisamos restaurar o conteúdo.

describe('Hidratação de conteúdo remoto', () => {
  it('aplica conteúdo do servidor e as funções passam a ler os dados online', () => {
    applyRemoteContent({
      gameVersion: '2.0.0',
      updates: [
        { version: '2.0.0', title: 'Conteúdo online', date: '2026-08-09', description: 'servidor', sections: [] } as PatchNote,
      ],
      news: [
        { id: 'n_online', type: 'update', title: 'Novidade', summary: 's', content: 'c', date: '2026-08-09', icon: '🚀', gradient: 'g' } as NewsItem,
      ],
      banners: [],
      events: [],
      seasons: [],
      codes: [{ id: 'ONLINE10', desc: 'código do servidor', rewards: { gold: '1000' } }],
      maintenance: [{ id: 'm1', reason: 'Manutenção programada', eta: '1 hora', startAt: 0, endAt: 99999999999999 }],
    });

    expect(NEWS).toHaveLength(1);
    expect(NEWS[0].id).toBe('n_online');
    expect(latestUpdate().version).toBe('2.0.0');
    expect(UPDATES).toHaveLength(1);
    expect(CODES.find((c) => c.id === 'ONLINE10')).toBeTruthy();
    expect(MAINTENANCE_WINDOWS).toHaveLength(1);
    // evento de demonstração continua existindo (é sempre anexado)
    expect(activeEvents(new Date())).toHaveLength(1);
  });

  it('normaliza bônus de evento vindo do JSON (string → Decimal)', () => {
    hydrateEvents([
      {
        id: 'online_evt',
        name: 'Evento Online',
        icon: 'x',
        desc: 'd',
        theme: 'tecnologico',
        currency: { id: 'c', name: 'C', icon: 'x' },
        boxId: 'event',
        bonus: { production: '2' },
        bonusText: '2x',
        skins: [],
        tags: [],
        shop: [],
      } as unknown as EventDef,
    ]);

    const ev = EVENTS_ALL.find((e) => e.id === 'online_evt');
    expect(ev).toBeTruthy();
    const bonus = ev!.bonus as { production?: { plus: unknown } };
    expect(typeof bonus.production?.plus).toBe('function'); // Decimal restaurado
  });

  it('dados inválidos não quebram a hidratação (mantém o conteúdo anterior)', () => {
    hydrateNews(undefined as unknown as NewsItem[]);
    expect(NEWS).toHaveLength(1); // mantém o conteúdo online do teste anterior
    hydrateMaintenance(null as unknown as never);
    expect(MAINTENANCE_WINDOWS).toHaveLength(1);
  });
});
