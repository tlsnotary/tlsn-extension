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

### 🔄 In Progress
- [ ] Selective disclosure at MPC level - handlers reach Rust but verifier still shows full request

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
│   ├── build-ios.sh                 # Cross-compile for iOS
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

### Copying to Expo Module

```bash
cp target/swift/tlsn_mobile.swift ../mobile/modules/tlsn-native/ios/
cp -r target/TlsnMobile.xcframework ../mobile/modules/tlsn-native/ios/
```

### Running the App

```bash
cd packages/mobile
npx expo prebuild --clean
npx expo run:ios
```

## Handler System (Selective Disclosure)

Handlers control what data is revealed in the MPC proof:

```typescript
const handlers: Handler[] = [
  // Reveal response status line (e.g., "HTTP/1.1 200 OK")
  { handlerType: 'Recv', part: 'StartLine', action: 'Reveal' },

  // Reveal response body
  { handlerType: 'Recv', part: 'Body', action: 'Reveal' },

  // Note: No SENT handlers = request is fully redacted
];
```

| Handler Type | Part        | Description                               |
| ------------ | ----------- | ----------------------------------------- |
| `Sent`       | `StartLine` | HTTP request line (method, path, version) |
| `Sent`       | `Headers`   | Request headers (includes auth tokens!)   |
| `Sent`       | `Body`      | Request body                              |
| `Recv`       | `StartLine` | HTTP response status line                 |
| `Recv`       | `Headers`   | Response headers                          |
| `Recv`       | `Body`      | Response body                             |
| `*`          | `All`       | Entire message                            |

## Current Issue: Selective Disclosure Not Working

**Symptom**: Verifier receives full transcript including Authorization header, even when no SENT handlers are specified.

**Root Cause Identified**: In `packages/tlsn-mobile/src/prover.rs`, the code was revealing ALL data regardless of handlers:

```rust
// This was always running, ignoring handlers:
proof_builder.reveal_sent(&(0..sent_bytes.len()))?;
proof_builder.reveal_recv(&(0..recv_bytes.len()))?;
```

**Fix Applied**: Code now checks handlers before revealing:

```rust
if options.handlers.is_empty() {
    // Reveal all only if no handlers specified
    proof_builder.reveal_sent(&(0..sent_bytes.len()))?;
    proof_builder.reveal_recv(&(0..recv_bytes.len()))?;
} else {
    // Build reveal ranges from handlers
    for handler in &options.handlers {
        match handler.handler_type {
            HandlerType::Sent => { /* reveal sent ranges */ }
            HandlerType::Recv => { /* reveal recv ranges */ }
        }
    }
}
```

**Current Status**: Fix is in code but needs verification. Native logs aren't visible to confirm handlers are reaching Rust correctly.

### Debugging Native Logs

Since Metro doesn't show Swift/Rust logs, use:

1. **Xcode Console**: Open `ios/TLSNMobile.xcworkspace`, run app
2. **Console.app**: Filter by "TLSNMobile" process
3. **Terminal**: `xcrun simctl spawn booted log stream | grep -i tlsn`

## Next Steps

1. [ ] Verify handlers are reaching Rust (check native logs)
2. [ ] Confirm MPC is using handler-based ranges
3. [ ] Test that verifier only sees revealed data
4. [ ] Add WebView fallback prover for debugging
5. [ ] Polish UI and error handling
6. [ ] Test on physical iOS device

## Running the Verifier

```bash
cd packages/verifier
cargo run
```

Runs on `http://localhost:7047`. The mobile app connects to this for MPC verification.
