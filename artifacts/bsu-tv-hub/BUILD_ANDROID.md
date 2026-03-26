# Building the BSU TV Hub APK for Sony Bravia BZ30L

## Prerequisites (one-time setup on your Windows or Mac computer)

1. Install **Android Studio** (free): https://developer.android.com/studio
2. During setup, let Android Studio install the default Android SDK — just click through the defaults.
3. Java is bundled with Android Studio; you don't need to install it separately.

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

## What happens at boot

Once set as the home app, the hub will:
- Launch automatically every time the TV powers on
- Come to the front whenever the Home button is pressed on the remote

---

## Updating the app after UI changes

Whenever the UI is updated in Replit:

1. Download the project as a ZIP again (same steps as above).
2. Open Android Studio — Gradle will sync the new files automatically.
3. Build a new signed APK using the **same keystore file** as before.
4. Reinstall via USB or ADB.

---

## App ID / Package name

`edu.bridgew.tvhub`
