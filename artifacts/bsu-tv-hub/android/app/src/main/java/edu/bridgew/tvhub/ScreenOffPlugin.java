package edu.bridgew.tvhub;

import android.app.Activity;
import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * TvExit plugin — provides three DISTINCT exit paths so Sony Pro Mode
 * can later map each one to the appropriate hardware action.
 *
 * All methods currently move the app to the background via moveTaskToBack().
 * No Sony REST API calls are made here.
 *
 *   exitToHdmi1    → Sony Pro Mode maps to: switch to Wall HDMI 1
 *   exitToHdmi2    → Sony Pro Mode maps to: switch to Wall HDMI 2
 *   exitToScreenOff → Sony Pro Mode maps to: display off
 */
@CapacitorPlugin(name = "ScreenOff")
public class ScreenOffPlugin extends Plugin {

    private static final String TAG = "ScreenOffPlugin";

    @PluginMethod
    public void exitToHdmi1(PluginCall call) {
        Log.d(TAG, "exitToHdmi1: moving app to background");
        backgroundApp();
        call.resolve();
    }

    @PluginMethod
    public void exitToHdmi2(PluginCall call) {
        Log.d(TAG, "exitToHdmi2: moving app to background");
        backgroundApp();
        call.resolve();
    }

    @PluginMethod
    public void exitToScreenOff(PluginCall call) {
        Log.d(TAG, "exitToScreenOff: moving app to background");
        backgroundApp();
        call.resolve();
    }

    private void backgroundApp() {
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> activity.moveTaskToBack(true));
        }
    }
}
