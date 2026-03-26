package edu.bridgew.tvhub;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor bridge for launching other Android apps by package name.
 *
 * Usage from JavaScript:
 *   AppLauncher.launch({ packageName: "com.optisigns.playe1" })
 */
@CapacitorPlugin(name = "AppLauncher")
public class AppLauncherPlugin extends Plugin {

    private static final String TAG = "AppLauncherPlugin";

    @PluginMethod
    public void launch(PluginCall call) {
        String packageName = call.getString("packageName");
        if (packageName == null || packageName.isEmpty()) {
            call.reject("Missing required parameter: packageName");
            return;
        }

        Context ctx = getContext();
        PackageManager pm = ctx.getPackageManager();
        Intent launchIntent = pm.getLaunchIntentForPackage(packageName);

        if (launchIntent == null) {
            Log.w(TAG, "No launch intent found for package: " + packageName);
            call.reject("App not installed: " + packageName);
            return;
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);

        Log.d(TAG, "Launching: " + packageName);
        ctx.startActivity(launchIntent);

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("packageName", packageName);
        call.resolve(result);
    }

    @PluginMethod
    public void isInstalled(PluginCall call) {
        String packageName = call.getString("packageName");
        if (packageName == null || packageName.isEmpty()) {
            call.reject("Missing required parameter: packageName");
            return;
        }

        boolean installed;
        try {
            getContext().getPackageManager().getPackageInfo(packageName, 0);
            installed = true;
        } catch (PackageManager.NameNotFoundException e) {
            installed = false;
        }

        JSObject result = new JSObject();
        result.put("installed", installed);
        call.resolve(result);
    }
}
