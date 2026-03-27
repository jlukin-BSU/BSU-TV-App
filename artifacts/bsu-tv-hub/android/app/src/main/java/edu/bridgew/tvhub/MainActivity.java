package edu.bridgew.tvhub;

import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(TvInputPlugin.class);
        registerPlugin(AppLauncherPlugin.class);
        registerPlugin(ScreenOffPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /**
     * Intercept KEYCODE_BACK at the earliest point in the event pipeline.
     *
     * Android swallows KEYCODE_BACK before it can reach the WebView as a
     * JavaScript keydown event, so we manually inject a synthetic Escape
     * keydown into the page on the ACTION_UP stroke and then consume the
     * native event entirely (returning true prevents onBackPressed from
     * firing and keeps the kiosk alive).
     *
     * All back/escape handling — dismiss overlays, admin 5-press trigger —
     * lives in JavaScript and is driven by the synthetic event.
     */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_BACK) {
            if (event.getAction() == KeyEvent.ACTION_UP) {
                // Create a fresh event object each time — a dispatched event cannot be reused.
                // Dispatch to document so it bubbles up through document → window,
                // reaching all window.addEventListener("keydown") handlers in the page.
                try {
                    // Channel 1: Capacitor's native bridge event — fires a "backbutton" event
                    // on the window so JS can listen for it directly.
                    getBridge().triggerJSEvent("backbutton", "window");

                    // Channel 2: Synthetic keydown Escape injected into the document so that
                    // all existing window.addEventListener("keydown") handlers also fire.
                    android.webkit.WebView wv = getBridge().getWebView();
                    if (wv != null) {
                        wv.evaluateJavascript(
                            "document.dispatchEvent(" +
                            "  new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true})" +
                            ");", null
                        );
                    }
                } catch (Exception ignored) {}
            }
            return true; // consume both ACTION_DOWN and ACTION_UP
        }
        return super.dispatchKeyEvent(event);
    }

    /** Safety net — should never be reached now that dispatchKeyEvent returns true for BACK. */
    @Override
    public void onBackPressed() {}
}
