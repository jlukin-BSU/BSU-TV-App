package edu.bridgew.tvhub;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor bridge for launching other Android apps.
 *
 * Methods:
 *   launch({ packageName })   — launch an app by package name
 *   launchUri({ uri })        — launch via an Android intent URI string
 *   isInstalled({ packageName }) — check if an app is installed
 */
@CapacitorPlugin(name = "AppLauncher")
public class AppLauncherPlugin extends Plugin {

    private static final String TAG = "AppLauncherPlugin";

    /** Launch by package name using the app's default launch intent. */
    @PluginMethod
    public void launch(PluginCall call) {
        String packageName = call.getString("packageName");
        if (packageName == null || packageName.isEmpty()) {
            call.reject("Missing required parameter: packageName");
            return;
        }

        Context ctx = getContext();
        Intent launchIntent = ctx.getPackageManager().getLaunchIntentForPackage(packageName);

        if (launchIntent == null) {
            Log.w(TAG, "No launch intent found for package: " + packageName);
            call.reject("App not installed: " + packageName);
            return;
        }

        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);

        Log.d(TAG, "Launching by package: " + packageName);
        ctx.startActivity(launchIntent);

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("packageName", packageName);
        call.resolve(result);
    }

    /**
     * Launch using a full Android intent URI
     * (e.g. "intent://...#Intent;scheme=...;package=...;end").
     * Falls back to a plain ACTION_VIEW if parsing fails.
     */
    @PluginMethod
    public void launchUri(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null || uri.isEmpty()) {
            call.reject("Missing required parameter: uri");
            return;
        }

        Context ctx = getContext();
        Intent intent;

        try {
            intent = Intent.parseUri(uri, Intent.URI_INTENT_SCHEME);
        } catch (Exception e) {
            Log.w(TAG, "Could not parse intent URI, falling back to ACTION_VIEW: " + uri, e);
            intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
        }

        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);

        Log.d(TAG, "Launching via URI: " + uri);

        try {
            ctx.startActivity(intent);
        } catch (android.content.ActivityNotFoundException ex) {
            Log.e(TAG, "No activity found for URI: " + uri, ex);
            call.reject("No app found to handle this URI: " + uri);
            return;
        }

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("uri", uri);
        call.resolve(result);
    }

    /** Returns whether the given package is installed on this device. */
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
