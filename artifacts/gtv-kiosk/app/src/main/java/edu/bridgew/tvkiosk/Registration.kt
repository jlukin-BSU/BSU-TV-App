package edu.bridgew.tvkiosk

import android.content.Context
import android.os.Build
import android.provider.Settings
import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL
import kotlin.concurrent.thread

/**
 * Self-registration.
 *
 * The streamers sit on a different VLAN from the server, so mDNS and SSDP
 * discovery are both unavailable (multicast does not cross the boundary). The
 * device announcing itself outbound sidesteps that entirely, and it re-announces
 * on every boot, so a DHCP change or a reimage does not need a manual re-register.
 */
object Registration {
    private const val TAG = "KioskRegistration"
    private const val PATH = "api/streamer/register"

    fun announce(ctx: Context) = thread(isDaemon = true) {
        val url = Config.serverUrl(ctx) + PATH
        val body = JSONObject().apply {
            put("deviceId", deviceId(ctx))
            put("model", Build.MODEL)
            put("manufacturer", Build.MANUFACTURER)
            put("device", Build.DEVICE)
            put("androidRelease", Build.VERSION.RELEASE)
            put("sdkInt", Build.VERSION.SDK_INT)
            put("appVersion", BuildConfig.VERSION_NAME)
            put("ip", localIpv4())
        }.toString()

        try {
            (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 5000
                readTimeout = 5000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                outputStream.use { it.write(body.toByteArray()) }
                Log.i(TAG, "registered with $url -> $responseCode")
                disconnect()
            }
        } catch (e: Exception) {
            // Non-fatal: the hub still loads. The server can fall back to the
            // operator-entered hostname for this device.
            Log.w(TAG, "registration failed: ${e.message}")
        }
    }

    /** Stable per-device id that needs no permissions (unlike Build.getSerial). */
    private fun deviceId(ctx: Context): String =
        Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"

    private fun localIpv4(): String? =
        runCatching {
            NetworkInterface.getNetworkInterfaces().toList()
                .filter { it.isUp && !it.isLoopback }
                .flatMap { it.inetAddresses.toList() }
                .filterIsInstance<Inet4Address>()
                .firstOrNull()?.hostAddress
        }.getOrNull()
}
