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

import java.io.BufferedReader;
import java.io.FileReader;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.Collections;

/**
 * Exposes the Android device's true network hostname to the WebView.
 *
 * Resolution order (most-to-least reliable for network identity):
 *  1. /proc/sys/kernel/hostname  — kernel hostname (what DHCP registers)
 *  2. System.getProperty("net.hostname") — Android network hostname property
 *  3. InetAddress.getLocalHost().getHostName() — JVM resolution
 *  4. Settings.System "device_name"  — Android TV device name in Settings
 *  5. Settings.Global "device_name"  — fallback for some builds
 *  6. Build.MODEL                    — absolute last resort
 */
@CapacitorPlugin(name = "DeviceHostname")
public class DeviceHostnamePlugin extends Plugin {

    private static final String TAG = "DeviceHostnamePlugin";

    @PluginMethod
    public void getHostname(PluginCall call) {
        String hostname = null;

        // 1. Kernel hostname — most reliable, matches what DHCP/DNS sees
        try {
            BufferedReader br = new BufferedReader(new FileReader("/proc/sys/kernel/hostname"));
            String line = br.readLine();
            br.close();
            if (line != null) line = line.trim();
            if (line != null && !line.isEmpty() && !line.equals("localhost") && !line.equals("android")) {
                hostname = line;
                Log.d(TAG, "hostname from /proc/sys/kernel/hostname: " + hostname);
            }
        } catch (Exception e) {
            Log.w(TAG, "/proc/sys/kernel/hostname read failed", e);
        }

        // 2. Android system network property
        if (hostname == null || hostname.isEmpty()) {
            try {
                String prop = System.getProperty("net.hostname");
                if (prop != null && !prop.isEmpty() && !prop.equals("localhost") && !prop.equals("android")) {
                    hostname = prop;
                    Log.d(TAG, "hostname from net.hostname property: " + hostname);
                }
            } catch (Exception e) {
                Log.w(TAG, "net.hostname property read failed", e);
            }
        }

        // 3. JVM InetAddress resolution
        if (hostname == null || hostname.isEmpty()) {
            try {
                String h = InetAddress.getLocalHost().getHostName();
                if (h != null && !h.equals("localhost") && !h.equals("android")) {
                    hostname = h;
                    Log.d(TAG, "hostname from InetAddress: " + hostname);
                }
            } catch (Exception e) {
                Log.w(TAG, "InetAddress.getLocalHost failed", e);
            }
        }

        // 4. Android TV Settings device_name (System)
        if (hostname == null || hostname.isEmpty()) {
            try {
                Context ctx = getContext();
                String name = Settings.System.getString(ctx.getContentResolver(), "device_name");
                if (name != null && !name.isEmpty()) {
                    hostname = name;
                    Log.d(TAG, "hostname from Settings.System device_name: " + hostname);
                }
            } catch (Exception e) {
                Log.w(TAG, "Settings.System device_name failed", e);
            }
        }

        // 5. Android TV Settings device_name (Global)
        if (hostname == null || hostname.isEmpty()) {
            try {
                Context ctx = getContext();
                String name = Settings.Global.getString(ctx.getContentResolver(), "device_name");
                if (name != null && !name.isEmpty()) {
                    hostname = name;
                    Log.d(TAG, "hostname from Settings.Global device_name: " + hostname);
                }
            } catch (Exception e) {
                Log.w(TAG, "Settings.Global device_name failed", e);
            }
        }

        // 6. Build.MODEL absolute fallback
        if (hostname == null || hostname.isEmpty()) {
            hostname = Build.MODEL;
            Log.d(TAG, "hostname fallback Build.MODEL: " + hostname);
        }

        JSObject ret = new JSObject();
        ret.put("hostname", hostname);
        call.resolve(ret);
    }
}
