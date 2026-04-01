package edu.bridgew.tvhub;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Sony Simple IP Control plugin.
 *
 * Sends a plain-text command (e.g. "*SCINP:3#") over a raw TCP socket
 * to the TV's Simple IP Control port (default 20060).
 *
 * Must run off the main thread — network on main thread throws
 * NetworkOnMainThreadException on Android.
 */
@CapacitorPlugin(name = "SimpleIpControl")
public class SimpleIpControlPlugin extends Plugin {

    private static final String TAG = "SimpleIpControlPlugin";
    private final ExecutorService executor = Executors.newCachedThreadPool();

    @PluginMethod
    public void sendCommand(PluginCall call) {
        final String tvAddress = call.getString("tvAddress", "");
        final int    port      = call.getInt("port", 20060);
        final String command   = call.getString("command", "");

        if (tvAddress == null || tvAddress.isEmpty()) {
            call.reject("tvAddress is required");
            return;
        }
        if ("localhost".equals(tvAddress) || "127.0.0.1".equals(tvAddress)) {
            call.reject("tvAddress must not be localhost or 127.0.0.1");
            return;
        }
        if (command.isEmpty()) {
            call.reject("command is required");
            return;
        }

        executor.submit(() -> {
            try {
                Socket socket = new Socket(tvAddress, port);
                socket.setSoTimeout(5000);
                OutputStream out = socket.getOutputStream();
                out.write(command.getBytes(StandardCharsets.US_ASCII));
                out.flush();
                socket.close();
                Log.d(TAG, "Sent SICS: " + command + " → " + tvAddress + ":" + port);
                call.resolve(new JSObject().put("success", true));
            } catch (Exception e) {
                Log.e(TAG, "SICS send failed: " + e.getMessage(), e);
                call.reject("Failed: " + e.getMessage());
            }
        });
    }
}
