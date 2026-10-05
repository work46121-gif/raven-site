# RAVEN Android release handoff

The Android app uses the same app identifier as iOS: `com.ravensplit.app` and
targets Android 16 / API 36, the current Google Play requirement for new apps.
The `raven-android` Codemagic workflow produces a signed `.aab` suitable for
Google Play's Internal testing track.

## One-time Codemagic setup

1. In **Codemagic → Team settings → Code signing identities**, create or
   upload an Android upload keystore. Use `raven-android-upload` as its
   reference name.
2. Store a safe offline backup of that keystore and its passwords. Google Play
   updates must continue to use the same upload key.
3. Run **RAVEN Android Play Bundle**. Its artifact is
   `android/app/build/outputs/bundle/release/app-release.aab`.
4. Upload that bundle manually to **Google Play Console → Testing → Internal
   testing** for the first Android test.

The key is intentionally not committed to this repository. The workflow reads
Codemagic's protected `CM_KEYSTORE_*` values only during the build.

## Deferred external setup

- **Android App Links:** the existing `ravensplit://auth/...` callback works
  now. After the first signed Play build, add the Google Play App Signing SHA-256
  certificate to `https://ravensplit.com/.well-known/assetlinks.json` before
  enabling verified `https://ravensplit.com` links.
- **Native Android push delivery:** the app includes the Android notification
  permission and Capacitor plugin. Firebase configuration (`google-services.json`
  and server credentials) is still required before sending Android push alerts.
