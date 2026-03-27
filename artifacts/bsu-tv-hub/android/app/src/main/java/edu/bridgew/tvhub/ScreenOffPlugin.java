package edu.bridgew.tvhub;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Calls the Sony BRAVIA REST API to power off the display panel.
 *
 * The app runs ON the TV, so we reach the API at http://127.0.0.1/sony/system.
 * Authentication uses the pre-shared key (PSK) configured on the TV under:
 *   Settings → Network → Home Network → IP Control → Pre-Shared Key
 *
 * Usage from JavaScript:
 *   ScreenOff.powerOff({ ip: "127.0.0.1", psk: "mysecret" })
 */
@CapacitorPlugin(name = "ScreenOff")
public class ScreenOffPlugin extends Plugin {

    private static final String TAG = "ScreenOffPlugin";

    private static final String POWER_OFF_BODY =
            "{\"method\":\"setPowerStatus\",\"id\":55,\"params\":[{\"status\":false}],\"version\":\"1.0\"}";

    @PluginMethod
    public void powerOff(PluginCall call) {
        String ip  = call.getString("ip",  "127.0.0.1");
        String psk = call.getString("psk", "");

        // Must run on a background thread — network on main thread throws NetworkOnMainThreadException
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL("http://" + ip + "/sony/system");
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("X-Auth-PSK", psk);
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                byte[] body = POWER_OFF_BODY.getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body);
                }

                int status = conn.getResponseCode();
                Log.d(TAG, "powerOff HTTP status: " + status);

                JSObject result = new JSObject();
                result.put("success", status >= 200 && status < 300);
                result.put("statusCode", status);
                call.resolve(result);

            } catch (Exception e) {
                Log.e(TAG, "powerOff failed", e);
                call.reject("Network error: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    /**
     * Switch the active HDMI input via the Sony BRAVIA REST API.
     *
     * Endpoint:  POST http://<ip>/sony/avContent
     * Body:      {"method":"setPlayContent","id":101,"version":"1.0",
     *             "params":[{"uri":"extInput:hdmi?port=<port>"}]}
     *
     * The port number matches the physical label on the TV (1 = HDMI 1, etc.).
     */
    @PluginMethod
    public void switchHdmi(PluginCall call) {
        String ip   = call.getString("ip",  "127.0.0.1");
        String psk  = call.getString("psk", "");
        Integer port = call.getInt("port");
        if (port == null) {
            call.reject("Missing required parameter: port");
            return;
        }

        String body = "{\"method\":\"setPlayContent\",\"id\":101,\"version\":\"1.0\","
                + "\"params\":[{\"uri\":\"extInput:hdmi?port=" + port + "\"}]}";

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL("http://" + ip + "/sony/avContent");
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("X-Auth-PSK", psk);
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                byte[] bodyBytes = body.getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(bodyBytes);
                }

                int status = conn.getResponseCode();
                Log.d(TAG, "switchHdmi port=" + port + " HTTP status: " + status);

                JSObject result = new JSObject();
                result.put("success", status >= 200 && status < 300);
                result.put("statusCode", status);
                call.resolve(result);

            } catch (Exception e) {
                Log.e(TAG, "switchHdmi failed", e);
                call.reject("Network error: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    /** Quick connectivity check — calls getSystemInformation to verify PSK is correct. */
    @PluginMethod
    public void testConnection(PluginCall call) {
        String ip  = call.getString("ip",  "127.0.0.1");
        String psk = call.getString("psk", "");

        String testBody =
                "{\"method\":\"getSystemInformation\",\"id\":33,\"params\":[],\"version\":\"1.0\"}";

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL("http://" + ip + "/sony/system");
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("X-Auth-PSK", psk);
                conn.setDoOutput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);

                byte[] body = testBody.getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body);
                }

                int status = conn.getResponseCode();
                JSObject result = new JSObject();
                result.put("success", status >= 200 && status < 300);
                result.put("statusCode", status);
                call.resolve(result);

            } catch (Exception e) {
                call.reject("Connection failed: " + e.getMessage());
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }
}
