/**
 * Telemetria — leitura das métricas agregadas do servidor para o dashboard
 * do Admin Control Center.
 *
 * O servidor coleta os dados sozinho (sem SDK): DAU + instalação a partir do
 * heartbeat de 1 min, retenção D1/D7 dos sets diários e conversão/receita no
 * momento em que um pagamento Pix aprova. Este módulo só LÊ o resumo
 * (GET /api/analytics) para exibir no Admin.
 */
import { pixBackendUrl, pixOnlineEnabled } from '../wallet/mp';
import { GameConfig } from '../config/GameConfig';

export interface AnalyticsDay {
  day: string;
  dau: number;
  installs: number;
  payers: number;
  revenueBRL: number;
  /** Retenção D1/D7 em % (null quando o dia ainda não completou o período). */
  retentionD1: number | null;
  retentionD7: number | null;
}

export interface AnalyticsSummary {
  ok?: boolean;
  days: number;
  series: AnalyticsDay[];
  platforms: { android: number; pc: number; web: number };
}

/** Busca o resumo de telemetria dos últimos `days` dias (padrão 14). */
export async function fetchAnalytics(days = 14): Promise<AnalyticsSummary | null> {
  const base = pixBackendUrl();
  if (!pixOnlineEnabled() || !base) return null;
  try {
    const res = await fetch(`${base}/api/analytics?days=${days}`, {
      headers: { 'x-app-secret': GameConfig.wallet.appSharedSecret },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AnalyticsSummary;
    return data?.ok ? data : null;
  } catch {
    return null;
  }
}

/** Agrega a série em totais do período (últimos N dias completos). */
export function summarizeAnalytics(a: AnalyticsSummary): {
  totalDau: number;
  totalInstalls: number;
  totalPayers: number;
  totalRevenueBRL: number;
  /** % dos DAU que pagaram no período (conversão). */
  conversionPct: number | null;
  /** Média de retenção D1 nos dias completos (null se nenhum). */
  avgRetentionD1: number | null;
  avgRetentionD7: number | null;
} {
  let totalDau = 0;
  let totalInstalls = 0;
  let totalPayers = 0;
  let totalRevenue = 0;
  const d1s: number[] = [];
  const d7s: number[] = [];
  for (const d of a.series) {
    totalDau += d.dau;
    totalInstalls += d.installs;
    totalPayers += d.payers;
    totalRevenue += d.revenueBRL;
    if (d.retentionD1 !== null) d1s.push(d.retentionD1);
    if (d.retentionD7 !== null) d7s.push(d.retentionD7);
  }
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
  return {
    totalDau,
    totalInstalls,
    totalPayers,
    totalRevenueBRL: Math.round(totalRevenue * 100) / 100,
    conversionPct: totalDau > 0 ? Math.round((totalPayers / totalDau) * 1000) / 10 : null,
    avgRetentionD1: avg(d1s),
    avgRetentionD7: avg(d7s),
  };
}
