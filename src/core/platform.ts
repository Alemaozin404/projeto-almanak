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

/**
 * Compartilha conteúdo com o share sheet NATIVO do sistema (Android/iOS).
 * No desktop/navegador tenta navigator.share; sem suporte → copia o texto
 * para a área de transferência e avisa (fallback silencioso).
 */
export async function nativeShare(opts: { title?: string; text?: string; url?: string }): Promise<{ ok: boolean; method: 'native' | 'web' | 'clipboard' }> {
  if (isNativeApp()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: opts.title, text: opts.text, url: opts.url });
      return { ok: true, method: 'native' };
    } catch {
      return { ok: false, method: 'native' };
    }
  }
  try {
    if (navigator.share) {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
      return { ok: true, method: 'web' };
    }
  } catch {
    /* usuário cancelou ou sem suporte — cai no clipboard */
  }
  try {
    await navigator.clipboard?.writeText(opts.url ?? opts.text ?? '');
    return { ok: true, method: 'clipboard' };
  } catch {
    return { ok: false, method: 'clipboard' };
  }
}

/**
 * Abre um link externo: no app Android usa o browser/custom-tab do sistema
 * (sai do WebView — o app não é um navegador); no desktop/navegador usa
 * window.open. Retorna false se não conseguiu (link vazio).
 */
export async function openExternal(url: string): Promise<boolean> {
  if (!url) return false;
  if (isNativeApp()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url });
      return true;
    } catch {
      return false;
    }
  }
  window.open(url, '_blank', 'noopener');
  return true;
}

/**
 * Abre o seletor de arquivos (input type=file) e lê o conteúdo como texto —
 * funciona no navegador E no WebView do app Android (import de save .ncsave).
 * Resolve null se o usuário cancelou.
 */
export function pickAndReadTextFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ncsave,.txt,text/plain';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

export async function exportTextFile(filename: string, text: string): Promise<{ ok: boolean; reason?: string }> {
  if (isNativeApp()) {
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      // grava em Cache (privado) e compartilha — o share sheet deixa salvar onde quiser
      const result = await Filesystem.writeFile({
        path: filename,
        data: text,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      await Filesystem.getUri({ path: filename, directory: Directory.Cache });
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: filename, url: result.uri });
      return { ok: true };
    } catch {
      return { ok: false, reason: 'Falha ao compartilhar o arquivo' };
    }
  }
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true };
}
