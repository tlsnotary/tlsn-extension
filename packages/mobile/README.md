# TLSNotary Mobile App

React Native/Expo mobile app for iOS and Android with native TLSNotary proof generation.

The app features a plugin gallery where users can select from available plugins (Swiss Bank, Spotify, Duolingo), log in via an embedded WebView, and generate cryptographic proofs of API responses using MPC-TLS.

## Prerequisites

- Node.js >= 18
- **iOS**: Xcode, CocoaPods
- **Android**: Android Studio, Android SDK, NDK, `cargo-ndk`
- Built `tlsn-mobile` native library (see below)

## Setup

### 1. Build the native library

From the repo root:

**iOS:**
```bash
cd packages/tlsn-mobile
./build-ios.sh
```

**Android:**
```bash
cd packages/tlsn-mobile
./build-android.sh
```

These scripts build the Rust prover library and copy the bindings to the Expo native module.

### 2. Setup QuickJS (Android only)

The Android build uses a native QuickJS module for plugin sandboxing:

```bash
cd packages/mobile/modules/quickjs-native
./setup.sh
```

### 3. Install dependencies

```bash
cd packages/mobile
npm install
```

### 4. Run the app

**iOS:**
```bash
npx expo prebuild --clean
npx expo run:ios
```

**Android:**
```bash
npx expo prebuild --clean
npx expo run:android
```

## Running the Verifier

Plugins connect to a local verifier server for proof generation. Start it with:

```bash
cd packages/verifier
cargo run
```

The verifier runs on `http://localhost:7047`. On iOS simulator this is accessible as-is. On Android emulator, the app automatically rewrites `localhost` to `10.0.2.2` (the host loopback address).

## Android Emulator Notes

### Clock synchronization

MPC-TLS requires the prover and verifier clocks to be within a few seconds. Android emulators can drift. To fix:

1. Open emulator **Settings > System > Date & time**
2. Disable **Set time automatically**
3. Sync the clock from your host:
   ```bash
   adb shell cmd alarm set-time $(( $(date +%s) * 1000 ))
   ```

### SDK location

If Gradle can't find the Android SDK, create `packages/mobile/android/local.properties`:

```
sdk.dir=/Users/<your-username>/Library/Android/sdk
```

## Project Structure

```
packages/mobile/
├── app/                        # Expo Router screens
│   ├── (tabs)/
│   │   ├── _layout.tsx         # Tab bar configuration
│   │   ├── index.tsx           # Plugin gallery (home screen)
│   │   └── two.tsx             # About page
│   ├── plugin/
│   │   └── [id].tsx            # Dynamic plugin runner route
│   └── _layout.tsx             # Root stack layout
├── assets/
│   └── plugins/
│       ├── registry.ts         # Plugin registry (Swiss Bank, Spotify, Duolingo)
│       ├── swissbankPluginCode.ts
│       ├── spotifyPluginCode.ts
│       └── duolingoPluginCode.ts
├── components/
│   └── tlsn/
│       ├── NativeProver.tsx    # Native prover bridge (iOS + Android)
│       ├── PluginScreen.tsx    # Plugin orchestrator (WebView + prover + result)
│       ├── PluginWebView.tsx   # WebView for login + cookie/header capture
│       └── PluginRenderer.tsx  # Renders plugin DOM JSON as React Native views
├── lib/
│   └── MobilePluginHost.ts    # Plugin execution engine (runs plugin JS code)
└── modules/
    ├── tlsn-native/            # Expo native module for TLSNotary prover
    │   ├── ios/                # Swift bridge + XCFramework
    │   ├── android/            # Kotlin bridge + JNI libs
    │   └── src/index.ts        # TypeScript interface
    └── quickjs-native/         # Expo native module for QuickJS (Android)
        ├── ios/                # Swift wrapper
        ├── android/            # JNI bridge + C sources
        └── setup.sh            # Downloads QuickJS C sources
```

## Architecture

### Plugin Flow

1. User selects a plugin from the gallery
2. `PluginScreen` loads the plugin code and starts `MobilePluginHost`
3. Plugin calls `openWindow()` → embedded `PluginWebView` opens the target site
4. User logs in; plugin captures cookies/headers via `useHeaders()`
5. User taps "Generate Proof" → plugin calls `prove()`
6. `NativeProver` invokes the Rust prover via UniFFI (Swift on iOS, Kotlin on Android)
7. Rust prover: connects to verifier via WebSocket, performs MPC-TLS with target server
8. Proof result is displayed in the app

### Native Bridge

The Rust prover (`packages/tlsn-mobile`) is compiled to:
- **iOS**: Static library (`.a`) packaged as XCFramework, bridged via Swift/UniFFI
- **Android**: Shared library (`.so`), bridged via Kotlin/UniFFI

On Android, the Expo Kotlin bridge cannot auto-convert nested JS objects, so parameters are JSON-serialized on the JS side and parsed with `JSONObject` on the Kotlin side.

## Development

### Viewing Native Logs

**iOS:**
- Xcode Console: Open `ios/TLSNMobile.xcworkspace`, run app, view Debug Console
- Terminal: `xcrun simctl spawn booted log stream | grep -i tlsn`

**Android:**
- Android Studio Logcat: Filter by `TlsnNative`
- Terminal: `adb logcat | grep -i tlsn`

### Rebuilding Native Module

After changes to `packages/tlsn-mobile`:

**iOS:**
```bash
cd packages/tlsn-mobile && ./build-ios.sh
cd ../mobile && npx expo prebuild --clean && npx expo run:ios
```

**Android:**
```bash
cd packages/tlsn-mobile && ./build-android.sh
cd ../mobile && npx expo prebuild --clean && npx expo run:android
```
