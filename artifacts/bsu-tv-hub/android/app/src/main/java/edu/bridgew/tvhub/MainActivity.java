package edu.bridgew.tvhub;

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
     * Suppress the default Android back-button behavior (which would close or
     * background the activity).  The WebView still receives the KEYCODE_BACK as
     * a keydown "Escape" / "GoBack" event, so our JavaScript handlers manage
     * all navigation — dismissing popups, opening admin settings, etc.
     * This keeps the kiosk alive even if a user mashes the back button.
     */
    @Override
    public void onBackPressed() {
        // Intentionally do nothing — all back-button logic is handled in JS.
    }
}
