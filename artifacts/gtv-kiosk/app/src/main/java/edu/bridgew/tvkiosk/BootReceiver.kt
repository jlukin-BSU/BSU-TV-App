package edu.bridgew.tvkiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Android TV has no boot-to-URL equivalent to the Sony Pro displays, so the
 * shell launches itself on power-up instead. Close enough to kiosk behaviour
 * without fighting the Google TV launcher for the Home button.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED &&
            action != "android.intent.action.LOCKED_BOOT_COMPLETED"
        ) return

        context.startActivity(
            Intent(context, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}
