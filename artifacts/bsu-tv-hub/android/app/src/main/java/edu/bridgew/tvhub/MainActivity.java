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
                getBridge().getWebView().evaluateJavascript(
                    "(function(){" +
                    "  var e=new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true});" +
                    "  window.dispatchEvent(e);" +
                    "  document.dispatchEvent(e);" +
                    "})()", null
                );
            }
            return true; // consume both ACTION_DOWN and ACTION_UP
        }
        return super.dispatchKeyEvent(event);
    }

    /** Safety net — should never be reached now that dispatchKeyEvent returns true for BACK. */
    @Override
    public void onBackPressed() {}
}
