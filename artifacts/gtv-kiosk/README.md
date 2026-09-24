# gtv-kiosk — Google TV hub shell

A thin Android TV app whose only job is to display the hub in a fullscreen
WebView, so the server can put the control UI on screen on a split system where
the display itself cannot run a browser.

It is deliberately small. The tile grid, branding, idle behaviour and everything
else are served by `bravia-web`, so updating the UI does not mean reinstalling
this APK.

## Why it exists

Sony Pro displays boot straight to a URL. Google TV has no equivalent, and
replacing the launcher fights the platform. Instead this is just an ordinary app
the server can foreground on demand:

```
adb shell am start -n edu.bridgew.tvkiosk/.MainActivity
```

That single call is both "Home" from the controller remote and the recovery path
if someone wanders off into the Google TV launcher.

## What it does

| | |
|---|---|
| Fullscreen WebView | loads the hub URL, keeps all navigation in-app |
| `BOOT_COMPLETED` receiver | relaunches itself on power-up (closest thing to kiosk) |
| App sync | reports installed app versions to the server; installs updates when Device Owner |
| `MY_PACKAGE_REPLACED` receiver | relaunches after the app updates itself |
| Device Owner hook | silent installs and credential wipes without ADB in production |

## Server URL

A default is baked in at build time and can be overridden per device.

- Default: `DEFAULT_SERVER_URL` in `app/build.gradle.kts` (currently
  `http://its-avctrl-bsu-av/`). Production units run this and need no setup.
- Override: press **MENU**, or long-press **D-pad centre**, on the hub to open
  the setup screen. Intended for bench and test units. "Reset to default" clears
  it. There is no on-screen control — this is a kiosk.

## App sync

On start and every 30 minutes (`Sync.kt`), the app:

1. fetches `{server}/api/streamer/manifest` — the apps this streamer should
   have, with versions and SHA-256 checksums (managed from the Streamer apps
   section of the management page);
2. reports what it actually has to `{server}/api/streamer/register`: model,
   Android version, whether it holds Device Owner, and the installed version of
   each managed app;
3. if it holds Device Owner, downloads the first outdated app, checks its size
   and SHA-256 against the manifest, and installs it silently. Its own update
   always goes last, because installing it ends the process; the
   `MY_PACKAGE_REPLACED` receiver brings it back.

**Step 2 is the verification.** The server never assumes an install worked; it
shows what the device last reported. Reading installed versions needs no special
privilege, so every unit reports, with or without Device Owner.

Without Device Owner, Android asks someone to confirm each install on screen.
The app does not raise that prompt on an unattended TV; the unit shows as
outdated with "no Device Owner", and the update is done at the bench over ADB.

The streamers sit on a different VLAN from the server, so everything here is the
device calling out. A failed pass is non-fatal: the hub keeps working and the
next pass retries. A download that fails to install is not retried for 6 hours.

**Updating this app:** bump `versionCode` in `app/build.gradle.kts`, build a
release APK, and upload it. Android only installs over a higher versionCode, and
the server refuses an equal one with different contents.

## Build

Requires Android Studio (or a JDK 17 + Android SDK with `compileSdk 34`). The
Gradle wrapper is not committed — Android Studio generates it on first sync.

```
./gradlew :app:assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`

## Install

Enable ADB on the Streamer first: Settings → System → About → tap
**Android TV OS Build** seven times, then Developer Options → **USB Debugging**
and **Wireless Debugging**. Prefer Ethernet for fixed installs.

```
adb connect <streamer-ip>:<port>
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n edu.bridgew.tvkiosk/.MainActivity
```

## Device Owner provisioning

Recommended. It lets the app install updates silently and wipe another app's
saved credentials (`DevicePolicyManager.clearApplicationUserData()`) without an
ADB connection. That matters because Android 11+ wireless debugging uses a
dynamic port that cannot be rediscovered across VLANs, so without Device Owner,
fleet updates mean visiting each unit.

Must be done on a device with **no accounts added yet**, so: factory reset →
skip sign-in → provision → then sign in.

```
adb shell dpm set-device-owner edu.bridgew.tvkiosk/.KioskDeviceAdminReceiver
```

> Unverified on Google TV. Confirm on a bench unit before depending on it.

## Status

Builds (debug and signed release). Server side of app sync verified end to end
with the real OptiSigns 5.19.34 APK. Not yet run on a Streamer. Open items:

- Does `dpm set-device-owner` succeed on the Google TV Streamer?
- Does ADB over Ethernet survive reboots on a fixed port?
- Hub D-pad focus behaviour inside a WebView (the web app already has a
  `use-dpad` hook, so this is expected to work, but is untested here).
