package com.nucleo.clicker;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

/**
 * MainActivity — shell nativo do jogo.
 *
 * O jogo roda num WebView (Capacitor), mas com configuração de app nativo:
 * - sem bounce/overscroll (rolando igual a app, não a navegador);
 * - sem scrollbars visíveis (a UI do jogo já rola por conta própria);
 * - fundo do tema (escuro) no WebView — sem flash claro no boot.
 *
 * O restante do comportamento nativo (splash, status bar, orientação, haptics,
 * back, teclado com adjustResize) vem do manifest + plugins do Capacitor.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        if (webView != null) {
            // rolagem com cara de app: sem efeito bounce e sem glow de navegador
            webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
            webView.setVerticalScrollBarEnabled(false);
            webView.setHorizontalScrollBarEnabled(false);
            // fundo do tema (#070b16) — o HTML é escuro; evita flash claro
            webView.setBackgroundColor(Color.rgb(7, 11, 22));
        }
    }
}
