package edu.bridgew.tvhub;

import android.util.Log;
import android.view.KeyEvent;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "BSUTVHub";

    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(TvInputPlugin.class);
        registerPlugin(AppLauncherPlugin.class);
        registerPlugin(ScreenOffPlugin.class);
        registerPlugin(SimpleIpControlPlugin.class);
        super.onCreate(savedInstanceState);

        // DEV ONLY — accept self-signed certs from relay server. Remove before production.
        android.webkit.WebView wv = getBridge().getWebView();
        if (wv != null) {
            wv.setWebViewClient(new android.webkit.WebViewClient() {
                @Override
                public void onReceivedSslError(android.webkit.WebView view, android.webkit.SslErrorHandler handler, android.net.http.SslError error) {
                    handler.proceed();
                }
            });
        }
    }

    // -------------------------------------------------------------------------
    // Back-button: intercept at every hook so the app never exits.
    // Injects a synthetic Escape into the WebView so JS overlay-dismiss works.
    // -------------------------------------------------------------------------

    private void injectEscapeToWebView() {
        try {
            android.webkit.WebView wv = getBridge().getWebView();
            if (wv != null) {
                wv.post(() -> wv.evaluateJavascript(
                    "(function(){" +
                    "  var e=new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true});" +
                    "  document.dispatchEvent(e);" +
                    "  window.dispatchEvent(e);" +
                    "})()", null
                ));
            }
        } catch (Exception e) {
            Log.e(TAG, "injectEscapeToWebView failed", e);
        }
    }

    private boolean isBackKey(int keyCode) {
        return keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE;
    }

    // -------------------------------------------------------------------------
    // Color buttons: intercept KEYCODE_PROG_RED/GREEN/YELLOW/BLUE and fire a
    // custom "tv:color" CustomEvent into the WebView.  No standard JS mapping
    // exists for these keys so we must bridge them manually.
    // -------------------------------------------------------------------------

    private static final int KEYCODE_PROG_RED    = 183;
    private static final int KEYCODE_PROG_GREEN  = 184;
    private static final int KEYCODE_PROG_YELLOW = 185;
    private static final int KEYCODE_PROG_BLUE   = 186;

    private String colorName(int keyCode) {
        switch (keyCode) {
            case KEYCODE_PROG_RED:    return "red";
            case KEYCODE_PROG_GREEN:  return "green";
            case KEYCODE_PROG_YELLOW: return "yellow";
            case KEYCODE_PROG_BLUE:   return "blue";
            default:                  return null;
        }
    }

    private void injectColorEventToWebView(String color) {
        try {
            android.webkit.WebView wv = getBridge().getWebView();
            if (wv != null) {
                Log.d(TAG, "injectColorEvent: " + color);
                final String js =
                    "window.dispatchEvent(new CustomEvent('tv:color',{detail:{color:'" + color + "'}}));";
                wv.post(() -> wv.evaluateJavascript(js, null));
            }
        } catch (Exception e) {
            Log.e(TAG, "injectColorEvent failed", e);
        }
    }

    // -------------------------------------------------------------------------
    // dispatchKeyEvent — first in the chain; handles all cases
    // -------------------------------------------------------------------------

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();

        if (isBackKey(keyCode)) {
            Log.d(TAG, "dispatchKeyEvent BACK action=" + event.getAction());
            if (event.getAction() == KeyEvent.ACTION_UP) {
                injectEscapeToWebView();
            }
            return true;
        }

        String color = colorName(keyCode);
        if (color != null) {
            Log.d(TAG, "dispatchKeyEvent COLOR=" + color + " action=" + event.getAction());
            if (event.getAction() == KeyEvent.ACTION_UP) {
                injectColorEventToWebView(color);
            }
            return true; // consume so the system doesn't try to handle it
        }

        return super.dispatchKeyEvent(event);
    }

    /** Fallback for emulator routing. */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (isBackKey(keyCode) || colorName(keyCode) != null) return true;
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (isBackKey(keyCode)) {
            injectEscapeToWebView();
            return true;
        }
        String color = colorName(keyCode);
        if (color != null) {
            injectColorEventToWebView(color);
            return true;
        }
        return super.onKeyUp(keyCode, event);
    }

    /** Final safety net — never exit the kiosk. */
    @Override
    public void onBackPressed() {
        Log.d(TAG, "onBackPressed");
        injectEscapeToWebView();
    }
}
