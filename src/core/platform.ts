import { Capacitor } from '@capacitor/core';

/** true quando o jogo roda dentro do app Android (WebView do Capacitor). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export type PlayerPlatform = 'android' | 'pc' | 'web';

/**
 * Plataforma atual do jogador — usada no ranking global (filtro por plataforma)
 * e no registro do token de push. android = app Capacitor, pc = Electron,
 * web = navegador (site/PWA).
 */
export function platformName(): PlayerPlatform {
  if (isNativeApp()) return 'android';
  try {
    if (typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent)) return 'pc';
  } catch {
    /* sem navigator (SSR/testes) */
  }
  return 'web';
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

/**
 * Inicialização do "shell" nativo do app (roda uma vez, no boot):
 * - status bar escura com ícones claros (combina com o tema do jogo);
 * - orientação travada em portrait no Android (jogo de toque).
 */
export function initNativeShell(): void {
  if (!isNativeApp()) return;
  void import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
    void StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    void StatusBar.setBackgroundColor({ color: '#070b16' }).catch(() => {});
  });
  void import('@capacitor/screen-orientation').then(({ ScreenOrientation }) => {
    void ScreenOrientation.lock({ orientation: 'portrait-primary' }).catch(() => {});
  });
}

/** Vibração leve — toques em botões/navegação (nativo; no-op no desktop). */
export function hapticLight(): void {
  if (!isNativeApp()) return;
  void import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}));
}

/** Vibração média — ações principais (clique no Núcleo). */
export function hapticImpact(): void {
  if (!isNativeApp()) return;
  void import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}));
}
