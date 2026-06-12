# tlsn-mobile

Native library for TLSNotary proof generation on **iOS and Android**, exposed to the
mobile app through UniFFI bindings (Swift on iOS, Kotlin on Android).

> In normal development you do not run these scripts directly — `app/mobile/build.sh`
> builds the native library automatically when the artifacts are missing (and
> `app/mobile/build.sh --native` forces a rebuild). Use the scripts below only when
> iterating on the Rust code in this package.

## Prerequisites

- Rust with the mobile targets:
  ```bash
  rustup target add aarch64-apple-ios aarch64-apple-ios-sim   # iOS
  rustup target add aarch64-linux-android                     # Android
  ```
- **iOS**: Xcode with the iOS SDK
- **Android**: Android NDK and `cargo-ndk` (`cargo install cargo-ndk`)

Cross targets and `cargo-ndk` are installed automatically by `app/mobile/build.sh`.

## Building

### iOS

```bash
./build-ios.sh
```

This builds for device (`aarch64-apple-ios`) and simulator (`aarch64-apple-ios-sim`),
generates Swift bindings via UniFFI, assembles `TlsnMobile.xcframework`, and copies the
outputs into the Expo native module (`app/mobile/modules/tlsn-native/ios/`).

Outputs:

- `target/TlsnMobile.xcframework` — universal iOS framework
- `target/swift/tlsn_mobile.swift` — Swift bindings

### Android

```bash
./build-android.sh
```

This builds the `arm64-v8a` shared library (`aarch64-linux-android`) with `cargo-ndk`,
generates Kotlin bindings via UniFFI, strips the `.so`, and copies the outputs into the
Expo native module (`app/mobile/modules/tlsn-native/android/`).

Outputs:

- `target/aarch64-linux-android/release/libtlsn_mobile.so` — shared library
- `target/kotlin/uniffi/tlsn_mobile/tlsn_mobile.kt` — Kotlin bindings

Both scripts copy their outputs directly into `app/mobile/modules/tlsn-native/`, so no
manual copy step is needed. After a native rebuild, rebuild the app:

```bash
cd ../../app/mobile
npx expo prebuild --clean
npx expo run:ios      # or: npx expo run:android
```

## API

### Initialize

Call once at app startup:

```swift
try initialize()
```

(Kotlin: `initialize()`.)

### Prove

Generate a TLS proof (Swift shown; the Kotlin API mirrors it):

```swift
let request = HttpRequest(
    url: "https://api.example.com/data",
    method: "GET",
    headers: [HttpHeader(name: "Authorization", value: "Bearer ...")],
    body: nil
)

let options = ProverOptions(
    verifierUrl: "http://localhost:7047",
    proxyUrl: "wss://proxy.example.com",
    maxSentData: 4096,
    maxRecvData: 16384,
    handlers: [
        Handler(handlerType: .recv, part: .startLine, action: .reveal, params: nil),
        Handler(handlerType: .recv, part: .body, action: .reveal, params: nil)
    ]
)

let result = try prove(request: request, options: options)
```

> On Android, the Expo Kotlin bridge cannot auto-convert nested JS objects, so the app
> JSON-serializes these parameters on the JS side and parses them with `JSONObject` on
> the Kotlin side. See `app/mobile/components/tlsn/NativeProver.tsx`.

### Selective Disclosure with Handlers

Handlers control what data is revealed in the MPC proof:

| Handler Type | Part         | Description                               |
| ------------ | ------------ | ----------------------------------------- |
| `.sent`      | `.startLine` | HTTP request line (method, path, version) |
| `.sent`      | `.headers`   | Request headers (includes auth tokens!)   |
| `.sent`      | `.body`      | Request body                              |
| `.recv`      | `.startLine` | HTTP response status line                 |
| `.recv`      | `.headers`   | Response headers                          |
| `.recv`      | `.body`      | Response body                             |
| `*`          | `.all`       | Entire message                            |

**Important**: If you don't specify any SENT handlers, the entire request (including
authorization headers) will be redacted in the proof.

Example — reveal only the response, redact the request:

```swift
let handlers = [
    Handler(handlerType: .recv, part: .startLine, action: .reveal, params: nil),
    Handler(handlerType: .recv, part: .headers, action: .reveal, params: HandlerParams(key: "content-type", contentType: nil, path: nil)),
    Handler(handlerType: .recv, part: .body, action: .reveal, params: nil)
]
```
