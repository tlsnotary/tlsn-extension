<img src="packages/extension/src/assets/img/icon-128.png" width="64"/>

# TLSNotary Apps & Plugin Tooling

The TLSNotary clients — a **Chrome extension** and a native **mobile app** (iOS + Android) that generate cryptographic proofs of API responses — plus a plugin SDK, a shared plugin registry, and a verifier server.

Built on the [TLSNotary protocol](https://github.com/tlsnotary/tlsn) (the core MPC-TLS Rust implementation lives in that repo; this repo consumes it via [`tlsn-wasm`](https://www.npmjs.com/package/tlsn-wasm) and the native mobile prover).

> [!IMPORTANT]
> When running a client against a notary/verifier server, ensure the server's version matches the version of the client.

## Table of Contents

- [Clients](#clients)
- [Demo](#demo)
- [Tutorial](#tutorial)
- [Monorepo Structure](#monorepo-structure)
- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [Development](#development)
- [Production Build & Publishing](#production-build--publishing)
- [End-to-End Testing](#end-to-end-testing)
- [Websockify Integration](#websockify-integration)
- [Building Plugins with Claude Code](#building-plugins-with-claude-code)
- [Resources](#resources)
- [License](#license)

## Clients

This monorepo ships **two TLSNotary clients** that share one plugin system, one plugin registry ([`@tlsn/plugins`](packages/plugins)), and the same verifier server:

| Client                | Where                                      | Platforms               | Prover                                                                         |
| --------------------- | ------------------------------------------ | ----------------------- | ------------------------------------------------------------------------------ |
| **Browser extension** | [`packages/extension`](packages/extension) | Chrome / Chromium (MV3) | WASM (`tlsn-wasm`) in an offscreen document                                    |
| **Mobile app**        | [`app/mobile`](app/mobile)                 | iOS + Android           | Native Rust prover ([`packages/tlsn-mobile`](packages/tlsn-mobile)) via UniFFI |

Both run the same sandboxed JavaScript plugins (QuickJS on the extension, QuickJS/Hermes on mobile), capture auth from a logged-in session, and produce selectively-disclosed proofs against a [verifier server](servers/verifier).

## Demo

**Browser extension** — try TLSNotary live at **[demo.tlsnotary.org](https://demo.tlsnotary.org)**: install the extension and run any of the bundled plugins against the hosted verifier.

To run the extension demo locally (verifier + demo site via Docker):

```bash
npm run docker:up   # verifier on :7047, demo site on :80
npm run docker:down
```

Or serve just the demo site against your own verifier:

```bash
npm run demo        # http://localhost:8080
```

**Mobile app** — build and launch on a simulator/emulator or device:

```bash
npm run mobile:ios       # build deps + native libs + launch iOS
npm run mobile:android   # build deps + native libs + launch Android
```

The mobile app presents a plugin gallery (Twitter, Swiss Bank, Spotify, Duolingo, Uber, Discord), lets the user log in via an embedded WebView, and generates proofs with the native prover. See [`app/mobile/README.md`](app/mobile/README.md) for the full toolchain and build pipeline.

### Environment Variables

The extension demo uses `.env` files for configuration:

- `.env` - Local development defaults (`localhost:7047`)
- `.env.production` - Production settings (`demo.tlsnotary.org`, SSL enabled)

For Docker deployments, override via environment variables:

```bash
# Local development (default)
npm run docker:up

# Production with custom verifier
VITE_VERIFIER_HOST=verifier.example.com VITE_SSL=true docker compose up --build
```

For the mobile app, point plugins at a remote verifier by rebuilding them with `MOBILE_VERIFIER_URL` (see [`app/mobile/README.md`](app/mobile/README.md#running-the-verifier)).

## Tutorial

Want to write your own plugin? The [`tutorial`](packages/tutorial) package is an interactive 15-30 minute, hands-on walkthrough of building TLSNotary plugins — starting from a working Twitter plugin, then adapting it for a Swiss Bank balance proof (choosing what to reveal vs. redact). An optional "fool the verifier" challenge shows why careful server-side verification matters.

```bash
npm run tutorial

# Open http://localhost:8080 in your browser
```

## Monorepo Structure

This repository is an npm workspaces monorepo (`packages/*` and `app/*`) plus a Rust Cargo workspace (`servers/`):

```
tlsn-extension/
├── packages/                # npm workspaces (TypeScript)
│   ├── extension/           # Chrome Extension (Manifest V3) — browser client
│   ├── plugin-sdk/          # SDK for developing/running TLSN plugins (QuickJS sandbox)
│   ├── plugins/             # Shared plugins + registry, built for demo (browser) and mobile (Hermes)
│   ├── common/              # Shared utilities (logging system)
│   ├── demo/                # Extension demo frontend + Docker setup
│   ├── tutorial/            # Tutorial examples for plugin development
│   ├── eas-webhook/         # Demo service: turns verifier webhooks into EAS attestations
│   ├── tlsn-mobile/         # Native Rust prover for mobile (iOS .xcframework + Android .so via UniFFI)
│   ├── tlsn-wasm/           # Local TLSN WebAssembly build helper (optional)
│   ├── tlsn-wasm-pkg/       # Output of the local WASM build (gitignored)
│   └── ts-plugin-sample/    # Minimal TypeScript plugin sample
│
├── app/                     # npm workspaces (applications)
│   └── mobile/              # React Native / Expo app — iOS + Android client
│       ├── app/             # Expo Router screens (plugin gallery + runner)
│       ├── components/tlsn/ # WebView login, native prover bridge, plugin renderer
│       ├── modules/         # Expo native modules: tlsn-native (prover), quickjs-native
│       └── build.sh         # Unified build script (JS deps + native libs + run)
│
├── servers/                 # Rust Cargo workspace (deployable servers)
│   ├── verifier/            # WebSocket server for TLSNotary verification (:7047)
│   └── swissbank/           # Fake Swiss bank with dashboard UI (demo target, :3000)
│
├── package.json             # Root npm workspace configuration
└── README.md
```

### Package Details

#### `extension` — Chrome Extension (Manifest V3)

The browser client. Key features:

- **Multi-Window Management**: Track multiple browser windows with request interception
- **Request Interception**: Capture HTTP/HTTPS requests from managed windows
- **Plugin Execution**: Run sandboxed JavaScript plugins using QuickJS (in an offscreen document)
- **TLSN Overlay**: Visual display of intercepted requests

Entry points: `Background` (service worker), `Content` (page injection + overlay), `Popup`, and `Offscreen` (DOM operations + WASM prover).

#### `app/mobile` — Mobile App (iOS + Android)

React Native / Expo client with a native Rust prover. Key features:

- **Plugin gallery**: Select a plugin, log in via embedded WebView, generate a proof
- **Native prover**: Rust ([`packages/tlsn-mobile`](packages/tlsn-mobile)) bridged via UniFFI — Swift/XCFramework on iOS, Kotlin/`.so` on Android
- **Native QuickJS**: Vendored C sources in an Expo native module for plugin sandboxing

See [`app/mobile/README.md`](app/mobile/README.md) for prerequisites, the build pipeline, and architecture.

#### `plugins` — Shared Plugins & Registry

Single source of truth for plugin code and metadata, consumed by both clients:

- Plugin sources in `src/*.plugin.ts` and a shared `src/registry.ts` (per-plugin `platforms: ('demo' | 'mobile')[]`)
- `build.js` produces two targets: `dist/demo/` (browser bundle for the extension) and `dist/mobile/` (Hermes-compatible `es2016`, no `async/await` in dynamically-evaluated code)

#### `plugin-sdk` — Plugin Development SDK

SDK for developing and running TLSN plugins with QuickJS sandboxing:

- Secure JavaScript execution in an isolated environment
- Host capability system for controlled plugin access
- React-like hooks: `useHeaders()`, `useRequests()`, `useEffect()`, `useState()`, `setState()`
- Isomorphic package for Node.js and browser environments, with full TypeScript declarations

#### `common` — Shared Utilities

Centralized logging system used across packages (`DEBUG`/`INFO`/`WARN`/`ERROR`, timestamped output, singleton).

#### `tlsn-mobile` — Native Mobile Prover

Rust prover compiled for mobile and bridged via UniFFI:

- **iOS**: static library packaged as `TlsnMobile.xcframework` + Swift bindings (`build-ios.sh`)
- **Android**: shared library `.so` + Kotlin bindings (`build-android.sh`)

Built automatically by `app/mobile/build.sh`; only rebuild when changing the Rust code.

#### `verifier` — Verifier Server (`servers/verifier`)

Rust HTTP/WebSocket server for TLSNotary verification (shared by both clients):

- `GET /health`, `WS /session`, `WS /verifier?sessionId=<id>`, `WS /proxy?token=<host>` (compatible with notary.pse.dev)
- Webhook API for POST notifications, YAML config (`config.yaml`), CORS enabled
- Runs on `localhost:7047` by default

#### `demo` — Extension Demo Frontend

React + Vite frontend (with Docker Compose: verifier + nginx) that drives the extension against the bundled plugins.

#### `eas-webhook` — Demo Attestation Service

Receives verifier webhooks and creates [EAS](https://attest.sh/) attestations on Sepolia testnet. Demo-only; see [`packages/eas-webhook/README.md`](packages/eas-webhook/README.md).

#### `tlsn-wasm` — TLSN WebAssembly (local build helper)

The extension depends on the published [`tlsn-wasm`](https://www.npmjs.com/package/tlsn-wasm) npm package by default. For local development against an unreleased `tlsn` revision, `packages/tlsn-wasm/build.sh` clones the `tlsn` repo and builds `packages/tlsn-wasm-pkg/` (gitignored). Run `npm link` from there and `npm link tlsn-wasm` inside `packages/extension` to override the published package.

## Architecture Overview

Both clients run the same plugins and talk to the same verifier; they differ only in how the plugin sandbox and the prover are hosted.

### Extension Architecture

The extension uses a message-passing architecture with five entry points:

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser Extension                         │
│                                                               │
│  ┌──────────────┐      ┌──────────────┐                       │
│  │  Background  │◄────►│   Content    │◄──── Page Scripts      │
│  │    (SW)      │      │   Script     │                        │
│  └──────┬───────┘      └──────────────┘                       │
│         │                                                      │
│         ├─► Window Management (WindowManager)                  │
│         ├─► Request Interception (webRequest API)             │
│         ├─► Session Management (SessionManager)                │
│         └─► Message Routing                                    │
│                                                               │
│  ┌──────────────┐                                             │
│  │   Offscreen  │  ← QuickJS plugin sandbox + WASM prover      │
│  └──────────────┘                                             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │   Verifier   │
                   │ (localhost:  │
                   │    7047)     │
                   └──────────────┘
```

**Opening a managed window:**

```
Page → window.tlsn.open(url)
  ↓ window.postMessage(TLSN_OPEN_WINDOW)
Content Script → browser.runtime.sendMessage(OPEN_WINDOW)
Background → WindowManager.registerWindow() → browser.windows.create()
```

**Request interception:**

```
Browser → HTTP request in managed window
  ↓ webRequest.onBeforeRequest
Background → WindowManager.addRequest()
  ↓ browser.tabs.sendMessage(UPDATE_TLSN_REQUESTS)
Content Script → Update TLSN overlay UI
```

### Mobile Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  Mobile App (Expo / RN, Hermes)               │
│                                                                │
│  PluginScreen ──► MobilePluginHost (runs plugin JS)           │
│      │                  │                                       │
│      │  openWindow()    │  prove()                             │
│      ▼                  ▼                                       │
│  PluginWebView      NativeProver ──► Rust prover (UniFFI)      │
│  (login + cookie/   (Swift / Kotlin)   packages/tlsn-mobile   │
│   header capture)                                              │
└──────────────────────────────────────────────────────────────┘
                          │ MPC-TLS over WebSocket
                          ▼
                   ┌──────────────┐
                   │   Verifier   │  (localhost:7047;
                   │              │   10.0.2.2 on Android emulator)
                   └──────────────┘
```

See [`app/mobile/README.md`](app/mobile/README.md#architecture) for the full plugin flow and native-bridge details.

## Getting Started

### Common Prerequisites

- **Node.js** >= 18
- **Rust** (for the verifier server and the native mobile prover) — install from [rustup.rs](https://rustup.rs/)

### Extension Prerequisites

- **Chrome/Chromium** browser

### Mobile Prerequisites

- **iOS**: Xcode (+ iOS simulator), CocoaPods
- **Android**: Android Studio (SDK, emulator, JDK) and the **Android NDK**
- Expo / EAS tooling (used via `npx`)

Rust cross-compilation targets, `cargo-ndk`, and the `tlsn` repo are auto-installed by `app/mobile/build.sh`. See [`app/mobile/README.md`](app/mobile/README.md#prerequisites) for the full tables and environment setup.

### Installation

```bash
git clone https://github.com/tlsnotary/tlsn-extension.git
cd tlsn-extension
npm install
```

This installs dependencies for all workspaces and sets up package links.

## Development

### Running the Verifier Server

Both clients need a verifier. Run it in a separate terminal:

```bash
cd servers
cargo run -p tlsn-verifier-server   # http://localhost:7047
```

**Verifier API endpoints:**

- `GET /health` - Health check
- `WS /session` - Create new verification session
- `WS /verifier?sessionId=<id>` - WebSocket verification endpoint
- `WS /proxy?token=<host>` - WebSocket proxy for TLS connections (compatible with notary.pse.dev)

**Webhook configuration** — configure `servers/verifier/config.yaml` to receive POST notifications after successful verifications:

```yaml
webhooks:
  'api.x.com':
    url: 'https://your-backend.example.com/webhook/twitter'
    headers:
      Authorization: 'Bearer your-secret-token'
  '*': # Wildcard for unmatched server names
    url: 'https://your-backend.example.com/webhook/default'
```

### Extension Development

```bash
npm run dev   # builds deps, then webpack-dev-server on :3000 (HMR)
```

Then load it in Chrome:

- Navigate to `chrome://extensions/`
- Enable "Developer mode" (top right)
- Click "Load unpacked" and select `packages/extension/build/`

The extension auto-reloads on file changes (manual refresh needed for manifest changes).

Package-specific scripts:

```bash
cd packages/extension
npm run dev | test | test:watch | test:coverage | lint | lint:fix
```

### Mobile Development

```bash
npm run mobile:ios       # build deps + native libs + launch iOS
npm run mobile:android   # build deps + native libs + launch Android
```

Or run the full pipeline from `app/mobile/` with options (`--no-run`, `--skip-deps`, `--rebuild-native`, `--clean`):

```bash
cd app/mobile
./build.sh ios
./build.sh android
```

Notes:

- The verifier at `localhost:7047` is reachable as-is on the iOS simulator; on the Android emulator the app rewrites `localhost` to `10.0.2.2`.
- The app uses native modules, so use `expo run:ios` / `expo run:android` (via `build.sh`) — **not** Expo Go.
- Plugin code runs under Hermes, which can't parse `async/await` in dynamically-evaluated code; mobile plugins are compiled to `es2016`. If you see "async functions are unsupported", rebuild plugins: `npm run build:plugins`.

See [`app/mobile/README.md`](app/mobile/README.md) for emulator clock sync, native logs, and troubleshooting.

### Building Plugins

Plugins live in [`packages/plugins`](packages/plugins) and are built for both clients:

```bash
npm run build:plugins   # writes dist/demo (browser) and dist/mobile (Hermes)
```

## Production Build & Publishing

### Extension → Chrome Web Store

From the repository root:

```bash
NODE_ENV=production npm run build
```

This builds dependencies, builds the extension with production optimizations, and creates `packages/extension/zip/extension-{version}.zip` (ready for the Chrome Web Store).

The easiest way to install the extension is from the [Chrome Web Store](https://chromewebstore.google.com/detail/tlsn-extension/gcfkkledipjbgdbimfpijgbkhajiaaph). For the full release process (versioning, CI, store upload), see [`RELEASING.md`](RELEASING.md).

### Mobile → App Store & Play Store

Mobile builds and submissions run on **EAS** (Expo Application Services). In short:

```bash
cd app/mobile
npx eas-cli build  --profile production --platform all
npx eas-cli submit --profile production --platform all
```

For versioning (note the mobile-specific `0.1.AABB` scheme), credentials, and store promotion, see [`app/mobile/RELEASING.md`](app/mobile/RELEASING.md).

### Build the Verifier for Production

```bash
cd servers
cargo build --release -p tlsn-verifier-server   # binary in servers/target/release/
```

## End-to-End Testing

To test the complete TLSN workflow with the **extension**:

1. **Start the verifier** and confirm it's up:

   ```bash
   cd servers && cargo run -p tlsn-verifier-server
   curl http://localhost:7047/health   # → ok
   ```

2. **Start the extension** in dev mode (`npm run dev`) and load `packages/extension/build/` in Chrome.

3. **Run a test plugin** via the demo:

   ```bash
   npm run demo   # http://localhost:8080
   ```

   Select a plugin; it opens a managed window to the target site, intercepts requests, connects to the verifier, shows a progress overlay, and runs the proof.

For the **mobile** end-to-end flow, start the verifier as above, then `npm run mobile:ios` / `npm run mobile:android` and run a plugin from the gallery.

### Testing Tips

- **Background service worker logs**: `chrome://extensions/` → Extension Details → "Inspect views: service worker"
- **Multiple windows**: the extension supports up to 10 concurrent managed windows
- **Mobile native logs**: `xcrun simctl spawn booted log stream | grep -i tlsn` (iOS) or `adb logcat | grep -i tlsn` (Android)
- **Verifier connection**: ensure the verifier is reachable before running proofs

## Websockify Integration

For WebSocket proxying of TLS connections (optional):

```bash
git clone https://github.com/novnc/websockify && cd websockify
./docker/build.sh

# For X.com
docker run -it --rm -p 55688:80 novnc/websockify 80 api.x.com:443
```

This proxies HTTPS connections through WebSocket for browser-based TLS operations.

## Building Plugins with Claude Code

This repo includes a [Claude Code](https://claude.ai/claude-code) slash command that scaffolds TLSNotary plugins interactively — API discovery, auth interception strategy, and a complete plugin file added to [`packages/plugins`](packages/plugins) (usable by both clients).

### Install

```bash
# Add the TLSNotary marketplace
/plugin marketplace add tlsnotary/tlsn-extension

# Install the create-plugin command
/plugin install tlsn-create-plugin@tlsnotary
```

### Usage

```bash
/create-plugin Garmin Connect badges
/create-plugin Reddit karma score
/create-plugin GitHub contribution count
```

See [`PLUGIN.md`](PLUGIN.md) for the plugin architecture, capabilities, and authoring guide.

## Resources

- [TLSNotary Documentation](https://docs.tlsnotary.org/)
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/) · [Manifest V3](https://developer.chrome.com/docs/extensions/mv3/intro/) · [webextension-polyfill](https://github.com/mozilla/webextension-polyfill)
- [Expo Documentation](https://docs.expo.dev/) · [React Native](https://reactnative.dev/) · [EAS Build](https://docs.expo.dev/build/introduction/)
- [App Store Connect](https://appstoreconnect.apple.com/) · [Google Play Console](https://play.google.com/console)

## License

This repository is licensed under either of:

- [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0)
- [MIT license](http://opensource.org/licenses/MIT)

at your option.
