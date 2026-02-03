# TLSNotary Mobile App

React Native/Expo mobile app for iOS with native TLSNotary proof generation.

## Prerequisites

- Node.js >= 18
- iOS development environment (Xcode, CocoaPods)
- Built `tlsn-mobile` library (see `packages/tlsn-mobile/README.md`)

## Setup

1. **Build the native library** (from repo root):
   ```bash
   cd packages/tlsn-mobile
   ./build-ios.sh
   ```

2. **Copy native bindings**:
   ```bash
   cp target/swift/tlsn_mobile.swift ../mobile/modules/tlsn-native/ios/
   cp -r target/TlsnMobile.xcframework ../mobile/modules/tlsn-native/ios/
   ```

3. **Install dependencies**:
   ```bash
   cd packages/mobile
   npm install
   ```

4. **Build and run iOS app**:
   ```bash
   npx expo prebuild --clean
   npx expo run:ios
   ```

## Project Structure

```
packages/mobile/
├── app/                    # Expo Router screens
│   └── (tabs)/
│       └── index.tsx       # Main screen with Spotify demo
├── components/
│   └── tlsn/
│       ├── NativeProver.tsx    # Native iOS prover component
│       ├── ProverWebView.tsx   # WebView fallback prover
│       └── SpotifyWebView.tsx  # Spotify OAuth WebView
├── modules/
│   └── tlsn-native/        # Expo native module
│       ├── ios/
│       │   ├── TlsnNativeModule.swift  # Swift bridge
│       │   ├── TlsnMobile.xcframework/ # Built library (not in git)
│       │   └── tlsn_mobile.swift       # Generated bindings (not in git)
│       └── src/
│           └── index.ts    # TypeScript module interface
└── assets/
    └── prover/             # WASM prover assets (WebView fallback)
```

## Usage

### Native Prover

```tsx
import { NativeProver, Handler } from '@/components/tlsn';

// Define what to reveal in the proof
const handlers: Handler[] = [
  { handlerType: 'Recv', part: 'StartLine', action: 'Reveal' },
  { handlerType: 'Recv', part: 'Body', action: 'Reveal' },
  // Note: No SENT handlers = request is fully redacted
];

// Generate proof
const result = await nativeProverRef.current?.prove({
  url: 'https://api.spotify.com/v1/me',
  method: 'GET',
  headers: { Authorization: `Bearer ${token}` },
  proverOptions: {
    verifierUrl: 'http://localhost:7047',
    proxyUrl: 'wss://notary.pse.dev/proxy?token=api.spotify.com',
    maxSentData: 4096,
    maxRecvData: 16384,
    handlers,
  },
});
```

### Running Verifier Locally

Start the verifier server:
```bash
cd packages/verifier
cargo run
```

The verifier runs on `http://localhost:7047`.

## Development

### Viewing Native Logs

Native Swift and Rust logs don't appear in Metro. Use one of:

1. **Xcode Console**: Open `ios/TLSNMobile.xcworkspace`, run app, view Debug Console
2. **Console.app**: Filter by process name or `[TlsnNative]`
3. **Terminal**: `xcrun simctl spawn booted log stream | grep -i tlsn`

### Rebuilding Native Module

After changes to `packages/tlsn-mobile`:

```bash
cd packages/tlsn-mobile
./build-ios.sh
cp target/swift/tlsn_mobile.swift ../mobile/modules/tlsn-native/ios/
cp -r target/TlsnMobile.xcframework ../mobile/modules/tlsn-native/ios/
cd ../mobile
npx expo prebuild --clean
npx expo run:ios
```
