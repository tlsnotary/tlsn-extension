<img src="packages/extension/src/assets/img/icon-128.png" width="64"/>

# TLSN Extension Monorepo

A Chrome Extension for TLSNotary with plugin SDK and verifier server.

> [!IMPORTANT]
> When running the extension against a notary server, please ensure that the server's version is the same as the version of this extension.

## Table of Contents

- [Monorepo Structure](#monorepo-structure)
- [Architecture Overview](#architecture-overview)
- [Getting Started](#getting-started)
- [Development](#development)
- [Production Build](#production-build)
- [End-to-End Testing](#end-to-end-testing)
- [Websockify Integration](#websockify-integration)
- [Publishing](#publishing)
- [License](#license)

## Monorepo Structure

This repository is organized as an npm workspaces monorepo with four main packages:

```
tlsn-extension/
├── packages/
│   ├── extension/           # Chrome Extension (Manifest V3)
│   │   ├── src/
│   │   │   ├── entries/
│   │   │   │   ├── Background/     # Service worker for extension logic
│   │   │   │   ├── Content/        # Content scripts injected into pages
│   │   │   │   ├── DevConsole/     # Developer Console with code editor
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
│   ├── verifier/            # Rust-based verifier server
│   │   ├── src/
│   │   │   ├── main.rs           # Server setup and routing
│   │   │   ├── config.rs         # Configuration constants
│   │   │   └── verifier.rs       # TLSNotary verification logic
│   │   └── Cargo.toml
│   │
│   └── tlsn-wasm-pkg/       # Pre-built TLSN WebAssembly package
│       └── (WASM binaries)
│
├── package.json             # Root workspace configuration
└── README.md
```

### Package Details

#### 1. **extension** - Chrome Extension (Manifest V3)
A browser extension that enables TLSNotary functionality with the following key features:
- **Multi-Window Management**: Track multiple browser windows with request interception
- **Developer Console**: Interactive code editor for writing and testing TLSN plugins
- **Request Interception**: Capture HTTP/HTTPS requests from managed windows
- **Plugin Execution**: Run sandboxed JavaScript plugins using QuickJS
- **TLSN Overlay**: Visual display of intercepted requests

**Key Entry Points:**
- `Background`: Service worker for extension logic, window management, and message routing
- `Content`: Scripts injected into pages for communication and overlay display
- `DevConsole`: Code editor page accessible via right-click context menu
- `Popup`: Optional extension popup UI
- `Offscreen`: Background DOM operations for service worker limitations

#### 2. **plugin-sdk** - Plugin Development SDK
SDK for developing and running TLSN WebAssembly plugins with QuickJS sandboxing:
- Secure JavaScript execution in isolated WebAssembly environment
- Host capability system for controlled plugin access
- Isomorphic package for Node.js and browser environments
- TypeScript support with full type declarations

#### 3. **verifier** - Verifier Server
Rust-based HTTP/WebSocket server for TLSNotary verification:
- Health check endpoint (`/health`)
- Session creation endpoint (`/session`)
- WebSocket verification endpoint (`/verifier`)
- CORS enabled for cross-origin requests
- Runs on `localhost:7047` by default

#### 4. **tlsn-wasm-pkg** - TLSN WebAssembly Package
Pre-built WebAssembly binaries for TLSNotary functionality in the browser.

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
│  ┌──────────────┐      ┌──────────────┐                      │
│  │ DevConsole   │      │   Offscreen  │                      │
│  │  (Editor)    │      │  (Background)│                      │
│  └──────────────┘      └──────────────┘                      │
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

This will install dependencies for all packages in the monorepo.

## Development

### Running the Extension in Development Mode

1. Start the development server:
```bash
npm run dev
```

This starts webpack-dev-server on port 3000 with hot module replacement. Files are written to `packages/extension/build/`.

2. Load the extension in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" toggle (top right)
   - Click "Load unpacked"
   - Select the `packages/extension/build/` folder

3. The extension will auto-reload on file changes (manual refresh needed for manifest changes).

### Running the Verifier Server

The verifier server is required for E2E testing. Run it in a separate terminal:

```bash
cd packages/verifier
cargo run
```

The server will start on `http://localhost:7047`.

**Verifier API Endpoints:**
- `GET /health` - Health check
- `POST /session` - Create new verification session
- `WS /verifier?sessionId=<id>` - WebSocket verification endpoint

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

**Verifier:**
```bash
cd packages/verifier
cargo run                # Development mode
cargo build --release    # Production build
cargo test               # Run tests
```

## Production Build

### Build Extension for Production

From the repository root:

```bash
NODE_ENV=production npm run build
```

This creates:
- Optimized build in `packages/extension/build/`
- Packaged extension in `packages/extension/zip/tlsn-extension-{version}.zip`

The zip file is ready for Chrome Web Store submission.

### Build All Packages

```bash
npm run build:all
```

This builds all packages in the monorepo (extension, plugin-sdk).

### Build Verifier for Production

```bash
cd packages/verifier
cargo build --release
```

The binary will be in `target/release/`.

## End-to-End Testing

To test the complete TLSN workflow:

### 1. Start the Verifier Server

In a terminal:
```bash
cd packages/verifier
cargo run
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

### 3. Open the Developer Console

1. Right-click anywhere on any web page
2. Select "Developer Console" from the context menu
3. A new tab will open with the code editor

### 4. Run a Test Plugin

The Developer Console comes with a default X.com profile prover plugin. To test:

1. Ensure the verifier is running on `localhost:7047`
2. Review the default code in the editor (or modify as needed)
3. Click "▶️ Run Code" button
4. The plugin will:
   - Open a new window to X.com
   - Intercept requests
   - Create a prover connection to the verifier
   - Display a UI overlay showing progress
   - Execute the proof workflow

**Console Output:**
- Execution status and timing
- Plugin logs and results
- Any errors encountered

### 5. Verify Request Interception

When a managed window is opened:
1. An overlay appears showing "TLSN Plugin In Progress"
2. Intercepted requests are listed in real-time
3. Request count updates as more requests are captured

### Testing Different Plugins

You can write custom plugins in the Developer Console editor:

```javascript
// Example: Simple plugin that generates a proof
const config = {
  name: 'My Plugin',
  description: 'A custom TLSN plugin'
};

async function onClick() {
  console.log('Starting proof...');

  // Wait for specific headers to be intercepted
  const [header] = useHeaders(headers => {
    return headers.filter(h => h.url.includes('example.com'));
  });

  console.log('Captured header:', header);

  // Generate proof using unified prove() API
  const proof = await prove(
    // Request options
    {
      url: 'https://example.com/api/endpoint',
      method: 'GET',
      headers: {
        'Authorization': header.requestHeaders.find(h => h.name === 'Authorization')?.value,
        'Accept-Encoding': 'identity',
        'Connection': 'close',
      },
    },
    // Prover options
    {
      verifierUrl: 'http://localhost:7047',
      proxyUrl: 'wss://notary.pse.dev/proxy?token=example.com',
      maxRecvData: 16384,
      maxSentData: 4096,
      handlers: [
        { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
        { type: 'RECV', part: 'START_LINE', action: 'REVEAL' },
        { type: 'RECV', part: 'BODY', action: 'REVEAL',
          params: { type: 'json', path: 'username' } }
      ]
    }
  );

  console.log('Proof generated:', proof);
  done(JSON.stringify(proof));
}

function main() {
  const [header] = useHeaders(headers => {
    return headers.filter(h => h.url.includes('example.com'));
  });

  // Open a managed window on first render
  useEffect(() => {
    openWindow('https://example.com');
  }, []);

  // Render plugin UI component
  return div({}, [
    div({}, [header ? 'Ready to prove' : 'Waiting for headers...']),
    header ? button({ onclick: 'onClick' }, ['Generate Proof']) : null
  ]);
}

export default {
  main,
  onClick,
  config,
};
```

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

## Publishing

### Chrome Web Store

1. Create a production build:
```bash
NODE_ENV=production npm run build
```

2. Test the extension thoroughly

3. Upload `packages/extension/zip/tlsn-extension-{version}.zip` to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)

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
