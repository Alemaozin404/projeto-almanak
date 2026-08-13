/**
 * Aviso local "seu ganho offline está pronto" (Android).
 *
 * Quando o app vai para o segundo plano, agenda uma notificação LOCAL (sem
 * servidor, sem FCM) para o momento em que o teto offline for atingido —
 * lastSeen + offlineCapHours. Ao voltar para o app, o aviso é cancelado.
 *
 * O teto e a produção são lidos do engine na hora (configuração atual do save);
 * sem produção, nenhum aviso é agendado. Tudo falha silenciosamente.
 */
import { isNativeApp } from './platform';
import type { GameEngine } from '../game/engine';

/** Id fixo — uma única notificação agendada por vez (substitui a anterior). */
const NOTIFY_ID = 1976;

/** Agenda o aviso local de ganho offline pronto (Android, app em segundo plano). */
export async function scheduleOfflineReadyNotify(e: GameEngine | null): Promise<void> {
  if (!isNativeApp() || !e) return;
  const prefs = e.state.settings.notifications;
  if (prefs.offlineNotify === false) return;
  const capSeconds = (e.state.settings.offlineCapHours ?? 12) * 3600;
  const elapsedSec = Math.max(0, (Date.now() - e.state.lastSeen) / 1000);
  if (elapsedSec >= capSeconds) return; // teto já atingido — nada a avisar
  // simula 60s a mais para contornar o piso do computeOffline e conferir se há
  // produção real (null = sem produção → sem aviso)
  const probe = e.computeOffline(Date.now() + 60_000);
  if (!probe) return;
  const inMs = (capSeconds - elapsedSec) * 1000;
  if (inMs < 60_000) return; // já quase cheio — não compensa agendar
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.schedule({
      notifications: [
        {
          id: NOTIFY_ID,
          title: '⚡ Seu Núcleo produziu bastante!',
          body: 'Seu ganho offline está pronto — volte para coletar energia e moedas.',
          schedule: { at: new Date(Date.now() + inMs), allowWhileIdle: true },
        },
      ],
    });
  } catch {
    /* sem permissão de notificação — silencioso */
  }
}

/** Cancela o aviso agendado (app voltou para a frente). */
export async function cancelOfflineReadyNotify(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: [{ id: NOTIFY_ID }] });
  } catch {
    /* silencioso */
  }
}
