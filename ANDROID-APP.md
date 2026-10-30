# Ram Darbar Tracker — Android App (Capacitor)

Ye Android app aapki **poori website** ko bundle karta hai. Jo bhi website me update hota hai,
wahi update app me bhi aa jata hai (build ke baad).

## Ready APK

- **File:** `builds/RamDarbarTracker-v1.0-debug.apk`
- **App name:** Ram Darbar Tracker
- **Package:** `com.ramdarbar.tracker`
- **Size:** ~4 MB

### Phone me install kaise karein

1. APK ko phone me bhejein (WhatsApp / USB / Google Drive se).
2. Phone me APK par tap karein.
3. "Unknown sources / Install unknown apps" allow karein (Settings me).
4. Install → open. Bas! App offline bhi chalega, data cloud se sync bhi hoga.

## Android Studio me kholna

1. Android Studio → **Open** → select `frontend/android` folder.
2. Gradle sync hone dein.
3. Run ▶ (device/emulator select karke).

## Website update ke baad app rebuild (important)

Jab bhi website me koi change karein, app me laane ke liye:

```powershell
cd frontend
$env:VITE_BASE="/"
npm.cmd run build
npx.cmd cap sync android
cd android
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat assembleDebug
```

Naya APK yahan milega:
`frontend/android/app/build/outputs/apk/debug/app-debug.apk`

## Technical details

- **Capacitor 6** (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`)
- **Config:** `frontend/capacitor.config.json`
- Web build `frontend/dist` → app assets me copy hota hai
- **Java 21 + Gradle 8.7** (JDK 21 compatibility ke liye wrapper upgrade kiya gaya)
- **compileSdk / targetSdk 34**, minSdk 22

## Note

- App offline-first hai (localStorage) + Firebase Firestore cloud sync (internet chahiye).
- PDF report download Android WebView me bina plugin ke kaam nahi kar sakta — agar chahiye
  to `@capacitor/filesystem` + `@capacitor/share` plugin add karke fix kiya ja sakta hai.
