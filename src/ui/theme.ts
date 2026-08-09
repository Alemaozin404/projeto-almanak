import type { ThemeId } from '../game/types';

const THEME_KEY = 'nucleo-theme';

/** Aplica o tema no <body> (cobre o menu e o jogo) e guarda a última escolha. */
export function applyTheme(theme: ThemeId): void {
  try {
    document.body.classList.toggle('theme-neon', theme === 'neon');
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ambiente sem localStorage */
  }
}

/** Tema persistido da última sessão (usado no menu, antes de carregar um save). */
export function storedTheme(): ThemeId {
  try {
    return localStorage.getItem(THEME_KEY) === 'neon' ? 'neon' : 'default';
  } catch {
    return 'default';
  }
}
