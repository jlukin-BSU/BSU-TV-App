# Building the BSU TV Hub APK for Sony Bravia BZ30L

## Prerequisites (one-time setup)

1. Install **Android Studio** (free): https://developer.android.com/studio
2. During setup, let Android Studio install the default Android SDK (API 34).
3. Install **Java 17** if Android Studio doesn't bundle it (it usually does).
4. Install **Git** so you can clone this repo on your build machine.

---

## Every time you update the UI in Replit

Run this from the `artifacts/bsu-tv-hub/` directory in this project:

```bash
pnpm cap:sync
```

This rebuilds the web assets and copies them into the `android/` project folder.
Commit and push the result so Android Studio picks up the changes.

---

## Building the APK in Android Studio

1. Open Android Studio → **File → Open** → select the `artifacts/bsu-tv-hub/android/` folder.
2. Let Gradle sync finish (first time may take several minutes downloading dependencies).
3. **Create a signing keystore** (one-time, keep this file safe):
   - Menu → **Build → Generate Signed Bundle / APK**
   - Choose **APK** → Next
   - Click **Create new…** to create a keystore file
   - Fill in the fields (alias, password, org info) — save the `.jks` file somewhere safe
4. Choose **release** build variant → Finish.
5. The signed APK will appear at:
   `android/app/release/app-release.apk`

---

## Loading the APK onto the Sony Bravia BZ30L

### Method 1 — USB sideload
1. Copy `app-release.apk` to a FAT32 USB drive.
2. Insert the USB drive into the TV.
3. On the TV: **Apps → See all apps → scroll to a file manager** (or use Sony's built-in one).
4. Navigate to the APK and install it.

### Method 2 — ADB over Wi-Fi (recommended for IT)
1. On the TV: **Settings → Device Preferences → Developer Options → enable ADB debugging** (you may need to enable Developer Options first by pressing the remote Home button 7 times in About).
2. On your computer:
```bash
adb connect <TV_IP_ADDRESS>:5555
adb install -r app-release.apk
```

---

## Setting the app as the default Home/Launcher

After installing, the TV will ask **"Which home app do you want to use?"** — select **BSU TV Hub** and tap **Always**.

If it doesn't prompt automatically:
- **Settings → Apps → BSU TV Hub → Set as default → Set as home app**

On Sony Bravia commercial displays you can also lock it via:
- **Settings → Device Preferences → Home → Custom Launcher**

---

## What the app does at boot

The `BootReceiver` in the app listens for the Android `BOOT_COMPLETED` broadcast and immediately launches the hub. Combined with being set as the Home app, this means:

- **Power on** → Android boots → BootReceiver fires → BSU TV Hub launches
- **Home button** → BSU TV Hub comes to front

---

## App ID / Package name

`edu.bridgew.tvhub`

---

## Updating the app after UI changes

1. Make UI changes here in Replit as normal.
2. Run `pnpm cap:sync` in `artifacts/bsu-tv-hub/`.
3. In Android Studio: **Build → Generate Signed Bundle / APK** again with the same keystore.
4. Re-install via ADB: `adb install -r app-release.apk`
