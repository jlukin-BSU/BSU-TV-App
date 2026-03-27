# Building the BSU TV Hub APK for Sony Bravia BZ30L

## Prerequisites (one-time setup on your Windows or Mac computer)

1. Install **Android Studio** (free): https://developer.android.com/studio
2. During setup, let Android Studio install the default Android SDK — just click through the defaults.
3. Java is bundled with Android Studio; you don't need to install it separately.

---

## Important: The JS bundle is pre-built in Replit

The app UI (all the JavaScript) is compiled and bundled **inside Replit** before you download.
You do **not** need to run `npm`, `pnpm`, or any build commands on your computer.
Android Studio only compiles the Android/Java wrapper — the UI files are already included in the ZIP.

**Whenever the UI changes in Replit, the agent will rebuild the bundle before telling you to download.**
If you are not sure whether the bundle is current, ask the agent to run `cap:build` + `cap sync` first.

---

## Step 1 — Download the project from Replit

1. In Replit, click the **three-dot menu (⋯)** near the top of the left panel.
2. Choose **Download as ZIP**.
3. Unzip the downloaded file on your computer — you'll get a folder called something like `workspace`.

---

## Step 2 — Open the Android project in Android Studio

1. Open Android Studio.
2. Click **File → Open**.
3. Navigate into the unzipped folder, then go to:
   `artifacts/bsu-tv-hub/android/`
4. Select that `android` folder and click **OK**.
5. Wait for Gradle to sync — the first time can take a few minutes as it downloads build tools.

---

## Step 3 — Build the signed APK

1. In Android Studio, go to **Build → Generate Signed Bundle / APK**.
2. Choose **APK** → click **Next**.
3. **First time only:** click **Create new…** to create a keystore file.
   - Pick any password you'll remember.
   - Fill in your name/org for the certificate fields.
   - Save the `.jks` file somewhere safe — you'll need it every time you rebuild.
4. **Returning builds:** click **Choose existing…** and select your saved `.jks` file.
5. Select the **release** build variant → click **Finish**.
6. The APK will appear at:
   `android/app/release/app-release.apk`

---

## Step 4 — Install on the Sony Bravia BZ30L

### Option A — USB stick (simplest)
1. Copy `app-release.apk` to a USB drive formatted as FAT32.
2. Plug the USB drive into the TV.
3. On the TV, open a file manager app (Sony TVs include one) and navigate to the APK.
4. Tap it to install.

### Option B — ADB over Wi-Fi (faster for IT/repeated installs)
1. On the TV: **Settings → Device Preferences → Developer Options → enable ADB debugging**.
   *(If Developer Options isn't visible: go to About → press the OK/Enter button on "Build number" 7 times.)*
2. Find the TV's IP address under **Settings → Network → Wi-Fi → Status**.
3. On your computer, open a Terminal / Command Prompt and run:
   ```
   adb connect <TV_IP_ADDRESS>:5555
   adb install -r app-release.apk
   ```

---

## Step 5 — Set as the default home app

After installing, the TV will ask **"Which home app do you want to use?"**  
Select **BSU TV Hub** and tap **Always**.

If it doesn't prompt automatically:
- Go to **Settings → Apps → BSU TV Hub → Set as default → Set as home app**

On Sony Bravia commercial displays you can also lock this via:
- **Settings → Device Preferences → Home → Custom Launcher**

---

## Step 6 — Configure Admin Settings (required first run)

The Sony REST API (used for Screen Off and HDMI switching) requires the TV's IP address
and Pre-Shared Key (PSK). These are stored locally on the TV and never leave it.

**To open Admin Settings:**
- Navigate to **any tile in the top row** with the D-pad
- Press the **D-pad Up arrow 5 times quickly** → Admin panel opens
- *(Alternatively: press Escape 5 times in a browser/dev environment)*

**In Admin Settings, set:**
- **Sony TV IP address** — find it at Settings → Network → Wi-Fi → Status
- **Sony Pre-Shared Key (PSK)** — set this in Settings → Professional Settings → Remote Control → Pre-Shared Key on the TV

---

## What happens at boot

Once set as the home app, the hub will:
- Launch automatically every time the TV powers on (via boot receiver)
- Come to the front whenever the Home button is pressed on the remote

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Screen Off / HDMI switching silently does nothing | TV IP or PSK not set | Open Admin Settings and enter IP + PSK |
| App tiles show a red error toast | The target app is not installed on the TV | Install the app from the Play Store / Google TV Store |
| Admin panel won't open | Old APK without D-pad trigger | Rebuild with latest code from Replit |
| App does not auto-start on boot | Not set as default home app | Settings → Apps → BSU TV Hub → Set as default |

---

## Updating the app after UI changes

Whenever the UI is updated in Replit, ask the agent to rebuild. Then:

1. Download the project as a ZIP again (same steps as above).
2. Open Android Studio — Gradle will sync the new files automatically.
3. Build a new signed APK using the **same keystore file** as before.
4. Reinstall via USB or ADB (`adb install -r` upgrades without losing settings).

---

## App ID / Package name

`edu.bridgew.tvhub`
