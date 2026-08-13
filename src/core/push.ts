/**
 * Push notifications (FCM) — app Android.
 *
 * Fluxo: o app pede permissão e registra um token no Firebase (via plugin
 * @capacitor/push-notifications). Quando o jogador conecta a CONTA, o token é
 * enviado ao servidor (POST /api/push/token) — o servidor usa para notificar
 * presentes, eventos e manutenção. Sem conta conectada o token fica local
 * (nenhum envio). Sem FCM no build (sem google-services.json) tudo falha
 * silenciosamente — o jogo nunca quebra por causa de push.
 *
 * O logout limpa o token no servidor (server/accounts.js), então o app não
 * recebe notificações depois de deslogar.
 */
import { isNativeApp, platformName } from './platform';
import { getSession, subscribeAccountSession } from '../online/account';
import { apiFetch } from '../online/api';

/** Último token FCM recebido do plugin (mesmo sem conta conectada). */
let currentToken: string | null = null;
/** Evita duplicar listeners/registro em re-execuções. */
let started = false;

/** Zera o estado interno (testes — isolamento entre execuções). */
export function resetPushState(): void {
  currentToken = null;
  started = false;
}

/** Envia (ou remove) o token no servidor — só com conta conectada. */
async function sendToken(token: string | null): Promise<void> {
  const session = getSession();
  if (!session) return; // sem conta → o token não é registrado em lugar nenhum
  try {
    await apiFetch('/api/push/token', {
      method: 'POST',
      body: JSON.stringify({ token: token ?? '', platform: platformName() }),
    });
  } catch {
    /* falha de rede — o próximo registro tenta de novo */
  }
}

/** Token FCM atual ('' se nunca chegou). */
export function pushToken(): string | null {
  return currentToken;
}

/**
 * Remove o token do servidor (toggle de notificações desligado). O logout já
 * limpa sozinho no servidor — aqui é só para o caso de desligar sem sair.
 */
export async function unregisterPushToken(): Promise<void> {
  currentToken = null;
  await sendToken(null);
}

/**
 * Inicia o fluxo de push (somente Android, idempotente): pede permissão,
 * registra o token e o sincroniza com a conta (se conectar depois, envia).
 */
export async function startPushRegistration(): Promise<void> {
  if (!isNativeApp() || started) return;
  started = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    void PushNotifications.addListener('registration', (r) => {
      currentToken = r.value;
      void sendToken(currentToken);
    });
    void PushNotifications.addListener('registrationError', () => {
      currentToken = null;
    });
    // se a conta conectar DEPOIS do token chegar, reenvia na hora
    subscribeAccountSession(() => {
      if (getSession() && currentToken) void sendToken(currentToken);
    });
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive === 'granted') {
      await PushNotifications.register();
    }
  } catch {
    /* sem permissão/plugin — silencioso */
  }
}
