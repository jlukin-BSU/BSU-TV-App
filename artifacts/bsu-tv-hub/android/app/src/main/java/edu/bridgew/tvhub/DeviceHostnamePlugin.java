package edu.bridgew.tvhub;

import android.content.Context;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.InetAddress;

/**
 * Exposes the Android device hostname to the WebView.
 *
 * Resolution order:
 *  1. Settings.System "device_name"  — Android TV device name set in Settings
 *  2. Settings.Global "device_name"  — fallback for some Android TV builds
 *  3. InetAddress.getLocalHost().getHostName() — network hostname from DHCP
 *  4. Build.MODEL                    — last resort hardware model string
 */
@CapacitorPlugin(name = "DeviceHostname")
public class DeviceHostnamePlugin extends Plugin {

    private static final String TAG = "DeviceHostnamePlugin";

    @PluginMethod
    public void getHostname(PluginCall call) {
        String hostname = null;
        Context ctx = getContext();

        try {
            hostname = Settings.System.getString(ctx.getContentResolver(), "device_name");
            if (hostname != null && !hostname.isEmpty()) {
                Log.d(TAG, "hostname from Settings.System device_name: " + hostname);
            }
        } catch (Exception e) {
            Log.w(TAG, "Settings.System device_name failed", e);
        }

        if (hostname == null || hostname.isEmpty()) {
            try {
                hostname = Settings.Global.getString(ctx.getContentResolver(), "device_name");
                if (hostname != null && !hostname.isEmpty()) {
                    Log.d(TAG, "hostname from Settings.Global device_name: " + hostname);
                }
            } catch (Exception e) {
                Log.w(TAG, "Settings.Global device_name failed", e);
            }
        }

        if (hostname == null || hostname.isEmpty()) {
            try {
                hostname = InetAddress.getLocalHost().getHostName();
                if ("localhost".equals(hostname)) hostname = null;
                else Log.d(TAG, "hostname from InetAddress: " + hostname);
            } catch (Exception e) {
                Log.w(TAG, "InetAddress.getLocalHost failed", e);
            }
        }

        if (hostname == null || hostname.isEmpty()) {
            hostname = Build.MODEL;
            Log.d(TAG, "hostname fallback Build.MODEL: " + hostname);
        }

        JSObject ret = new JSObject();
        ret.put("hostname", hostname);
        call.resolve(ret);
    }
}
