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
| Self-registration | POSTs model, device id, IP to the server on every start |
| Device Owner hook | so credential wipes can run without ADB in production |

## Server URL

A default is baked in at build time and can be overridden per device.

- Default: `DEFAULT_SERVER_URL` in `app/build.gradle.kts` (currently
  `http://its-avctrl-bsu-av/`). Production units run this and need no setup.
- Override: press **MENU**, or long-press **D-pad centre**, on the hub to open
  the setup screen. Intended for bench and test units. "Reset to default" clears
  it. There is no on-screen control — this is a kiosk.

## Self-registration

On start the app POSTs to `{server}/api/streamer/register`:

```json
{
  "deviceId": "<Settings.Secure.ANDROID_ID>",
  "model": "Google TV Streamer",
  "manufacturer": "Google",
  "device": "...",
  "androidRelease": "14",
  "sdkInt": 34,
  "appVersion": "0.1.0",
  "ip": "10.x.x.x"
}
```

The streamers sit on a different VLAN from the server, so mDNS and SSDP
discovery are unavailable — multicast does not cross the boundary. An outbound
announcement sidesteps that, and repeats on every boot so a DHCP change does not
require re-registering by hand.

Registration failure is non-fatal; the hub still loads.

> The server endpoint does not exist yet. Until it does, the POST fails
> harmlessly and is logged.

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

Optional but recommended. It lets the app wipe another app's saved credentials
via `DevicePolicyManager.clearApplicationUserData()` without an ADB connection,
which matters because Android 11+ wireless debugging uses a dynamic port that
cannot be rediscovered across VLANs.

Must be done on a device with **no accounts added yet**, so: factory reset →
skip sign-in → provision → then sign in.

```
adb shell dpm set-device-owner edu.bridgew.tvkiosk/.KioskDeviceAdminReceiver
```

> Unverified on Google TV. Confirm on a bench unit before depending on it.

## Status

Scaffold. Not built or run on hardware yet. Open items:

- Does `dpm set-device-owner` succeed on the Google TV Streamer?
- Does ADB over Ethernet survive reboots on a fixed port?
- Hub D-pad focus behaviour inside a WebView (the web app already has a
  `use-dpad` hook, so this is expected to work, but is untested here).
