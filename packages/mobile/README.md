# TLSNotary Mobile App

React Native/Expo mobile app for iOS and Android with native TLSNotary proof generation.

The app features a plugin gallery where users can select from available plugins (Swiss Bank, Spotify, Duolingo), log in via an embedded WebView, and generate cryptographic proofs of API responses using MPC-TLS.

## Prerequisites

- Node.js >= 18
- **iOS**: Xcode, CocoaPods
- **Android**: Android Studio, Android SDK, NDK, `cargo-ndk`
- **Native library (optional)**: Rust toolchain with iOS/Android targets (only needed if rebuilding from source — pre-built artifacts are committed)

## Environment Setup

### Android SDK (required for Android builds)

Add these to your `~/.zshrc` (or `~/.bashrc`):

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Then reload: `source ~/.zshrc`. This provides `adb` and `emulator` on your PATH.

Without `ANDROID_HOME`, Gradle will fail with "SDK location not found". As a fallback, you can create `packages/mobile/android/local.properties`:

```
sdk.dir=/Users/<your-username>/Library/Android/sdk
```

## Quick Start

From the repo root:

```bash
npm install
```

### One command to build & run

**iOS:**
```bash
cd packages/mobile
./build.sh ios
```

**Android:**
```bash
cd packages/mobile
./build.sh android
```

Or from the repo root:
```bash
npm run mobile:ios      # Build deps + launch iOS
npm run mobile:android  # Build deps + launch Android
```

The build script automatically:
1. Builds JS dependencies (`@tlsn/common` → `@tlsn/plugin-sdk` → `@tlsn/plugins`)
2. Downloads QuickJS C sources (if not already present)
3. Checks for native TLSN library (builds from Rust if missing)
4. Runs `expo run:ios` or `expo run:android`

### Build script options

```
./build.sh ios                # Build & run iOS (default)
./build.sh android            # Build & run Android
./build.sh --deps-only        # Build JS dependencies only
./build.sh --native           # Rebuild Rust native libraries only
./build.sh ios --skip-deps    # Skip JS builds (if already built)
./build.sh ios --clean        # Clean Expo prebuild before building
./build.sh ios --no-run       # Build everything but don't launch
./build.sh ios --rebuild-native  # Force Rust rebuild even if artifacts exist
```

## Running the Verifier

Plugins connect to a local verifier server for proof generation:

```bash
cd packages/verifier
cargo run
```

The verifier runs on `http://localhost:7047`. On iOS simulator this is accessible as-is. On Android emulator, the app automatically rewrites `localhost` to `10.0.2.2`.

## Build Dependency Chain

```
npm install (root)
  │
  ├─ @tlsn/common        (tsc)
  ├─ @tlsn/plugin-sdk    (vite build, depends on common)
  └─ @tlsn/plugins       (esbuild + tsc, depends on plugin-sdk)
        ├─ dist/demo/     → JS for browser extension
        └─ dist/mobile/   → TS for Hermes (es2016 target, no async/await)
  │
  ├─ QuickJS C sources   (downloaded from GitHub, patched for ObjC)
  └─ TLSN native library (Rust → XCFramework/iOS or .so/Android via UniFFI)
  │
  └─ expo run:ios / expo run:android
```

## Rebuilding Native Libraries

The pre-built XCFramework (iOS) and .so (Android) are committed in `modules/tlsn-native/`. You only need to rebuild if you change `packages/tlsn-mobile` Rust code.

**Requires Rust targets:**
```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim  # iOS
cargo install cargo-ndk                                     # Android
```

**Rebuild:**
```bash
./build.sh --native              # Both platforms
./build.sh ios --rebuild-native  # iOS only, then launch
```

Or directly:
```bash
cd packages/tlsn-mobile
./build-ios.sh      # → modules/tlsn-native/ios/
./build-android.sh  # → modules/tlsn-native/android/
```

## Android Emulator Notes

### Launching the emulator

```bash
emulator -avd <avd-name>   # e.g. Medium_Phone_API_36.1
```

List available AVDs: `emulator -list-avds`

### Clock synchronization

MPC-TLS requires the prover and verifier clocks to be within a few seconds. Android emulators can drift. Sync before running proofs:

```bash
adb shell cmd alarm set-time $(( $(date +%s) * 1000 ))
```

## Project Structure

```
packages/mobile/
├── build.sh                    # Unified build script
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
    └── quickjs-native/         # Expo native module for QuickJS
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

### Hermes and Plugin Code

The app uses Hermes as its JS engine. Hermes does **not** support `async/await` in dynamically evaluated code (`new Function()` / `eval()`), because Metro's Babel transform only runs at build time.

Plugin code is evaluated at runtime via `new Function()` in `MobilePluginHost.ts`. To work around this, `packages/plugins/build.js` compiles mobile plugins with esbuild `target: 'es2016'`, which transforms async/await into generator-based promise chains that Hermes can execute.

If you see `"async functions are unsupported"` errors, rebuild the plugins: `npm run build:plugins`.

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

## Troubleshooting

### "async functions are unsupported"
Hermes cannot execute `async/await` in dynamically evaluated code. Plugins must be compiled with `target: 'es2016'`. Rebuild: `npm run build:plugins` from the repo root.

### "SDK location not found" (Android)
Gradle needs `ANDROID_HOME` set or a `local.properties` file. See [Environment Setup](#environment-setup).

### Expo Go errors / native module not found
The app uses native modules (`tlsn-native`, `quickjs-native`, `@react-native-cookies/cookies`) that are **not** available in Expo Go. Always use `expo run:android` or `expo run:ios` — never `expo start --android`.

### Metro "Unable to resolve" plugin imports
Ensure plugins are built: `npm run build:plugins`. The mobile plugin files live in `packages/plugins/dist/mobile/`.

### MPC-TLS hangs or times out (Android)
The Android emulator clock drifts. Sync it before proving:
```bash
adb shell cmd alarm set-time $(( $(date +%s) * 1000 ))
```
