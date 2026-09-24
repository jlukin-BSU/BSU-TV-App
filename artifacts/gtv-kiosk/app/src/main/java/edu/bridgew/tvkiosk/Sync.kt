package edu.bridgew.tvkiosk

import android.app.PendingIntent
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.content.pm.PackageInfoCompat
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Keeps this streamer's managed apps in step with the server, and tells the
 * server what is actually installed.
 *
 * One pass:
 *   1. fetch the manifest -- which packages, which versions, their checksums
 *   2. report what is installed (this is the verification: the server never
 *      assumes an install worked, it waits for this report)
 *   3. if this app is Device Owner, install ONE outdated package silently
 *
 * Reading installed versions needs no special privilege, so reporting works on
 * every unit. Installing without someone confirming on screen needs Device
 * Owner; without it, units still report and simply show as outdated.
 *
 * One install per pass, and the install result triggers the next pass, so
 * installs are naturally serialised. This app's own update always goes last,
 * because installing it ends this process.
 *
 * The streamers are on a different VLAN from the server, so everything here is
 * the device calling out; nothing depends on the server reaching the device.
 */
object Sync {
    private const val TAG = "KioskSync"
    private const val INTERVAL_MINUTES = 30L
    /** Don't hammer a download that keeps failing to install. */
    private const val FAILURE_BACKOFF_MS = 6 * 60 * 60 * 1000L

    private const val PREFS = "sync"
    private const val KEY_LAST_PKG = "lastInstallPkg"
    private const val KEY_LAST_OK = "lastInstallOk"
    private const val KEY_LAST_MSG = "lastInstallMsg"
    private const val KEY_FAILED_SHA = "failedSha"
    private const val KEY_FAILED_AT = "failedAt"

    private val started = AtomicBoolean(false)
    private val executor = Executors.newSingleThreadScheduledExecutor { r ->
        Thread(r, "kiosk-sync").apply { isDaemon = true }
    }

    /** Start the periodic pass. Safe to call repeatedly. */
    fun start(ctx: Context) {
        val app = ctx.applicationContext
        if (started.compareAndSet(false, true)) {
            executor.scheduleWithFixedDelay({ pass(app) }, 0, INTERVAL_MINUTES, TimeUnit.MINUTES)
        }
    }

    /** Run a pass now, e.g. right after an install finishes. */
    fun runNow(ctx: Context) {
        val app = ctx.applicationContext
        executor.execute { pass(app) }
    }

    fun recordInstallResult(ctx: Context, pkg: String, sha: String?, ok: Boolean, message: String?) {
        prefs(ctx).edit().apply {
            putString(KEY_LAST_PKG, pkg)
            putBoolean(KEY_LAST_OK, ok)
            putString(KEY_LAST_MSG, message)
            if (!ok && sha != null) {
                putString(KEY_FAILED_SHA, sha)
                putLong(KEY_FAILED_AT, System.currentTimeMillis())
            }
        }.apply()
    }

    // ---- one pass -----------------------------------------------------------

    private data class Wanted(val pkg: String, val versionCode: Long, val sha256: String, val size: Long, val url: String)

    private fun pass(ctx: Context) {
        try {
            val base = Config.serverUrl(ctx).trimEnd('/')
            val wanted = fetchManifest("$base/api/streamer/manifest")

            val packages = (wanted.map { it.pkg } + ctx.packageName).toSet()
            report(ctx, "$base/api/streamer/register", packages)

            if (!isDeviceOwner(ctx)) return
            val next = nextToInstall(ctx, wanted) ?: return
            install(ctx, base, next)
        } catch (e: Exception) {
            // Non-fatal: the hub keeps working; the next pass retries.
            Log.w(TAG, "sync pass failed: ${e.message}")
        }
    }

    private fun fetchManifest(url: String): List<Wanted> {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 5000
            readTimeout = 10000
        }
        try {
            if (conn.responseCode != 200) throw IllegalStateException("manifest HTTP ${conn.responseCode}")
            val apps = JSONObject(conn.inputStream.bufferedReader().readText()).getJSONArray("apps")
            return (0 until apps.length()).map { i ->
                val a = apps.getJSONObject(i)
                Wanted(
                    pkg = a.getString("packageName"),
                    versionCode = a.getLong("versionCode"),
                    sha256 = a.getString("sha256").lowercase(),
                    size = a.getLong("size"),
                    url = a.getString("url"),
                )
            }
        } finally {
            conn.disconnect()
        }
    }

    private fun report(ctx: Context, url: String, packages: Set<String>) {
        val installed = JSONObject()
        for (pkg in packages) {
            val v = installedVersion(ctx, pkg) ?: continue
            installed.put(pkg, JSONObject().put("versionCode", v.first).put("versionName", v.second ?: JSONObject.NULL))
        }
        val p = prefs(ctx)
        val lastInstall = p.getString(KEY_LAST_PKG, null)?.let { pkg ->
            JSONObject()
                .put("packageName", pkg)
                .put("ok", p.getBoolean(KEY_LAST_OK, false))
                .put("message", p.getString(KEY_LAST_MSG, null) ?: JSONObject.NULL)
        }

        val body = JSONObject().apply {
            put("deviceId", Settings.Secure.getString(ctx.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown")
            put("model", Build.MODEL)
            put("manufacturer", Build.MANUFACTURER)
            put("device", Build.DEVICE)
            put("androidRelease", Build.VERSION.RELEASE)
            put("sdkInt", Build.VERSION.SDK_INT)
            put("appVersion", BuildConfig.VERSION_NAME)
            put("ip", localIpv4() ?: JSONObject.NULL)
            put("deviceOwner", isDeviceOwner(ctx))
            put("installed", installed)
            put("lastInstall", lastInstall ?: JSONObject.NULL)
        }.toString()

        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 5000
            readTimeout = 10000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        try {
            conn.outputStream.use { it.write(body.toByteArray()) }
            Log.i(TAG, "reported to $url -> ${conn.responseCode}")
        } finally {
            conn.disconnect()
        }
    }

    /** First outdated package, with this app's own update deferred to last. */
    private fun nextToInstall(ctx: Context, wanted: List<Wanted>): Wanted? {
        val p = prefs(ctx)
        val failedSha = p.getString(KEY_FAILED_SHA, null)
        val failedRecently = System.currentTimeMillis() - p.getLong(KEY_FAILED_AT, 0) < FAILURE_BACKOFF_MS

        return wanted
            .filter { w -> (installedVersion(ctx, w.pkg)?.first ?: -1L) < w.versionCode }
            .filterNot { w -> failedRecently && w.sha256 == failedSha }
            .sortedBy { it.pkg == ctx.packageName }
            .firstOrNull()
    }

    // ---- download, verify, install ------------------------------------------

    private fun install(ctx: Context, base: String, w: Wanted) {
        val file = File(ctx.cacheDir, "${w.sha256}.apk")
        try {
            download("$base${w.url}", file, w.sha256, w.size)
        } catch (e: Exception) {
            file.delete()
            recordInstallResult(ctx, w.pkg, w.sha256, false, "download failed: ${e.message}")
            return
        }

        val installer = ctx.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(w.pkg)
            if (Build.VERSION.SDK_INT >= 31) {
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
        }

        try {
            val sessionId = installer.createSession(params)
            installer.openSession(sessionId).use { session ->
                file.inputStream().use { input ->
                    session.openWrite("base.apk", 0, file.length()).use { out ->
                        input.copyTo(out)
                        session.fsync(out)
                    }
                }
                val result = Intent(ctx, InstallResultReceiver::class.java)
                    .putExtra(InstallResultReceiver.EXTRA_PKG, w.pkg)
                    .putExtra(InstallResultReceiver.EXTRA_SHA, w.sha256)
                // Mutable: the installer writes the outcome into this intent.
                val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                    (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
                session.commit(PendingIntent.getBroadcast(ctx, sessionId, result, flags).intentSender)
            }
            Log.i(TAG, "install committed for ${w.pkg} ${w.versionCode}")
        } catch (e: Exception) {
            recordInstallResult(ctx, w.pkg, w.sha256, false, "install failed: ${e.message}")
        } finally {
            // The session holds its own copy once written.
            file.delete()
        }
    }

    /** Download to `dest`, refusing anything whose size or SHA-256 doesn't match the manifest. */
    private fun download(url: String, dest: File, sha256: String, size: Long) {
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 5000
            readTimeout = 30000
        }
        try {
            if (conn.responseCode != 200) throw IllegalStateException("HTTP ${conn.responseCode}")
            val digest = MessageDigest.getInstance("SHA-256")
            var total = 0L
            conn.inputStream.use { input ->
                dest.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        digest.update(buf, 0, n)
                        out.write(buf, 0, n)
                        total += n
                    }
                }
            }
            if (total != size) throw IllegalStateException("size $total, expected $size")
            val got = digest.digest().joinToString("") { "%02x".format(it) }
            // Plain HTTP by design, so this is what stops a swapped file being installed.
            if (got != sha256) throw IllegalStateException("checksum mismatch")
        } finally {
            conn.disconnect()
        }
    }

    // ---- helpers ------------------------------------------------------------

    private fun installedVersion(ctx: Context, pkg: String): Pair<Long, String?>? = try {
        val info = if (Build.VERSION.SDK_INT >= 33) {
            ctx.packageManager.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            ctx.packageManager.getPackageInfo(pkg, 0)
        }
        PackageInfoCompat.getLongVersionCode(info) to info.versionName
    } catch (e: PackageManager.NameNotFoundException) {
        null
    }

    private fun isDeviceOwner(ctx: Context): Boolean =
        (ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager)?.isDeviceOwnerApp(ctx.packageName) == true

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun localIpv4(): String? = runCatching {
        NetworkInterface.getNetworkInterfaces().toList()
            .filter { it.isUp && !it.isLoopback }
            .flatMap { it.inetAddresses.toList() }
            .filterIsInstance<Inet4Address>()
            .firstOrNull()?.hostAddress
    }.getOrNull()
}
