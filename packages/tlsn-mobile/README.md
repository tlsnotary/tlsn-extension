# tlsn-mobile

Native iOS library for TLSNotary proof generation using UniFFI bindings.

## Prerequisites

- Rust with iOS targets:
  ```bash
  rustup target add aarch64-apple-ios aarch64-apple-ios-sim
  ```
- Xcode with iOS SDK

## Building

```bash
./build-ios.sh
```

This will:
1. Build the Rust library for iOS device (`aarch64-apple-ios`)
2. Build for iOS simulator (`aarch64-apple-ios-sim`)
3. Generate Swift bindings via UniFFI
4. Create an XCFramework combining both architectures

Output files:
- `target/TlsnMobile.xcframework` - Universal iOS framework
- `target/swift/tlsn_mobile.swift` - Swift bindings

## Integration with Expo Module

After building, copy the outputs to the Expo native module:

```bash
cp target/swift/tlsn_mobile.swift ../mobile/modules/tlsn-native/ios/
cp -r target/TlsnMobile.xcframework ../mobile/modules/tlsn-native/ios/
```

Then rebuild the iOS app:

```bash
cd ../mobile
npx expo prebuild --clean
npx expo run:ios
```

## API

### Initialize

Call once at app startup:

```swift
try initialize()
```

### Prove

Generate a TLS proof:

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

### Selective Disclosure with Handlers

Handlers control what data is revealed in the MPC proof:

| Handler Type | Part | Description |
|-------------|------|-------------|
| `.sent` | `.startLine` | HTTP request line (method, path, version) |
| `.sent` | `.headers` | Request headers (includes auth tokens!) |
| `.sent` | `.body` | Request body |
| `.recv` | `.startLine` | HTTP response status line |
| `.recv` | `.headers` | Response headers |
| `.recv` | `.body` | Response body |
| `*` | `.all` | Entire message |

**Important**: If you don't specify any SENT handlers, the entire request (including authorization headers) will be redacted in the proof.

Example - reveal only response, redact request:

```swift
let handlers = [
    Handler(handlerType: .recv, part: .startLine, action: .reveal, params: nil),
    Handler(handlerType: .recv, part: .headers, action: .reveal, params: HandlerParams(key: "content-type", contentType: nil, path: nil)),
    Handler(handlerType: .recv, part: .body, action: .reveal, params: nil)
]
```
