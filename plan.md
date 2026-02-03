# React Native TLSNotary App - Spotify MVP

## Overview

iOS app that proves your Spotify top artist using TLSNotary.

## Implementation Status

### ✅ Completed
- [x] Project setup with Expo
- [x] Native Rust prover library (`packages/tlsn-mobile`)
- [x] UniFFI Swift bindings generation
- [x] Expo native module (`packages/mobile/modules/tlsn-native`)
- [x] Spotify header interception WebView
- [x] Basic proof generation working
- [x] Handler-based selective disclosure API
- [x] Build scripts for iOS (device + simulator)
- [x] Selective disclosure at MPC level (verified working)
- [x] JSON path support for body reveal (e.g., `items[0].name`)
- [x] Podspec updated to use XCFramework (was using old static library)
- [x] Build script auto-copies XCFramework and Swift bindings to Expo module

### 🔄 In Progress
- [ ] Clean up debug logging before production
- [ ] Remove `handlers_received` debug field from ProofResult

### ❌ Not Started
- [ ] WebView fallback prover (for non-iOS or debugging)
- [ ] Production-ready error handling
- [ ] App Store preparation

---

## Architecture (Implemented)

**Key Change from Original Plan**: Instead of using a WebView with WASM for proof generation, we implemented a **native Rust prover** using UniFFI to generate Swift bindings. This provides better performance and native iOS integration.

```
┌─────────────────────────────────────────────────────────────┐
│                   React Native App                          │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  WebView (Spotify OAuth)                               │ │
│  │  - User authorizes app                                 │ │
│  │  - Captures access token from redirect                 │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                  │
│                          ▼                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Auth Token State                                      │ │
│  │  - Stored when captured from OAuth redirect            │ │
│  │  - Enables "Generate Proof" button                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                  │
│                          ▼                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  NativeProver Component                                │ │
│  │  - Calls Expo native module (Swift)                    │ │
│  │  - Swift calls Rust via UniFFI                         │ │
│  │  - Native TLS proof generation                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                  │
│                          ▼                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Native UI                                             │ │
│  │  - Status indicators                                   │ │
│  │  - Proof result display                                │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘

External Services:
┌──────────────────┐     ┌──────────────────┐
│  Verifier Server │     │  WebSocket Proxy │
│  localhost:7047  │     │  notary.pse.dev  │
└──────────────────┘     └──────────────────┘
```

## Tech Stack (Actual)

- **React Native** with Expo (managed workflow with native modules)
- **react-native-webview** - For Spotify OAuth only
- **tlsn-mobile** - Native Rust prover with UniFFI bindings (NEW)
- **Expo Modules API** - Bridge between React Native and Swift
- **Local verifier** - `packages/verifier` Rust server on localhost:7047

## Project Structure (Actual)

```
packages/
├── mobile/                          # Expo React Native app
│   ├── app/
│   │   └── (tabs)/
│   │       └── index.tsx            # Main screen with Spotify demo
│   ├── components/
│   │   └── tlsn/
│   │       ├── NativeProver.tsx     # Native iOS prover component
│   │       ├── ProverWebView.tsx    # WebView fallback (not used yet)
│   │       └── SpotifyWebView.tsx   # Spotify OAuth WebView
│   ├── modules/
│   │   └── tlsn-native/             # Expo native module
│   │       ├── ios/
│   │       │   ├── TlsnNativeModule.swift    # Swift bridge
│   │       │   ├── TlsnNative.podspec        # CocoaPods spec (uses XCFramework)
│   │       │   ├── TlsnMobile.xcframework/   # Built library (gitignored)
│   │       │   └── tlsn_mobile.swift         # Generated bindings (gitignored)
│   │       └── src/
│   │           └── index.ts         # TypeScript module interface
│   └── assets/
│       └── prover/                  # WASM assets (for WebView fallback)
│
├── tlsn-mobile/                     # Rust native library (NEW)
│   ├── src/
│   │   ├── lib.rs                   # UniFFI exports
│   │   └── prover.rs                # TLS proof generation logic
│   ├── build-ios.sh                 # Cross-compile for iOS + copy to Expo
│   ├── Cargo.toml
│   └── README.md
│
└── verifier/                        # Local verification server
    └── (Rust Axum server)
```

## Differences from Original Plan

| Original Plan                          | Actual Implementation               |
| -------------------------------------- | ----------------------------------- |
| WASM prover in hidden WebView          | Native Rust prover via UniFFI       |
| `tlsn-wasm` package                    | New `tlsn-mobile` Rust package      |
| ProverWebView component                | NativeProver + Expo module          |
| Remote demo.tlsnotary.org              | Local verifier (localhost:7047)     |
| Header interception in Spotify WebView | Header interception (same approach) |

### Why Native Instead of WASM?

1. **Performance**: Native Rust runs faster than WASM in WebView
2. **Reliability**: No WebView threading/WASM compatibility issues
3. **Integration**: Better iOS integration with Expo Modules API
4. **Debugging**: Native logs visible in Xcode (vs opaque WebView)

## Build Process

### Building the Native Library

```bash
cd packages/tlsn-mobile
./build-ios.sh
```

This script:
1. Builds Rust for `aarch64-apple-ios` (device)
2. Builds Rust for `aarch64-apple-ios-sim` (simulator)
3. Generates Swift bindings via UniFFI
4. Creates `TlsnMobile.xcframework`
5. **Auto-copies** XCFramework and Swift bindings to `packages/mobile/modules/tlsn-native/ios/`

### Running the App

```bash
cd packages/mobile
npx expo prebuild --clean
npx expo run:ios
```

## Handler System (Selective Disclosure)

Handlers control what data is revealed in the MPC proof. This is now **fully working** at the MPC level.

### Example: Spotify Top Artist

```typescript
const handlers: Handler[] = [
  // Request: only reveal the start line (GET /path HTTP/1.1)
  { handlerType: 'Sent', part: 'StartLine', action: 'Reveal' },

  // Response: reveal status line (HTTP/1.1 200 OK)
  { handlerType: 'Recv', part: 'StartLine', action: 'Reveal' },

  // Response: reveal date header only
  { handlerType: 'Recv', part: 'Headers', action: 'Reveal', params: { key: 'date' } },

  // Response: reveal only the top artist name from JSON body
  { handlerType: 'Recv', part: 'Body', action: 'Reveal', params: { contentType: 'json', path: 'items[0].name' } },
];
```

### Handler Reference

| Handler Type | Part        | Params                         | Description                               |
| ------------ | ----------- | ------------------------------ | ----------------------------------------- |
| `Sent`       | `StartLine` | -                              | HTTP request line (method, path, version) |
| `Sent`       | `Headers`   | `{ key?: string }`             | Request headers (or specific header)      |
| `Sent`       | `Body`      | -                              | Request body                              |
| `Recv`       | `StartLine` | -                              | HTTP response status line                 |
| `Recv`       | `Headers`   | `{ key?: string }`             | Response headers (or specific header)     |
| `Recv`       | `Body`      | `{ contentType?, path? }`      | Response body (or JSON path)              |
| `*`          | `All`       | -                              | Entire message                            |

### JSON Path Support

For response bodies, you can specify a JSON path to reveal only specific fields:

```typescript
{
  handlerType: 'Recv',
  part: 'Body',
  action: 'Reveal',
  params: {
    contentType: 'json',
    path: 'items[0].name'  // Only reveals the artist name
  }
}
```

Supported path syntax:
- Simple keys: `"name"`, `"status"`
- Array access: `"items[0]"`, `"data[2]"`
- Nested: `"items[0].name"`, `"user.profile.name"`

## Key Bug Fixes

### Issue 1: Handlers Not Reaching Rust
**Symptom**: `handlers.is_empty()` always returned true in Rust despite Swift passing handlers.

**Root Cause**: The podspec (`TlsnNative.podspec`) was configured to use an old static library at `ios/lib/libtlsn_mobile.a` instead of the new XCFramework.

**Fix**: Updated podspec to use `vendored_frameworks = 'TlsnMobile.xcframework'`.

### Issue 2: Body Revealing Full JSON
**Symptom**: When using JSON path handler, entire JSON body was revealed instead of just the specified path.

**Root Cause**: MPC reveal code had a comment "reveal the whole body for now" and wasn't using `find_json_path()`.

**Fix**: Updated MPC reveal in `prover.rs` to use `find_json_path()` when `contentType: 'json'` and `path` are specified.

## Debugging

### Viewing Native Logs

Since Metro doesn't show Swift/Rust logs, use:

1. **Xcode Console**: Open `ios/TLSNMobile.xcworkspace`, run app
2. **Console.app**: Filter by "TLSNMobile" process
3. **Terminal**: `xcrun simctl spawn booted log stream | grep -i tlsn`

### Debug Field in ProofResult

The `handlersReceived` field in ProofResult shows how many handlers Rust received (for debugging UniFFI serialization). This should be removed before production.

## Running the Verifier

```bash
cd packages/verifier
cargo run
```

Runs on `http://localhost:7047`. The mobile app connects to this for MPC verification.

## Next Steps

1. [ ] Remove debug `handlers_received` field from ProofResult
2. [ ] Clean up excessive println! logging in prover.rs
3. [ ] Add WebView fallback prover for debugging
4. [ ] Polish UI and error handling
5. [ ] Test on physical iOS device
6. [ ] App Store preparation
