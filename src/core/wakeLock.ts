/**
 * wakeLock — mantém a tela acesa enquanto o jogo está aberto.
 * - Android (app Capacitor): plugin @capacitor-community/keep-awake.
 * - Web/PWA: API Screen Wake Lock (re-adquirida ao voltar ao primeiro plano,
 *   pois o navegador libera o lock quando a aba fica oculta).
 * Silencioso: sem suporte/falha não quebra nada.
 */
import { Capacitor } from '@capacitor/core';

interface WakeLockSentinel {
  release: () => Promise<void>;
  addEventListener?: (type: 'release', cb: () => void) => void;
}

let active = false;
let webLock: WakeLockSentinel | null = null;

async function releaseWeb(): Promise<void> {
  if (!webLock) return;
  const lock = webLock;
  webLock = null;
  try { await lock.release(); } catch { /* já liberado */ }
}

async function acquireWeb(): Promise<void> {
  if (webLock) return;
  const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> } };
  if (!nav.wakeLock) return;
  try {
    const lock = await nav.wakeLock.request('screen');
    webLock = lock;
    lock.addEventListener?.('release', () => { webLock = null; });
  } catch { /* sem permissão/suporte — ignora */ }
}

/** Liga/desliga a tela sempre acesa. No Android usa o plugin nativo; na web, a API Wake Lock. */
export async function setScreenAwake(on: boolean): Promise<void> {
  active = on;
  if (Capacitor.isNativePlatform()) {
    try {
      const { KeepAwake } = await import('@capacitor-community/keep-awake');
      if (on) await KeepAwake.keepAwake();
      else await KeepAwake.allowSleep();
    } catch { /* plugin indisponível */ }
    return;
  }
  if (on) await acquireWeb();
  else await releaseWeb();
}

// na web o lock cai quando a aba fica oculta — re-adquire ao voltar (se ativo)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (active && document.visibilityState === 'visible') void acquireWeb();
  });
}
