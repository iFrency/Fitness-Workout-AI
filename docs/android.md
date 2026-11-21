# Android app

The Android app wraps the existing web app with [Capacitor](https://capacitorjs.com/).
Every asset (catalog, 3D clips, voice clips, music) is packed into the APK, so the app
runs fully offline. The web/PWA build is unchanged.

## What differs from the web build

| Area | Android behaviour |
|------|-------------------|
| Service worker | Not built (`vite build --mode android` drops the PWA plugin). |
| Screen on during a workout | Native keep-screen-on flag via `@capacitor-community/keep-awake` (`src/ui/wakeLock.ts`, `nativeWakeLockEnv`). The web Wake Lock API is not available in Android WebView. |
| Orientation | Locked to portrait (`android:screenOrientation="portrait"` in `AndroidManifest.xml`). |
| Back button | `src/native/backButton.ts`: settings sheet open -> close it; training -> same "结束训练" confirm as the 结束 button; preview / done -> home; home -> exit app. Screens register handlers with `useBackHandler`. |
| Icons / splash | Sources in `assets/`, generated into `android/app/src/main/res` with `npx @capacitor/assets generate --android`. |

## Prerequisites

- JDK 21 (Android Studio's bundled `jbr` works): set `JAVA_HOME`.
- Android SDK with platform 36. Create `android/local.properties` (git-ignored):
  `sdk.dir=D:/AITools/AndroidSDK` (use forward slashes).

## Build

```
npm run build:android          # web build + cap sync
npm run apk:debug              # android/app/build/outputs/apk/debug/app-debug.apk
npm run apk:release            # android/app/build/outputs/apk/release/app-release.apk
```

If `services.gradle.org` is unreachable, run a locally cached Gradle 8.14+ directly
inside `android/` instead of `gradlew` (e.g. `<gradle-8.14>/bin/gradle assembleRelease`).

## Release signing

`android/app/build.gradle` reads `android/keystore.properties` (git-ignored):

```
storeFile=D:/AITools/Project/keystores/moxing-fitness-release.jks
storePassword=...
keyAlias=moxing
keyPassword=...
```

The keystore and a copy of these properties live outside the repository in
`D:/AITools/Project/keystores/`. Back both up: losing the keystore means future APKs
cannot be installed as updates over the current one. Without `keystore.properties` the
release build comes out unsigned as
`app-release-unsigned.apk`, which phones refuse to install.

## Install

```
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Or copy the APK to the phone and open it (allow "install unknown apps").

## Device check

Run `docs/device-test-checklist.md` on the phone as well; additionally confirm the screen stays
on during a workout, the back button behaves as in the table above, and the app works in
airplane mode.
