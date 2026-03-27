package edu.bridgew.tvhub;

import android.os.Build;
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
        super.onCreate(savedInstanceState);
    }

    // -------------------------------------------------------------------------
    // Back-button handling
    //
    // Android TV remotes send KEYCODE_BACK.  The emulator D-pad may send it
    // via dispatchKeyEvent OR onKeyDown/onKeyUp depending on the AVD config.
    // We intercept at all three hooks to be safe, and synthesize an Escape
    // keydown in the WebView so existing JS handlers fire unchanged.
    // -------------------------------------------------------------------------

    private void injectEscapeToWebView() {
        try {
            android.webkit.WebView wv = getBridge().getWebView();
            if (wv != null) {
                Log.d(TAG, "injectEscapeToWebView: dispatching synthetic Escape");
                wv.post(() -> wv.evaluateJavascript(
                    "(function(){" +
                    "  var e=new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true,composed:true});" +
                    "  document.dispatchEvent(e);" +
                    "  window.dispatchEvent(e);" +
                    "  console.log('[BSU] Escape injected');" +
                    "})()", null
                ));
            } else {
                Log.w(TAG, "injectEscapeToWebView: WebView is null");
            }
        } catch (Exception e) {
            Log.e(TAG, "injectEscapeToWebView: exception", e);
        }
    }

    private boolean isBackKey(int keyCode) {
        return keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE;
    }

    /** Hook 1 — earliest point; works on most physical remotes. */
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (isBackKey(event.getKeyCode())) {
            Log.d(TAG, "dispatchKeyEvent BACK/ESC action=" + event.getAction());
            if (event.getAction() == KeyEvent.ACTION_UP) {
                injectEscapeToWebView();
            }
            return true; // consume; prevents onBackPressed / system back nav
        }
        return super.dispatchKeyEvent(event);
    }

    /** Hook 2 — fallback for emulators that route through onKeyDown/Up. */
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (isBackKey(keyCode)) {
            Log.d(TAG, "onKeyDown BACK/ESC");
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        if (isBackKey(keyCode)) {
            Log.d(TAG, "onKeyUp BACK/ESC -> injecting Escape");
            injectEscapeToWebView();
            return true;
        }
        return super.onKeyUp(keyCode, event);
    }

    /** Hook 3 — final safety net so the app never exits via system back. */
    @Override
    public void onBackPressed() {
        Log.d(TAG, "onBackPressed -> injecting Escape");
        injectEscapeToWebView();
        // do NOT call super — that would pop the activity stack / exit the app
    }
}
