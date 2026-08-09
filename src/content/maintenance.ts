/**
 * Janelas de manutenção — conteúdo data-driven.
 *
 * Diferente das demais fontes, este arquivo é exportado ao servidor
 * (server/content.json) e o jogo baixa as janelas via GET /api/meta, permitindo
 * ABRIR/FECHAR manutenção sem atualizar o app:
 *   1. Adicione uma janela aqui (ou edite direto no servidor, se preferir);
 *   2. Rode `npm run content:export` e commite o content.json;
 *   3. O app detecta a janela ativa e exibe a tela de manutenção.
 *
 * Vazio por padrão — sem janelas programadas.
 */
export interface MaintenanceWindow {
  id: string;
  reason: string;
  eta: string; // texto de previsão
  startAt: number;
  endAt: number;
}

export let MAINTENANCE_WINDOWS: MaintenanceWindow[] = [];

/** Hidrata com janelas vindas do servidor (JSON). */
export function hydrateMaintenance(windows: MaintenanceWindow[]): void {
  MAINTENANCE_WINDOWS = Array.isArray(windows)
    ? windows.filter((w) => w && typeof w.id === 'string' && Number.isFinite(w.startAt) && Number.isFinite(w.endAt))
    : MAINTENANCE_WINDOWS;
}
