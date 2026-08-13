import { Capacitor } from '@capacitor/core';

/** true quando o jogo roda dentro do app Android (WebView do Capacitor). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Fecha o jogo: no app Android encerra o processo de verdade (App.exitApp);
 * no desktop/navegador (Electron/site) usa window.close().
 */
export function quitApp(): void {
  if (isNativeApp()) {
    void import('@capacitor/app').then(({ App }) => App.exitApp());
  } else {
    window.close();
  }
}
