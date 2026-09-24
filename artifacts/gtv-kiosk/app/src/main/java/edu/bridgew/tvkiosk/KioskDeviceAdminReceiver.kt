package edu.bridgew.tvkiosk

import android.app.admin.DeviceAdminReceiver

/**
 * Device Owner hook. Provisioned once, on a device with no accounts yet:
 *
 *   adb shell dpm set-device-owner edu.bridgew.tvkiosk/.KioskDeviceAdminReceiver
 *
 * Once this app is Device Owner it can call
 * DevicePolicyManager.clearApplicationUserData() itself, so wiping a streaming
 * app's saved credentials no longer needs an ADB connection in production --
 * which matters because the dynamic wireless-debugging port is not
 * rediscoverable across VLANs.
 */
class KioskDeviceAdminReceiver : DeviceAdminReceiver()
