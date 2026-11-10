# QUAD RFID Stocktake

Pilot Android app for the Los Angeles handheld RFID reader. It is based on the
hardware vendor's official UHF-G SDK project and uses the QUAD production API.

## Safety boundary

- Scanning records a stocktake session only.
- Uploading never adds, subtracts, receives, transfers, or ships inventory.
- The app refuses to sync if the server reports that inventory mutation is
  enabled.
- A retry keeps the same request ID, so the server can reject conflicting or
  duplicate submissions.
- The device key is sent only to the fixed QUAD HTTPS production origin.

## First-time setup

1. The owner imports the reviewed 299 EPC-to-SKU mappings through the server's
   preview and apply endpoints.
2. The owner creates a 6-digit activation code for device `PDA3109-01`, bound
   to branch `los-angeles`. The code expires in 10 minutes and works once.
3. Install the pilot APK on the handheld reader.
4. Open **盘点**, tap **设备密钥**, enter the 6-digit code, and activate it.
5. Tap **同步299个标签**. Do not scan until the status shows 299 mappings.
6. Clear the scan list, scan one physical area, then tap **上传盘点**.
7. Review the saved stocktake in the management system before making any
   separate inventory correction.

## Build

The legacy vendor project requires JDK 11 and Android SDK platform 29/build
tools 30.0.2.

```sh
export JAVA_HOME=/opt/homebrew/opt/openjdk@11
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
./gradlew clean assembleDebug
```

The pilot APK is written to
`app/build/outputs/apk/debug/quad-rfid-stocktake-v1.0.0.apk`.
