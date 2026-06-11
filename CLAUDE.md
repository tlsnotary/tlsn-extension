# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Monorepo Commands (from root)

- `npm install` - Install all dependencies for all packages and set up workspace links
- `npm run dev` - Start extension development server on port 3000 (auto-builds dependencies)
- `npm run build` - Build production extension (auto-builds dependencies first)
- `npm run build:deps` - Build only dependencies (@tlsn/common, @tlsn/plugin-sdk, @tlsn/plugins)
- `npm run build:plugins` - Build only the shared plugins (@tlsn/plugins → dist/demo + dist/mobile)
- `npm run build:extension` - Build only extension (assumes dependencies are built)
- `npm run build:all` - Build all packages in monorepo
- `npm run test` - Run tests for all packages
- `npm run lint` - Run linting for all packages
- `npm run lint:fix` - Auto-fix linting issues for all packages
- `npm run serve:test` - Serve test page on port 8081
- `npm run clean` - Remove all node_modules, dist, and build directories
- `npm run demo` - Serve demo page on port 8080
- `npm run tutorial` - Serve tutorial page on port 8080
- `npm run docker:up` - Start demo Docker services (verifier + nginx)
- `npm run docker:down` - Stop demo Docker services
- `npm run mobile:ios` - Build deps + native libs and launch the mobile app on iOS
- `npm run mobile:android` - Build deps + native libs and launch the mobile app on Android

### Extension Package Commands

- `npm run build` - Production build with zip creation
- `npm run build:webpack` - Direct webpack build
- `npm run dev` - Start webpack dev server with hot reload
- `npm run test` - Run Vitest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report
- `npm run lint` / `npm run lint:fix` - ESLint checks and fixes
- `npm run serve:test` - Python HTTP server for integration tests

### Common Package Commands (`packages/common`)

- `npm run build` - Build TypeScript to dist/
- `npm run test` - Run Vitest tests
- `npm run lint` - Run all linters (ESLint, Prettier, TypeScript)
- `npm run lint:fix` - Auto-fix linting issues

### Plugin SDK Package Commands

- `npm run build` - Build isomorphic package with Vite + TypeScript declarations
- `npm run test` - Run Vitest tests
- `npm run test:coverage` - Generate test coverage
- `npm run lint` - Run all linters (ESLint, Prettier, TypeScript)
- `npm run lint:fix` - Auto-fix linting issues

### Mobile App Commands (`app/mobile`)

Run from `app/mobile/` (or use the `npm run mobile:*` root scripts):

- `./build.sh ios` - Build JS deps + native libs and launch on iOS
- `./build.sh android` - Build JS deps + native libs and launch on Android
- `./build.sh --native` - Rebuild native libraries for both platforms
- `./build.sh --help` - All options (`--no-run`, `--skip-deps`, `--rebuild-native`, `--clean`)
- `npm run lint` / `npm run test` - Lint and test the mobile package

The native prover lives in `packages/tlsn-mobile` (`build-ios.sh`, `build-android.sh`);
`app/mobile/build.sh` invokes these automatically when artifacts are missing.

### Servers Workspace Commands (`servers/`)

Cargo workspace containing all Rust deployables (verifier, swissbank). Run from
`servers/`:

- `cargo test --workspace` - Test all crates
- `cargo build --release -p tlsn-verifier-server` - Build verifier binary
- `cargo build --release -p swissbank` - Build swissbank binary
- `cargo run -p tlsn-verifier-server` - Run verifier on port 7047
- `cargo run -p swissbank` - Run swissbank on port 3000

## Monorepo Architecture

The project ships **two TLSNotary clients** — the Chrome extension and the mobile
app — that share one plugin system, one plugin registry (`@tlsn/plugins`), and the
same verifier server. It is organized as a monorepo with three top-level workspaces:

- **`packages/`** — npm workspaces (TypeScript projects):
  - **`packages/common`**: Shared utilities (logging system) used across packages
  - **`packages/extension`**: Chrome Extension (Manifest V3) — browser client
  - **`packages/plugin-sdk`**: SDK for developing/running TLSN plugins using QuickJS sandboxing
  - **`packages/plugins`**: Shared plugin sources + registry (`src/registry.ts`), built for demo (browser) and mobile (Hermes) targets
  - **`packages/demo`**: Extension demo frontend with Docker setup
  - **`packages/tutorial`**: Tutorial examples for learning plugin development
  - **`packages/eas-webhook`**: Demo service turning verifier webhooks into EAS attestations
  - **`packages/tlsn-mobile`**: Native Rust prover for mobile (iOS `.xcframework` + Android `.so` via UniFFI)
  - **`packages/tlsn-wasm`** / **`packages/tlsn-wasm-pkg`**: Local TLSN WebAssembly build helper + its (gitignored) output
  - **`packages/ts-plugin-sample`**: Minimal TypeScript plugin sample
- **`app/`** — npm workspaces (applications):
  - **`app/mobile`**: React Native / Expo app (iOS + Android) — mobile client
- **`servers/`** — Rust Cargo workspace (deployable servers):
  - **`servers/verifier`**: WebSocket server for TLSNotary verification (port 7047)
  - **`servers/swissbank`**: Fake Swiss bank with dashboard UI, used as a demo target (port 3000)

**Build Dependencies:**
Both clients depend on `@tlsn/common`, `@tlsn/plugin-sdk`, and `@tlsn/plugins`. These must be built first:

```bash
# From root - builds all dependencies automatically
npm run dev            # extension
npm run mobile:ios     # mobile (also builds native libs)

# Or manually build dependencies first
cd packages/common && npm run build
cd packages/plugin-sdk && npm run build
cd packages/plugins && npm run build   # → dist/demo (browser) + dist/mobile (Hermes es2016)
cd packages/extension && npm run dev
```

**Important**: Each client must match the version of the notary/verifier server it connects to.

## Extension Architecture Overview

### Extension Entry Points

The extension has 5 main entry points defined in `webpack.config.js`:

#### 1. **Background Service Worker** (`src/entries/Background/index.ts`)

Core responsibilities:

- **Multi-Window Management**: Uses `WindowManager` class to track multiple browser windows simultaneously
- **Session Management**: Uses `SessionManager` class for plugin session lifecycle (imported but not yet integrated)
- **Request Interception**: Uses `webRequest.onBeforeRequest` API to intercept HTTP requests per window
- **Request Storage**: Each window maintains its own request history (max 1000 requests per window)
- **Message Routing**: Forwards messages between content scripts, popup, and injected page scripts
- **Offscreen Document Management**: Creates offscreen documents for background DOM operations (Chrome 109+)
- **Automatic Cleanup**: Periodic cleanup of invalid windows every 5 minutes
- Uses `webextension-polyfill` for cross-browser compatibility

Key message handlers:

- `PING` → `PONG` (connectivity test)
- `OPEN_WINDOW` → Creates new managed window with URL validation, request tracking, and optional overlay
- `TLSN_CONTENT_TO_EXTENSION` → Legacy handler that opens x.com window (backward compatibility)
- `CONTENT_SCRIPT_READY` → Triggers plugin UI re-render when content script initializes in a managed window

#### 2. **Content Script** (`src/entries/Content/index.ts`)

Injected into all HTTP/HTTPS pages via manifest. Responsibilities:

- **Script Injection**: Injects `content.bundle.js` into page context to expose page-accessible API
- **Plugin UI Rendering**: Renders plugin UI from DOM JSON into actual DOM elements in container
- **Message Bridge**: Bridges messages between page scripts and extension background
- **Lifecycle Notifications**: Notifies background when content script is ready

Message handlers:

- `GET_PAGE_INFO` → Returns page title, URL, domain
- `RE_RENDER_PLUGIN_UI` → Renders plugin UI from DOM JSON structure into DOM container
- `HIDE_TLSN_OVERLAY` → Removes plugin UI container and clears state

Window message handler:

- Listens for `TLSN_CONTENT_SCRIPT_MESSAGE` from page scripts
- Forwards to background via `TLSN_CONTENT_TO_EXTENSION`

On initialization:

- Sends `CONTENT_SCRIPT_READY` message to background to trigger UI re-render for managed windows

#### 3. **Content Module** (`src/entries/Content/content.ts`)

Injected script running in page context (not content script context):

- **Page API**: Exposes `window.tlsn` object to web pages with:
  - `sendMessage(data)`: Legacy method for backward compatibility
  - `open(url, options)`: Opens new managed window with request interception
- **Lifecycle Event**: Dispatches `extension_loaded` custom event when ready
- **Web Accessible Resource**: Listed in manifest's `web_accessible_resources`

Page API usage:

```javascript
// Open a new window with request tracking
await window.tlsn.open('https://x.com', {
  width: 900,
  height: 700,
  showOverlay: true,
});

// Legacy method
window.tlsn.sendMessage({ action: 'startTLSN' });
```

#### 4. **Popup UI** (`src/entries/Popup/index.tsx`)

React-based extension popup:

- **Simple Interface**: "Hello World" boilerplate with test button
- **Redux Integration**: Connected to Redux store via `react-redux`
- **Message Sending**: Can send messages to background script
- **Styling**: Uses Tailwind CSS with custom button/input classes
- Entry point: `popup.html` (400x300px default size)

#### 5. **Offscreen Document** (`src/entries/Offscreen/index.tsx`)

Isolated React component for background processing:

- **Purpose**: Handles DOM operations unavailable in service workers
- **SessionManager Integration**: Executes plugin code via `SessionManager.executePlugin()`
- **Message Handling**: Listens for `EXEC_CODE` messages from background script
- **Lifecycle**: Created dynamically by background script, reused if exists
- Entry point: `offscreen.html`

### Key Classes

#### **WindowManager** (`src/background/WindowManager.ts`)

Centralized management for multiple browser windows:

- **Window Tracking**: Maintains Map of window ID to ManagedWindow objects
- **Request History**: Each window stores up to 1000 intercepted requests
- **Overlay Control**: Shows/hides TLSN overlay per window with retry logic
- **Lifecycle Management**: Register, close, lookup windows by ID or tab ID
- **Window Limits**: Enforces maximum of 10 managed windows
- **Auto-cleanup**: Removes invalid windows on periodic intervals

Key methods:

- `registerWindow(config)`: Create new managed window with UUID
- `addRequest(windowId, request)`: Add intercepted request to window
- `showOverlay(windowId)`: Display request overlay (with retry)
- `cleanupInvalidWindows()`: Remove closed windows from tracking

#### **SessionManager** (`src/offscreen/SessionManager.ts`)

Plugin session management with TLSNotary proof generation:

- Uses `@tlsn/plugin-sdk` Host class for sandboxed plugin execution
- Provides unified `prove()` capability to plugins via QuickJS environment
- Integrates with `ProveManager` for WASM-based TLS proof generation
- Uses WASM `compute_reveal()` for handler-based byte-range extraction from HTTP transcripts

**Key Capability - Unified prove() API:**
The SessionManager exposes a single `prove()` function to plugins that handles the entire proof pipeline:

1. Creates prover connection to verifier server
2. Sends HTTP request through TLS prover
3. Captures TLS transcript (sent/received bytes)
4. Computes reveal ranges via WASM `compute_reveal()` (Rust/spansy-based HTTP parsing + handler-to-byte-range mapping)
5. Applies selective reveal handlers to show only specified data
6. Generates and returns cryptographic proof

**Handler System:**
Plugins control what data is revealed in proofs using Handler objects:

- `type`: `'SENT'` (request data) or `'RECV'` (response data)
- `part`: `'START_LINE'`, `'PROTOCOL'`, `'METHOD'`, `'REQUEST_TARGET'`, `'STATUS_CODE'`, `'HEADERS'`, `'BODY'`
- `action`: `'REVEAL'` (plaintext) or `'HASH'` (hash commitment)
- `params`: Optional parameters for granular control (e.g., `hideKey`, `hideValue`, `type: 'json'`, `path`)

Example prove() call:

```javascript
const proof = await prove(
  { url: 'https://api.x.com/endpoint', method: 'GET', headers: {...} },
  {
    verifierUrl: 'http://localhost:7047',
    proxyUrl: 'wss://notary.pse.dev/proxy?token=api.x.com',
    maxRecvData: 16384,
    maxSentData: 4096,
    handlers: [
      { type: 'SENT', part: 'START_LINE', action: 'REVEAL' },
      { type: 'RECV', part: 'BODY', action: 'REVEAL',
        params: { type: 'json', path: 'screen_name', hideKey: true } }
    ]
  }
);
```

### State Management

Redux store located in `src/reducers/index.tsx`:

- **App State Interface**: `{ message: string, count: number }`
- **Action Creators**:
  - `setMessage(message: string)` - Updates message state
  - `incrementCount()` - Increments counter
- **Store Configuration** (`src/utils/store.ts`):
  - Development: Uses `redux-thunk` + `redux-logger` middleware
  - Production: Uses `redux-thunk` only
- **Type Safety**: Exports `RootState` and `AppRootState` types

### Message Passing Architecture

**Page → Extension Flow (Window Opening)**:

```
Page: window.tlsn.open(url)
  ↓ window.postMessage(TLSN_OPEN_WINDOW)
Content Script: event listener
  ↓ browser.runtime.sendMessage(OPEN_WINDOW)
Background: WindowManager.registerWindow()
  ↓ browser.windows.create()
  ↓ Returns window info
```

**Request Interception Flow**:

```
Browser: HTTP request in managed window
  ↓ webRequest.onBeforeRequest
Background: WindowManager.addRequest()
  ↓ browser.tabs.sendMessage(UPDATE_TLSN_REQUESTS)
Content Script: Update overlay UI
```

**Plugin UI Re-rendering Flow**:

```
Content Script: Loads in managed window
  ↓ browser.runtime.sendMessage(CONTENT_SCRIPT_READY)
Background: Receives CONTENT_SCRIPT_READY
  ↓ WindowManager.reRenderPluginUI(windowId)
  ↓ SessionManager calls main(true) to force re-render
  ↓ browser.tabs.sendMessage(RE_RENDER_PLUGIN_UI)
Content Script: Renders plugin UI from DOM JSON
```

**Multi-Window Management**:

- Each window has unique UUID and separate request history
- Overlay updates are sent only to the specific window's tab
- Windows are tracked by both Chrome window ID and tab ID
- Maximum 10 concurrent managed windows

**Security**:

- Content script validates origin (`event.origin === window.location.origin`)
- URL validation using `validateUrl()` utility before window creation
- Request interception limited to managed windows only

### TLSN Overlay Feature

The overlay is a full-screen modal showing intercepted requests:

- **Design**: Dark gradient background (rgba(0,0,0,0.85)) with glassmorphic message box
- **Content**:
  - Header: "TLSN Plugin In Progress" with gradient text
  - Request list: Scrollable container showing METHOD + URL for each request
  - Request count: Displayed in header
- **Styling**: Inline CSS with animations (fadeInScale), custom scrollbar styling
- **Updates**: Real-time updates as new requests are intercepted
- **Lifecycle**: Created when TLSN window opens, updated via background messages, cleared on window close

### Build Configuration

**Webpack 5 Setup** (`webpack.config.js`):

- **Entry Points**: popup, background, contentScript, content, offscreen
- **Output**: `build/` directory with `[name].bundle.js` pattern
- **Loaders**:
  - `ts-loader` - TypeScript compilation (transpileOnly in dev)
  - `babel-loader` - JavaScript transpilation with React Refresh
  - `style-loader` + `css-loader` + `postcss-loader` + `sass-loader` - Styling pipeline
  - `html-loader` - HTML templates
  - `asset/resource` - File assets (images, fonts)
- **Plugins**:
  - `ReactRefreshWebpackPlugin` - Hot module replacement (dev only)
  - `CleanWebpackPlugin` - Cleans build directory
  - `CopyWebpackPlugin` - Copies manifest, icons, CSS files
  - `HtmlWebpackPlugin` - Generates popup.html and offscreen.html
  - `TerserPlugin` - Code minification (production only)
- **Dev Server** (`utils/webserver.js`):
  - Port: 3000 (configurable via `PORT` env var)
  - Hot reload enabled with `webpack/hot/dev-server`
  - Writes to disk for Chrome to load (`writeToDisk: true`)
  - WebSocket transport for HMR

**Production Build** (`utils/build.js`):

- Adds `ZipPlugin` to create `tlsn-extension-{version}.zip` in `zip/` directory
- Uses package.json version for naming
- Exits with code 1 on errors or warnings

### Extension Permissions

Defined in `src/manifest.json`:

- `offscreen` - Create offscreen documents for background processing
- `webRequest` - Intercept HTTP/HTTPS requests
- `storage` - Persistent local storage
- `activeTab` - Access active tab information
- `tabs` - Tab management (create, query, update)
- `windows` - Window management (create, track, remove)
- `host_permissions: ["<all_urls>"]` - Access all URLs for request interception
- `content_scripts` - Inject into all HTTP/HTTPS pages
- `web_accessible_resources` - Make content.bundle.js, CSS, and icons accessible to pages
- `content_security_policy` - Allow WASM execution (`wasm-unsafe-eval`)

### TypeScript Configuration

**tsconfig.json**:

- Target: `esnext`
- Module: `esnext` with Node resolution
- Strict mode enabled
- JSX: React (not React 17+ automatic runtime)
- Includes: `src/` only
- Excludes: `build/`, `node_modules/`
- Types: `chrome` (for Chrome extension APIs)

**Type Declarations**:

- `src/global.d.ts` - Declares PNG module types
- Uses `@types/chrome`, `@types/webextension-polyfill`, `@types/react`, etc.

### Styling

**Tailwind CSS**:

- Configuration: `tailwind.config.js`
- Content: Scans all `src/**/*.{js,jsx,ts,tsx}`
- Custom theme: Primary color `#243f5f`
- PostCSS pipeline with `postcss-preset-env`

**SCSS**:

- FontAwesome integration (all icon sets: brands, solid, regular)
- Custom utility classes: `.button`, `.input`, `.select`, `.textarea`
- BEM-style modifiers: `.button--primary`
- Tailwind @apply directives mixed with custom styles

**Popup Dimensions**:

- Default: 480x600px (set in index.scss body styles)
- Customizable via inline styles or props

## Development Workflow

1. **Initial Setup** (from repository root):

   ```bash
   npm install  # Requires Node.js >= 18
   ```

2. **Development Mode**:

   ```bash
   npm run dev  # Starts webpack-dev-server on port 3000
   ```

   - Hot module replacement enabled
   - Files written to `packages/extension/build/` directory
   - Load extension in Chrome: `chrome://extensions/` → Developer mode → Load unpacked → Select `build/` folder

3. **Testing Multi-Window Functionality**:

   ```javascript
   // From any webpage with extension loaded:
   await window.tlsn.open('https://x.com', { showOverlay: true });
   ```

   - Opens new window with request interception
   - Displays overlay showing captured HTTP requests
   - Maximum 10 concurrent windows

4. **Production Build**:

   ```bash
   NODE_ENV=production npm run build  # Creates zip in packages/extension/zip/
   ```

5. **Running Tests**:
   ```bash
   npm run test         # Run all tests
   npm run test:coverage # Generate coverage reports
   ```

## Plugin SDK Package (`packages/plugin-sdk`)

### Host Class API

The SDK provides a `Host` class for sandboxed plugin execution with capability injection:

```typescript
import Host from '@tlsn/plugin-sdk';

const host = new Host({
  onProve: async (requestOptions, proverOptions) => {
    /* proof generation */
  },
  onRenderPluginUi: (windowId, domJson) => {
    /* render UI */
  },
  onCloseWindow: (windowId) => {
    /* cleanup */
  },
  onOpenWindow: async (url, options) => {
    /* open window */
  },
});

// Execute plugin code
await host.executePlugin(pluginCode, { eventEmitter });
```

**Capabilities injected into plugin environment:**

- `prove(requestOptions, proverOptions)`: Unified TLS proof generation
- `openWindow(url, options)`: Open managed browser windows
- `useHeaders(filter)`: Subscribe to intercepted HTTP headers
- `useRequests(filter)`: Subscribe to intercepted HTTP requests
- `useEffect(callback, deps)`: React-like side effects
- `useState(key, defaultValue)`: Get state value (returns current value or default)
- `setState(key, value)`: Set state value (triggers UI re-render)
- `div(options, children)`: Create div DOM elements
- `button(options, children)`: Create button DOM elements
- `done(result)`: Complete plugin execution

**State Management Example:**

```javascript
function main() {
  const count = useState('counter', 0);

  return div({}, [div({}, [`Count: ${count}`]), button({ onclick: 'handleClick' }, ['Increment'])]);
}

async function handleClick() {
  const count = useState('counter', 0);
  setState('counter', count + 1);
}
```

### QuickJS Sandboxing

- Uses `@sebastianwessel/quickjs` for secure JavaScript execution
- Plugins run in isolated WebAssembly environment
- Network and filesystem access disabled by default
- Host controls available capabilities through `env` object
- Reactive rendering: `main()` function called whenever hook state changes
- Force re-render: `main(true)` can be called to force UI re-render even if state hasn't changed (used on content script initialization)

### Build Configuration

- **Vite**: Builds isomorphic package for Node.js and browser
- **TypeScript**: Strict mode with full type declarations
- **Testing**: Vitest with coverage reporting
- **Output**: ESM module in `dist/` directory

## Verifier Server (`servers/verifier`)

Rust-based HTTP/WebSocket server for TLSNotary verification. Part of the
`servers/` Cargo workspace.

**Architecture:**

- Built with Axum web framework
- WebSocket endpoints for prover-verifier communication
- Session management with UUID-based tracking
- CORS enabled for cross-origin requests
- Webhook system for external service notifications

**Endpoints:**

- `GET /health` → Health check (returns "ok")
- `WS /session` → Create new verification session
- `WS /verifier?sessionId=<id>` → WebSocket verification endpoint
- `WS /proxy?token=<host>` → WebSocket proxy for TLS connections (compatible with notary.pse.dev)

**Configuration:**

- Default port: `7047`
- Configurable max sent/received data sizes
- Request timeout handling
- Tracing with INFO level logging
- YAML configuration file (`config.yaml`) for webhooks

**Webhook Configuration (`config.yaml`):**

```yaml
webhooks:
  # Per-server webhooks
  'api.x.com':
    url: 'https://your-backend.example.com/webhook/twitter'
    headers:
      Authorization: 'Bearer your-secret-token'
      X-Source: 'tlsn-verifier'

  # Wildcard for unmatched servers
  '*':
    url: 'https://your-backend.example.com/webhook/default'
```

Webhooks receive POST requests with:

- Session info (ID, custom data)
- Redacted transcripts (only revealed ranges visible)
- Reveal configuration

**Running the Server:**

```bash
cd servers
cargo run -p tlsn-verifier-server               # Development
cargo build --release -p tlsn-verifier-server   # Production
cargo test -p tlsn-verifier-server              # Tests
```

**Session Flow:**

1. Extension creates session via `/session` WebSocket
2. Server returns `sessionId` and waits for verifier connection
3. Extension connects to `/verifier?sessionId=<id>`
4. Prover sends HTTP request through `/proxy?token=<host>`
5. Verifier validates TLS handshake and transcript
6. Server returns verification result with transcripts
7. If webhook configured, sends POST to configured endpoint (fire-and-forget)

## Swissbank Server (`servers/swissbank`)

Fake Swiss bank server with a dashboard UI, used as a target for TLSNotary
demos. Originally built for DevConnect 2025. Part of the `servers/` Cargo
workspace.

**Endpoints:**

- `GET /` — Dashboard UI with bank reserves and live access log
- `GET /balances` — Bank balance JSON; logs access as "authorized" / "unauthorized" based on `Authorization` header

**Configuration:**

- `PORT` — listen port (default `3000`)
- `RUST_LOG` — log level (e.g. `info`)

**Running:**

```bash
cd servers
cargo run -p swissbank                  # Development
cargo build --release -p swissbank      # Production
```

Local Caddy HTTPS front (internal CA) via `servers/swissbank/docker-compose.yml`:

```bash
cd servers/swissbank
docker compose up --build
# Visit https://localhost
```

## Common Package (`packages/common`)

Shared utilities used by extension and plugin-sdk:

**Logger System:**
Centralized logging with configurable levels:

```typescript
import { logger, LogLevel } from '@tlsn/common';

// Initialize with log level
logger.init(LogLevel.DEBUG);

// Log at different levels
logger.debug('Detailed debug info');
logger.info('Informational message');
logger.warn('Warning message');
logger.error('Error message');

// Change level at runtime
logger.setLevel(LogLevel.WARN);
```

**Log Levels:**

- `DEBUG` (0) - Most verbose, includes all messages
- `INFO` (1) - Informational messages and above
- `WARN` (2) - Warnings and errors only
- `ERROR` (3) - Errors only

**Output Format:**

```
[HH:MM:SS] [LEVEL] message
```

## Creating New Plugins

Use the Claude Code command `/create-plugin` to interactively build a new plugin. The command (defined in `.claude/commands/create-plugin.md`) guides you through:

1. Researching the target API endpoint
2. Planning auth interception strategy
3. Creating the plugin source and registry entry
4. Building and verifying the output

For manual reference, see `PLUGIN.md` and the existing plugins in `packages/plugins/src/*.plugin.ts`.

## Shared Plugins Package (`packages/plugins`)

Single source of truth for plugin code and metadata, consumed by **both** clients:

**Files:**

- `src/*.plugin.ts` - Plugin source files (TypeScript)
- `src/registry.ts` - Shared registry; each entry declares `platforms: ('demo' | 'mobile')[]`
- `build.js` - Builds two targets: `dist/demo/` (browser bundle for the extension) and `dist/mobile/` (Hermes-compatible `es2016`, no `async/await` in dynamically-evaluated code)

Build with `npm run build:plugins` from the root.

## Demo Package (`packages/demo`)

Docker-based extension demo environment for testing plugins:

**Files:**

- Plugins come from `@tlsn/plugins` (`dist/demo/`) — not stored in this package
- `docker-compose.yml` - Docker services configuration
- `nginx.conf` - Reverse proxy configuration

**Docker Services:**

1. `verifier` - TLSNotary verifier server (port 7047)
2. `demo-static` - nginx serving static plugin files
3. `nginx` - Reverse proxy (port 80)

**Environment Variables (via `.env` files or Docker build args):**

- `VITE_VERIFIER_HOST` - Verifier server host (default: `localhost:7047`)
- `VITE_SSL` - Use https/wss protocols (default: `false`)

**Usage:**

```bash
# Local development with npm
npm run demo

# Docker (detached mode)
npm run docker:up

# Docker with custom verifier
VITE_VERIFIER_HOST=verifier.example.com VITE_SSL=true docker compose up --build
```

## Mobile App (`app/mobile`)

React Native / Expo client (iOS + Android) with a native Rust prover. It runs the
same `@tlsn/plugins` as the extension. See `app/mobile/README.md` for the full
toolchain, build pipeline, and troubleshooting.

**Plugin flow:**

1. `PluginScreen` loads the plugin and starts `MobilePluginHost` (runs plugin JS)
2. Plugin calls `openWindow()` → embedded `PluginWebView` opens the target site
3. User logs in; plugin captures cookies/headers via `useHeaders()`
4. Plugin calls `prove()` → `NativeProver` invokes the Rust prover via UniFFI (Swift on iOS, Kotlin on Android)
5. Rust prover connects to the verifier over WebSocket and performs MPC-TLS

**Key constraints:**

- **Native modules** (`tlsn-native`, `quickjs-native`, cookies) mean Expo Go does not work — always use `expo run:ios` / `expo run:android` (via `build.sh`).
- **Hermes** cannot parse `async/await` in dynamically-evaluated code (`new Function()`), so mobile plugins are compiled to `es2016` by `packages/plugins/build.js`. Rebuild with `npm run build:plugins` if you see "async functions are unsupported".
- **Verifier URL**: the iOS simulator reaches `localhost:7047` directly; the Android emulator rewrites `localhost` to `10.0.2.2`. Point at a remote verifier by rebuilding plugins with `MOBILE_VERIFIER_URL`.
- **Versioning**: mobile uses a 3-part `0.1.AABB` scheme (Apple rejects 4-part `CFBundleShortVersionString`); the extension stays 4-part `0.1.0.AABB`. See `app/mobile/RELEASING.md`.

**Native prover (`packages/tlsn-mobile`):** Rust compiled to an iOS XCFramework and an Android `.so`, bridged via UniFFI. Rebuild only when changing the Rust code (`build-ios.sh` / `build-android.sh`, or `app/mobile/build.sh --native`).

## Important Implementation Notes

### Plugin API Changes

The plugin API uses a **unified `prove()` function** instead of separate functions. The old API (`createProver`, `sendRequest`, `transcript`, `reveal`, `getResponse`) has been removed.

**Current API:**

```javascript
const proof = await prove(requestOptions, proverOptions);
```

**Handler Parameter:**
Note that the parameter name is `handlers` (plural), not `reveal`:

```javascript
proverOptions: {
  verifierUrl: 'http://localhost:7047',
  proxyUrl: 'wss://...',
  maxRecvData: 16384,
  maxSentData: 4096,
  handlers: [/* handler objects */]  // NOT 'reveal'
}
```

### Known Issues

⚠️ **Legacy Code Warning**: `src/entries/utils.ts` contains imports from non-existent files:

- `Background/rpc.ts` (removed in refactor)
- `SidePanel/types.ts` (removed in refactor)
- Functions: `pushToRedux()`, `openSidePanel()`, `waitForEvent()`
- **Status**: Dead code, not used by current entry points
- **Action**: Remove this file or refactor if functionality needed

## Websockify Integration

Used for WebSocket proxying of TLS connections:

**Build Websockify Docker Image**:

```bash
git clone https://github.com/novnc/websockify && cd websockify
./docker/build.sh
```

**Run Websockify**:

```bash
# For x.com (Twitter)
docker run -it --rm -p 55688:80 novnc/websockify 80 api.x.com:443

# For Twitter (alternative)
docker run -it --rm -p 55688:80 novnc/websockify 80 api.twitter.com:443
```

Purpose: Proxies HTTPS connections through WebSocket for browser-based TLS operations.

## Test Coverage

Coverage reports can be generated per package using Vitest:

```bash
# Extension (uses v8 provider)
cd packages/extension && npm run test:coverage

# Plugin SDK (uses istanbul provider)
cd packages/plugin-sdk && npm run test:coverage
```

Both produce `text` (terminal table), `json`, and `html` reports in the package's `coverage/` directory. Open `coverage/index.html` for a detailed file-by-file breakdown.

There are no enforced coverage thresholds. Use coverage reports to identify gaps when working on a module — especially before refactoring or adding features to under-tested code.

## Code Quality

**ESLint Configuration** (`.eslintrc`):

- Extends: `prettier`, `@typescript-eslint/recommended`
- Parser: `@typescript-eslint/parser`
- Rules:
  - `prettier/prettier`: error
  - `@typescript-eslint/no-explicit-any`: warning
  - `@typescript-eslint/no-var-requires`: off (allows require in webpack config)
  - `@typescript-eslint/ban-ts-comment`: off
  - `no-undef`: error
  - `padding-line-between-statements`: error
- Environment: `webextensions`, `browser`, `node`, `es6`
- Ignores: `node_modules`, `zip`, `build`, `wasm`, `tlsn`, `webpack.config.js`

**Prettier Configuration** (`.prettierrc.json`):

- Single quotes, trailing commas, 2-space indentation
- Ignore: `.prettierignore` (not in repo, likely default ignores)

## Git Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Commit messages should follow this format:

```
<type>(<scope>): <description>
```

**Types:**

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting, whitespace)
- `refactor` - Code refactoring (no functional changes)
- `test` - Adding or updating tests
- `chore` - Maintenance tasks, dependency updates

**Scopes** (optional, use package name):

- `extension` - Chrome extension package
- `plugin-sdk` - Plugin SDK package
- `common` - Common utilities package
- `verifier` - Verifier server package
- `demo` - Demo package

**Examples:**

```
feat(extension): add request interception for managed windows
fix(plugin-sdk): format long line to satisfy prettier
refactor(common): simplify logger initialization
docs: update README with new commands
```

**Important:** Do not add co-author attributions to commits.
