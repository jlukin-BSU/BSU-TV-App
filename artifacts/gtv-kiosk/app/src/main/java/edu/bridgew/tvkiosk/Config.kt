package edu.bridgew.tvkiosk

import android.content.Context

/**
 * The hub server URL.
 *
 * A default is baked in at build time (BuildConfig.DEFAULT_SERVER_URL) so a unit
 * works the moment it is sideloaded, with no per-device setup. The setup screen
 * writes an override for bench and test units; clearing the override falls back
 * to the baked default.
 */
object Config {
    private const val PREFS = "kiosk"
    private const val KEY_SERVER = "serverUrl"

    /** Effective server URL: the operator override if set, otherwise the build default. */
    fun serverUrl(ctx: Context): String {
        val override = prefs(ctx).getString(KEY_SERVER, null)
        return normalize(if (override.isNullOrBlank()) BuildConfig.DEFAULT_SERVER_URL else override)
    }

    /** True when this device is running an override rather than the baked default. */
    fun isOverridden(ctx: Context): Boolean =
        !prefs(ctx).getString(KEY_SERVER, null).isNullOrBlank()

    fun setServerUrl(ctx: Context, url: String?) {
        prefs(ctx).edit().apply {
            if (url.isNullOrBlank()) remove(KEY_SERVER) else putString(KEY_SERVER, url.trim())
        }.apply()
    }

    fun defaultServerUrl(): String = normalize(BuildConfig.DEFAULT_SERVER_URL)

    /** Tolerate a bare hostname and a missing trailing slash. */
    private fun normalize(raw: String): String {
        var url = raw.trim()
        if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://$url"
        if (!url.endsWith("/")) url = "$url/"
        return url
    }
}
