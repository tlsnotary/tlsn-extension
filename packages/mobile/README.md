# TLSNotary Mobile App

React Native/Expo mobile app for iOS and Android with native TLSNotary proof generation.

The app features a plugin gallery where users can select from available plugins (Twitter, Swiss Bank, Spotify, Duolingo, Uber, Discord), log in via an embedded WebView, and generate cryptographic proofs of API responses using MPC-TLS.

## Prerequisites

You need to install these manually — the build script handles the rest automatically.

### Required for all platforms

| Tool              | Install                                                           | Notes                                   |
| ----------------- | ----------------------------------------------------------------- | --------------------------------------- |
| **Node.js >= 18** | [nodejs.org](https://nodejs.org)                                  | Needed for JS build pipeline            |
| **Rust**          | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` | Needed to compile the native TLS prover |

### iOS only

| Tool          | Install                      | Notes                               |
| ------------- | ---------------------------- | ----------------------------------- |
| **Xcode**     | Mac App Store                | Includes iOS simulator              |
| **CocoaPods** | `sudo gem install cocoapods` | Expo may install this automatically |

### Android only

| Tool               | Install                                                       | Notes                                  |
| ------------------ | ------------------------------------------------------------- | -------------------------------------- |
| **Android Studio** | [developer.android.com](https://developer.android.com/studio) | Includes SDK, emulator, JDK, and NDK   |
| **Android NDK**    | Android Studio → SDK Manager → SDK Tools → NDK                | Required for native C/Rust compilation |

### Auto-installed by `build.sh`

You do **not** need to install these manually — the build script detects and installs them:

- **Rust cross-compilation targets** (`aarch64-linux-android`, `aarch64-apple-ios`, etc.)
- **`cargo-ndk`** (Android Rust cross-compiler wrapper)
- **tlsn repository** (cloned from GitHub if not present, updated if `sdk-core` crate is missing)

QuickJS C sources are vendored in `modules/quickjs-native/` (see `QUICKJS_VERSION` for provenance).

## Environment Setup

### Android SDK

The build script auto-detects `ANDROID_HOME` from common install locations (`~/Library/Android/sdk`, `~/Android/Sdk`). If auto-detection fails, add to your `~/.zshrc` (or `~/.bashrc`):

```bash
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

`JAVA_HOME` points to the JDK bundled with Android Studio — Gradle needs it to compile the Android app.

Then reload: `source ~/.zshrc`.

## Quick Start

From the repo root:

```bash
npm install
```

### One command to build & run

From the repo root:

```bash
npm run mobile:ios      # Build deps + launch iOS
npm run mobile:android  # Build deps + launch Android
```

Or from `packages/mobile/` with the full build pipeline (JS deps + native libs + app):

```bash
./build.sh ios      # Build everything + launch iOS
./build.sh android  # Build everything + launch Android
```

The build script automatically:

1. Auto-detects `ANDROID_HOME` (Android only)
2. Builds JS dependencies (`@tlsn/common` → `@tlsn/plugin-sdk` → `@tlsn/plugins`)
3. Verifies vendored QuickJS C sources are present
4. Installs missing Rust targets and `cargo-ndk` (if native library needs building)
5. Clones/updates the tlsn repository (if `sdk-core` crate is missing)
6. Builds the native TLSN library from Rust (if `.xcframework`/`.so` not present)
7. Runs `expo run:ios` or `expo run:android`

Run `./build.sh --help` for all options. Commonly used:

- `--no-run` — build everything but don't launch the app
- `--skip-deps` — skip JS dependency builds (if already built)
- `--rebuild-native` — force Rust rebuild even if artifacts exist
- `--clean` — clean Expo prebuild before building

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
  ├─ QuickJS C sources   (vendored in git, patched for ObjC)
  └─ TLSN native library (Rust → XCFramework/iOS or .so/Android via UniFFI)
  │
  └─ expo run:ios / expo run:android
```

## Rebuilding Native Libraries

The XCFramework (iOS) and .so (Android) are built from source by `build.sh` and are not committed to git. You only need to rebuild if you change `packages/tlsn-mobile` Rust code. The build script auto-installs the required Rust targets and `cargo-ndk`.

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
│       └── registry.ts         # Plugin registry (loads code from @tlsn/plugins)
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
        ├── ios/quickjs/        # Vendored C sources + Swift wrapper
        ├── android/            # JNI bridge + vendored C sources
        ├── QUICKJS_VERSION     # Upstream commit hash and provenance
        └── setup.sh            # Re-vendoring tool (not needed for builds)
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

### "Unable to locate a Java Runtime" (Android)

Gradle needs a JDK. Android Studio ships one — set `JAVA_HOME` to point to it. See [Environment Setup](#environment-setup).

### "ANDROID_HOME not set and could not auto-detect Android SDK"

The build script checks common locations (`~/Library/Android/sdk`, `~/Android/Sdk`). If your SDK is elsewhere, set `ANDROID_HOME` manually. See [Environment Setup](#environment-setup).

### Expo Go errors / native module not found

The app uses native modules (`tlsn-native`, `quickjs-native`, `@react-native-cookies/cookies`) that are **not** available in Expo Go. Always use `expo run:android` or `expo run:ios` — never `expo start --android`.

### Metro "Unable to resolve" plugin imports

Ensure plugins are built: `npm run build:plugins`. The mobile plugin files live in `packages/plugins/dist/mobile/`.

### MPC-TLS hangs or times out (Android)

The Android emulator clock drifts. Sync it before proving:

```bash
adb shell cmd alarm set-time $(( $(date +%s) * 1000 ))
```
