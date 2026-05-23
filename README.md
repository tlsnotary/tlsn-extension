<img src="packages/extension/src/assets/img/icon-128.png" width="64"/>

# TLSN Extension Monorepo

A Chrome Extension for TLSNotary with plugin SDK and verifier server.

> [!IMPORTANT]
> When running the extension against a notary server, please ensure that the server's version is the same as the version of this extension.

## Table of Contents

- [Demo](#demo)
- [Tutorial](#tutorial)
- [Monorepo Structure](#monorepo-structure)
- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [Development](#development)
- [Production Build](#production-build)
- [End-to-End Testing](#end-to-end-testing)
- [Websockify Integration](#websockify-integration)
- [Publishing](#publishing)
- [License](#license)

## Demo

Try TLSNotary live at **[demo.tlsnotary.org](https://demo.tlsnotary.org)**: just install the extension and run any of the bundled plugins against the hosted verifier.

To run the demo locally (verifier + demo site via Docker):

```bash
npm run docker:up   # verifier on :7047, demo site on :80
npm run docker:down
```

Or serve just the demo site against your own verifier:

```bash
npm run demo        # http://localhost:8080
```

### Environment Variables

The demo uses `.env` files for configuration:

- `.env` - Local development defaults (`localhost:7047`)
- `.env.production` - Production settings (`demo.tlsnotary.org`, SSL enabled)

For Docker deployments, override via environment variables:

```bash
# Local development (default)
npm run docker:up

# Production with custom verifier
VITE_VERIFIER_HOST=verifier.example.com VITE_SSL=true docker compose up --build
```

## Tutorial

Want to write your own plugin? The [`tutorial`](packages/tutorial) package is an interactive 15-30 minute, hands-on walkthrough of building TLSNotary plugins — starting from a working Twitter plugin, then adapting it for a Swiss Bank balance proof (choosing what to reveal vs. redact). An optional "fool the verifier" challenge shows why careful server-side verification matters.

```bash
npm run tutorial

# Open http://localhost:8080 in your browser
```

## Monorepo Structure

This repository is organized as an npm workspaces monorepo with six main packages:

```
tlsn-extension/
├── packages/
│   ├── extension/           # Chrome Extension (Manifest V3)
│   │   ├── src/
│   │   │   ├── entries/
│   │   │   │   ├── Background/     # Service worker for extension logic
│   │   │   │   ├── Content/        # Content scripts injected into pages
│   │   │   │   ├── Popup/          # Extension popup UI (optional)
│   │   │   │   └── Offscreen/      # Offscreen document for DOM operations
│   │   │   ├── manifest.json
│   │   │   └── utils/
│   │   ├── webpack.config.js
│   │   └── package.json
│   │
│   ├── plugin-sdk/          # SDK for developing TLSN plugins
│   │   ├── src/
│   │   ├── examples/
│   │   └── package.json
│   │
│   ├── common/              # Shared utilities (logging system)
│   │   ├── src/
│   │   │   └── logger/           # Centralized logging with configurable levels
│   │   └── package.json
│   │
│   ├── demo/                # Demo server with Docker setup
│   │   ├── *.js                  # Example plugin files
│   │   └── docker-compose.yml    # Docker services configuration
│   │
│   ├── tutorial/            # Tutorial examples
│   │   └── *.js                  # Tutorial plugin files
│   │
│   └── tlsn-wasm/           # Local TLSN WebAssembly build (optional, gitignored)
│       └── build.sh              # Builds `tlsn-wasm` into ../tlsn-wasm-pkg/
│
├── servers/                 # Rust Cargo workspace (deployable servers)
│   ├── Cargo.toml                # Workspace root
│   ├── verifier/                 # WebSocket server for TLSNotary verification
│   │   ├── src/main.rs           # Server setup, routing, and verification
│   │   ├── config.yaml           # Webhook configuration
│   │   └── Cargo.toml
│   └── swissbank/                # Fake Swiss bank with dashboard UI (demo target)
│       ├── src/
│       └── Cargo.toml
│
├── package.json             # Root npm workspace configuration
└── README.md
```

### Package Details

#### 1. **extension** - Chrome Extension (Manifest V3)

A browser extension that enables TLSNotary functionality with the following key features:

- **Multi-Window Management**: Track multiple browser windows with request interception
- **Request Interception**: Capture HTTP/HTTPS requests from managed windows
- **Plugin Execution**: Run sandboxed JavaScript plugins using QuickJS
- **TLSN Overlay**: Visual display of intercepted requests

**Key Entry Points:**

- `Background`: Service worker for extension logic, window management, and message routing
- `Content`: Scripts injected into pages for communication and overlay display
- `Popup`: Optional extension popup UI
- `Offscreen`: Background DOM operations for service worker limitations

#### 2. **plugin-sdk** - Plugin Development SDK

SDK for developing and running TLSN WebAssembly plugins with QuickJS sandboxing:

- Secure JavaScript execution in isolated WebAssembly environment
- Host capability system for controlled plugin access
- React-like hooks: `useHeaders()`, `useRequests()`, `useEffect()`, `useState()`, `setState()`
- Isomorphic package for Node.js and browser environments
- TypeScript support with full type declarations

#### 3. **common** - Shared Utilities

Centralized logging system used across packages:

- Configurable log levels: `DEBUG`, `INFO`, `WARN`, `ERROR`
- Timestamped output with level prefixes
- Singleton pattern for consistent logging across modules

#### 4. **verifier** - Verifier Server

Rust-based HTTP/WebSocket server for TLSNotary verification:

- Health check endpoint (`GET /health`)
- Session creation endpoint (`WS /session`)
- WebSocket verification endpoint (`WS /verifier?sessionId=<id>`)
- WebSocket proxy endpoint (`WS /proxy?token=<host>`) - compatible with notary.pse.dev
- Webhook API for POST notifications to external services
- YAML configuration for webhook endpoints (`config.yaml`)
- CORS enabled for cross-origin requests
- Runs on `localhost:7047` by default

#### 5. **demo** - Demo Server

Docker-based demo environment with:

- Pre-configured example plugins (Twitter, SwissBank)
- React + Vite frontend with environment-based configuration
- Docker Compose setup with verifier and nginx
- Configurable verifier URLs via `.env` files or Docker build args

#### 6. **tlsn-wasm** - TLSN WebAssembly (local build helper)

The extension depends on the published [`tlsn-wasm`](https://www.npmjs.com/package/tlsn-wasm) npm package by default. For local development against an unreleased `tlsn` revision, `packages/tlsn-wasm/build.sh` clones the `tlsn` repo and builds `packages/tlsn-wasm-pkg/` (gitignored). Run `npm link` from there and `npm link tlsn-wasm` inside `packages/extension` to override the published package.

## Architecture Overview

### Extension Architecture

The extension uses a message-passing architecture with five main entry points:

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser Extension                         │
│                                                               │
│  ┌──────────────┐      ┌──────────────┐                      │
│  │  Background  │◄────►│   Content    │◄──── Page Scripts    │
│  │    (SW)      │      │   Script     │                      │
│  └──────┬───────┘      └──────────────┘                      │
│         │                                                     │
│         ├─► Window Management (WindowManager)                │
│         ├─► Request Interception (webRequest API)            │
│         ├─► Session Management (SessionManager)              │
│         └─► Message Routing                                  │
│                                                               │
│  ┌──────────────┐                                            │
│  │   Offscreen  │                                            │
│  │  (Background)│                                            │
│  └──────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                   ┌──────────────┐
                   │   Verifier   │
                   │    Server    │
                   │ (localhost:  │
                   │    7047)     │
                   └──────────────┘
```

### Message Flow

**Opening a Managed Window:**

```
Page → window.tlsn.open(url)
  ↓ window.postMessage(TLSN_OPEN_WINDOW)
Content Script → event listener
  ↓ browser.runtime.sendMessage(OPEN_WINDOW)
Background → WindowManager.registerWindow()
  ↓ browser.windows.create()
  ↓ Returns window info with UUID
```

**Request Interception:**

```
Browser → HTTP request in managed window
  ↓ webRequest.onBeforeRequest
Background → WindowManager.addRequest()
  ↓ browser.tabs.sendMessage(UPDATE_TLSN_REQUESTS)
Content Script → Update TLSN overlay UI
```

## Getting Started

### Prerequisites

- **Node.js** >= 18
- **Rust** (for verifier server) - Install from [rustup.rs](https://rustup.rs/)
- **Chrome/Chromium** browser

### Installation

1. Clone the repository:

```bash
git clone https://github.com/tlsnotary/tlsn-extension.git
cd tlsn-extension
```

2. Install all dependencies:

```bash
npm install
```

This installs dependencies for all packages in the monorepo and automatically sets up workspace links between packages.

## Development

### Running the Extension in Development Mode

1. Start the development server:

```bash
npm run dev
```

This automatically builds all dependencies (common, plugin-sdk) and then starts webpack-dev-server on port 3000 with hot module replacement. Files are written to `packages/extension/build/`.

2. Load the extension in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" toggle (top right)
   - Click "Load unpacked"
   - Select the `packages/extension/build/` folder

3. The extension will auto-reload on file changes (manual refresh needed for manifest changes).

### Running the Verifier Server

The verifier server is required for E2E testing. Run it in a separate terminal:

```bash
cd servers
cargo run -p tlsn-verifier-server
```

The server will start on `http://localhost:7047`.

**Verifier API Endpoints:**

- `GET /health` - Health check
- `WS /session` - Create new verification session
- `WS /verifier?sessionId=<id>` - WebSocket verification endpoint
- `WS /proxy?token=<host>` - WebSocket proxy for TLS connections (compatible with notary.pse.dev)

**Webhook Configuration:**
Configure `servers/verifier/config.yaml` to receive POST notifications after successful verifications:

```yaml
webhooks:
  'api.x.com':
    url: 'https://your-backend.example.com/webhook/twitter'
    headers:
      Authorization: 'Bearer your-secret-token'
  '*': # Wildcard for unmatched server names
    url: 'https://your-backend.example.com/webhook/default'
```

### Package-Specific Development

**Extension:**

```bash
cd packages/extension
npm run dev              # Development mode
npm run test             # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report
npm run lint             # Lint check
npm run lint:fix         # Auto-fix linting issues
```

**Plugin SDK:**

```bash
cd packages/plugin-sdk
npm run build            # Build SDK
npm run test             # Run tests
npm run lint             # Run all linters
npm run lint:fix         # Auto-fix issues
```

> **Note:** The plugin-SDK builds automatically when the extension is built, so manual building is usually not necessary.

**Verifier:**

```bash
cd servers
cargo run -p tlsn-verifier-server                # Development mode
cargo build --release    # Production build
cargo test               # Run tests
```

## Production Build

### Build Extension for Production

From the repository root:

```bash
NODE_ENV=production npm run build
```

This automatically:

1. Builds dependencies (`@tlsn/common` and `@tlsn/plugin-sdk`)
2. Builds the extension with production optimizations
3. Creates:
   - Optimized build in `packages/extension/build/`
   - Packaged extension in `packages/extension/zip/extension-{version}.zip`

The zip file is ready for Chrome Web Store submission.

**Alternative build commands:**

- `npm run build:extension` - Build only the extension (assumes dependencies are built)
- `npm run build:deps` - Build only the dependencies

### Build All Packages

```bash
npm run build:all
```

This builds all packages in the monorepo (extension, plugin-sdk).

### Build Verifier for Production

```bash
cd servers
cargo build --release -p tlsn-verifier-server
```

The binary will be in `servers/target/release/`.

## End-to-End Testing

To test the complete TLSN workflow:

### 1. Start the Verifier Server

In a terminal:

```bash
cd servers
cargo run -p tlsn-verifier-server
```

Verify it's running:

```bash
curl http://localhost:7047/health
# Should return: ok
```

### 2. Start the Extension in Development Mode

In another terminal:

```bash
npm run dev
```

Load the extension in Chrome (see [Getting Started](#getting-started)).

### 3. Run a Test Plugin

Use the demo or tutorial packages to test plugins:

```bash
# Serve demo page
npm run demo
# Open http://localhost:8080 in your browser
```

1. Ensure the verifier is running on `localhost:7047`
2. Select a plugin from the demo page
3. The plugin will:
   - Open a new window to the target site
   - Intercept requests
   - Create a prover connection to the verifier
   - Display a UI overlay showing progress
   - Execute the proof workflow

### 4. Verify Request Interception

When a managed window is opened:

1. An overlay appears showing "TLSN Plugin In Progress"
2. Intercepted requests are listed in real-time
3. Request count updates as more requests are captured

### Testing Tips

- **Monitor Background Service Worker**: Open Chrome DevTools for the background service worker via `chrome://extensions/` → Extension Details → "Inspect views: service worker"
- **Check Console Logs**: Look for WindowManager logs, request interception logs, and message routing logs
- **Test Multiple Windows**: Try opening multiple managed windows simultaneously (max 10)
- **Verifier Connection**: Ensure verifier is accessible at `localhost:7047` before running proofs

## Websockify Integration

For WebSocket proxying of TLS connections (optional):

### Build Websockify Docker Image

```bash
git clone https://github.com/novnc/websockify && cd websockify
./docker/build.sh
```

### Run Websockify

```bash
# For X.com
docker run -it --rm -p 55688:80 novnc/websockify 80 api.x.com:443

# For Twitter
docker run -it --rm -p 55688:80 novnc/websockify 80 api.twitter.com:443
```

This proxies HTTPS connections through WebSocket for browser-based TLS operations.

## Building Plugins with Claude Code

This repo includes a [Claude Code](https://claude.ai/claude-code) slash command that scaffolds TLSNotary plugins interactively. It guides you through API discovery, auth interception strategy, and generates a complete plugin file.

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

The command will:

1. Research the target service's API endpoints
2. Plan the auth interception strategy
3. Generate a complete plugin `.ts` file with UI, proof handlers, and progress bar
4. Show you how to build and test it

## Publishing

### Chrome Web Store

1. Create a production build:

```bash
NODE_ENV=production npm run build
```

2. Test the extension thoroughly

3. Upload `packages/extension/zip/extension-{version}.zip` to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)

4. Follow the [Chrome Web Store publishing guide](https://developer.chrome.com/webstore/publish)

### Pre-built Extension

The easiest way to install the TLSN browser extension is from the [Chrome Web Store](https://chromewebstore.google.com/detail/tlsn-extension/gcfkkledipjbgdbimfpijgbkhajiaaph).

## Resources

- [TLSNotary Documentation](https://docs.tlsnotary.org/)
- [Webpack Documentation](https://webpack.js.org/concepts/)
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill)

## License

This repository is licensed under either of:

- [Apache License, Version 2.0](http://www.apache.org/licenses/LICENSE-2.0)
- [MIT license](http://opensource.org/licenses/MIT)

at your option.
