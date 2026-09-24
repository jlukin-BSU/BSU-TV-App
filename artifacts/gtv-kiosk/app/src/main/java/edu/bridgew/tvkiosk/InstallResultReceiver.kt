package edu.bridgew.tvkiosk

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.util.Log

/**
 * Outcome of a PackageInstaller session started by Sync.
 *
 * Records the result so the next report tells the server what happened, then
 * runs another pass -- which reports the new version and moves on to the next
 * outdated package.
 */
class InstallResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pkg = intent.getStringExtra(EXTRA_PKG) ?: return
        val sha = intent.getStringExtra(EXTRA_SHA)
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)

        when (status) {
            PackageInstaller.STATUS_SUCCESS ->
                Sync.recordInstallResult(context, pkg, sha, true, null)
            // Without Device Owner Android asks someone to confirm on screen. Don't
            // put a prompt on a TV nobody is watching; report it instead.
            PackageInstaller.STATUS_PENDING_USER_ACTION ->
                Sync.recordInstallResult(context, pkg, sha, false, "needs on-screen confirmation (no Device Owner)")
            else ->
                Sync.recordInstallResult(context, pkg, sha, false, message ?: "status $status")
        }
        Log.i("KioskInstall", "$pkg -> status $status ${message ?: ""}")
        Sync.runNow(context)
    }

    companion object {
        const val EXTRA_PKG = "pkg"
        const val EXTRA_SHA = "sha"
    }
}
