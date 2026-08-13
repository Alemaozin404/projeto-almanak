import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Configuração do Capacitor — o app Android é um WebView que roda o MESMO
 * build web do jogo (dist/). 100% online: o jogo fala com o backend do Vercel
 * (save na nuvem, ranking, conteúdo ao vivo, Pix) igual ao site.
 */
const config: CapacitorConfig = {
  appId: 'com.nucleo.clicker',
  appName: 'Núcleo Clicker',
  webDir: 'dist',
  android: {
    // fundo escuro do tema — evita flash branco na splash/boot
    backgroundColor: '#070b16',
  },
};

export default config;
