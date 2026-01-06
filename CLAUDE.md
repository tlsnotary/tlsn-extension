# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Monorepo Commands (from root)
- `npm install` - Install all dependencies for all packages and set up workspace links
- `npm run dev` - Start extension development server on port 3000 (auto-builds dependencies)
- `npm run build` - Build production extension (auto-builds dependencies first)
- `npm run build:deps` - Build only dependencies (@tlsn/common and @tlsn/plugin-sdk)
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

### Verifier Server Package Commands
- `cargo run` - Run development server on port 7047
- `cargo build --release` - Build production binary
- `cargo test` - Run Rust tests
- `cargo check` - Check compilation without building

## Monorepo Architecture

The project is organized as a monorepo using npm workspaces with the following packages:

- **`packages/common`**: Shared utilities (logging system) used by extension and plugin-sdk
- **`packages/extension`**: Chrome Extension (Manifest V3) for TLSNotary proof generation
- **`packages/plugin-sdk`**: SDK for developing and running TLSN plugins using QuickJS sandboxing
- **`packages/verifier`**: Rust-based WebSocket server for TLSNotary verification
- **`packages/demo`**: Demo server with Docker setup and example plugins
- **`packages/tutorial`**: Tutorial examples for learning plugin development

**Build Dependencies:**
The extension depends on `@tlsn/common` and `@tlsn/plugin-sdk`. These must be built before the extension:
```bash
# From root - builds all dependencies automatically
npm run dev

# Or manually build dependencies first
cd packages/common && npm run build
cd packages/plugin-sdk && npm run build
cd packages/extension && npm run dev
```

**Important**: The extension must match the version of the notary server it connects to.

## Extension Architecture Overview

### Extension Entry Points
The extension has 7 main entry points defined in `webpack.config.js`:

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
  showOverlay: true
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

#### 5. **DevConsole** (`src/entries/DevConsole/index.tsx`)
Interactive development console for testing TLSN plugins:
- **Code Editor**: CodeMirror with JavaScript syntax highlighting and one-dark theme
- **Live Execution**: Runs plugin code in QuickJS sandbox via background service worker
- **Console Output**: Timestamped entries showing execution results, errors, and timing
- **ExtensionAPI**: Exposes `window.tlsn.execCode()` method for plugin execution
- Access: Right-click context menu → "Developer Console"

**Plugin Structure:**
Plugins must export:
- `config`: Metadata (`name`, `description`)
- `main()`: Reactive UI rendering function (called when state changes)
- `onClick()`: Click handler for proof generation
- React-like hooks: `useHeaders()`, `useEffect()`, `useRequests()`
- UI components: `div()`, `button()` returning DOM JSON
- Capabilities: `openWindow()`, `prove()`, `done()`

#### 6. **Offscreen Document** (`src/entries/Offscreen/index.tsx`)
Isolated React component for background processing:
- **Purpose**: Handles DOM operations unavailable in service workers
- **SessionManager Integration**: Executes plugin code via `SessionManager.executePlugin()`
- **Message Handling**: Listens for `EXEC_CODE` messages from DevConsole
- **Lifecycle**: Created dynamically by background script, reused if exists
- Entry point: `offscreen.html`

#### 7. **Options Page** (`src/entries/Options/index.tsx`)
Extension settings page for user configuration:
- **Log Level Control**: Configure logging verbosity (DEBUG, INFO, WARN, ERROR)
- **IndexedDB Storage**: Settings persisted via `logLevelStorage.ts` utility
- **Live Updates**: Changes take effect immediately without restart
- **Styling**: Custom SCSS with radio button group design
- Access: Right-click extension icon → Options, or `chrome://extensions` → Details → Extension options
- Entry point: `options.html`

#### 8. **ConfirmPopup** (`src/entries/ConfirmPopup/index.tsx`)
Permission confirmation dialog for plugin execution:
- **Plugin Info Display**: Shows plugin name, description, version, author
- **Permission Review**: Lists allowed network requests and URLs
- **User Controls**: Allow/Deny buttons with keyboard shortcuts (Enter/Esc)
- **Security**: Validates plugin config before execution
- **Timeout**: 60-second auto-deny if no response
- Opened by: `ConfirmationManager` when executing untrusted plugins
- Entry point: `confirmPopup.html`

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
- Handles HTTP transcript parsing with byte-level range tracking

**Key Capability - Unified prove() API:**
The SessionManager exposes a single `prove()` function to plugins that handles the entire proof pipeline:
1. Creates prover connection to verifier server
2. Sends HTTP request through TLS prover
3. Captures TLS transcript (sent/received bytes)
4. Parses transcript with Parser class for range extraction
5. Applies selective reveal handlers to show only specified data
6. Generates and returns cryptographic proof

**Handler System:**
Plugins control what data is revealed in proofs using Handler objects:
- `type`: `'SENT'` (request data) or `'RECV'` (response data)
- `part`: `'START_LINE'`, `'PROTOCOL'`, `'METHOD'`, `'REQUEST_TARGET'`, `'STATUS_CODE'`, `'HEADERS'`, `'BODY'`
- `action`: `'REVEAL'` (plaintext) or `'PEDERSEN'` (hash commitment)
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

#### **ConfirmationManager** (`src/background/ConfirmationManager.ts`)
Manages plugin execution confirmation dialogs:
- **Permission Flow**: Opens confirmation popup before plugin execution
- **User Approval**: Displays plugin info and permissions for user review
- **Timeout Handling**: 60-second timeout auto-denies if no response
- **Window Tracking**: Tracks confirmation popup windows by request ID
- **Singleton Pattern**: Exported as `confirmationManager` instance

Key methods:
- `requestConfirmation(config, requestId)`: Opens confirmation popup, returns Promise<boolean>
- `handleConfirmationResponse(requestId, allowed)`: Processes user's allow/deny decision
- `hasPendingConfirmation()`: Check if a confirmation is in progress

#### **PermissionManager** (`src/background/PermissionManager.ts`)
Manages runtime host permission requests and revocation:
- **Runtime Permissions**: Requests host permissions from browser at plugin execution time
- **Permission Extraction**: Extracts origin patterns from plugin's `config.requests`
- **Concurrent Execution Tracking**: Tracks which permissions are in use by active plugins
- **Automatic Revocation**: Removes permissions when no longer needed
- **Singleton Pattern**: Exported as `permissionManager` instance

Key methods:
- `extractOrigins(requests)`: Extract origin patterns from RequestPermission array
- `extractPermissionPatterns(requests)`: Extract patterns with host and pathname for display
- `formatForDisplay(requests)`: Format as `host + pathname` strings for UI
- `requestPermissions(origins)`: Request permissions from browser, tracks usage
- `removePermissions(origins)`: Revoke permissions if no longer in use
- `hasPermissions(origins)`: Check if permissions are already granted

**Plugin Execution Flow with Permissions:**
1. User clicks "Allow" in ConfirmPopup
2. PermissionManager extracts origins from `config.requests`
3. Browser shows native permission prompt
4. If granted, plugin executes in offscreen document
5. After execution (success or error), permissions are revoked

### Permission Validation System

The extension implements a permission control system (PR #211) that validates plugin operations:

#### **Permission Validator** (`src/offscreen/permissionValidator.ts`)
Validates plugin API calls against declared permissions:
- `validateProvePermission()`: Checks if prove() call matches declared `requests` permissions
- `validateOpenWindowPermission()`: Checks if openWindow() call matches declared `urls` permissions
- `deriveProxyUrl()`: Derives default proxy URL from verifier URL
- `matchesPathnamePattern()`: URLPattern-based pathname matching with wildcards

**Validation Flow:**
1. Plugin declares permissions in `config.requests` and `config.urls`
2. Before `prove()` or `openWindow()` executes, validator checks permissions
3. If no matching permission found, throws descriptive error
4. Error includes list of declared permissions for debugging

**URLPattern Syntax:**
- Exact paths: `/1.1/users/show.json`
- Single-segment wildcard: `/api/*/data` (matches `/api/v1/data`)
- Multi-segment wildcard: `/api/**` (matches `/api/v1/users/123`)

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
- Plugin permission validation before prove() and openWindow() calls

**Additional Message Types:**
- `PLUGIN_CONFIRM_RESPONSE` → User response (allow/deny) from confirmation popup
- `PLUGIN_UI_CLICK` → Button click event from plugin UI in content script
- `EXTRACT_CONFIG` → Request to extract plugin config from code
- `EXEC_CODE_OFFSCREEN` → Execute plugin code in offscreen context
- `RENDER_PLUGIN_UI` → Render plugin UI from DOM JSON in content script
- `OFFSCREEN_LOG` → Log forwarding from offscreen to page context
- `REQUEST_HOST_PERMISSIONS` → Request browser host permissions for origins
- `REMOVE_HOST_PERMISSIONS` → Revoke browser host permissions for origins

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
- **Entry Points**: popup, background, contentScript, content, offscreen, devConsole, options, confirmPopup
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
  - `HtmlWebpackPlugin` - Generates popup.html, offscreen.html, devConsole.html, options.html, confirmPopup.html
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
- `contextMenus` - Create context menu items (Developer Console access)
- `optional_host_permissions: ["https://*/*", "http://*/*"]` - Runtime-requested host permissions
- `content_scripts` - Inject into all HTTP/HTTPS pages
- `web_accessible_resources` - Make content.bundle.js, CSS, icons, and WASM files accessible to pages
- `content_security_policy` - Allow WASM execution (`wasm-unsafe-eval`)
- `options_page` - Extension settings page (`options.html`)

**Runtime Host Permissions:**
The extension uses `optional_host_permissions` instead of blanket `host_permissions` for improved privacy:
- No host permissions granted by default
- Permissions are requested at runtime based on plugin's `config.requests`
- Permissions are revoked immediately after plugin execution completes
- Uses browser's native permission prompt for user consent

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

### Plugin Configuration
Plugins must export a `config` object with the following structure:

```typescript
interface PluginConfig {
  name: string;           // Display name
  description: string;    // What the plugin does
  version?: string;       // Optional version string
  author?: string;        // Optional author name
  requests?: RequestPermission[];  // Allowed HTTP requests for prove()
  urls?: string[];        // Allowed URLs for openWindow()
}

interface RequestPermission {
  method: string;         // HTTP method (GET, POST, etc.)
  host: string;           // Target hostname
  pathname: string;       // URL path pattern (supports wildcards)
  verifierUrl: string;    // Verifier server URL
  proxyUrl?: string;      // Optional proxy URL (derived from verifierUrl if omitted)
}
```

**Example config with permissions:**
```javascript
const config = {
  name: 'Twitter Plugin',
  description: 'Generate TLS proofs for Twitter profile data',
  version: '1.0.0',
  author: 'TLSN Team',
  requests: [
    {
      method: 'GET',
      host: 'api.x.com',
      pathname: '/1.1/users/show.json',
      verifierUrl: 'https://verifier.tlsnotary.org'
    }
  ],
  urls: ['https://x.com/*']
};
```

### Host Class API
The SDK provides a `Host` class for sandboxed plugin execution with capability injection:

```typescript
import Host from '@tlsn/plugin-sdk';

const host = new Host({
  onProve: async (requestOptions, proverOptions) => { /* proof generation */ },
  onRenderPluginUi: (windowId, domJson) => { /* render UI */ },
  onCloseWindow: (windowId) => { /* cleanup */ },
  onOpenWindow: async (url, options) => { /* open window */ },
});

// Execute plugin code
await host.executePlugin(pluginCode, { eventEmitter });

// Extract plugin config without executing
const config = await host.getPluginConfig(pluginCode);
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

  return div({}, [
    div({}, [`Count: ${count}`]),
    button({ onclick: 'handleClick' }, ['Increment'])
  ]);
}

async function handleClick() {
  const count = useState('counter', 0);
  setState('counter', count + 1);
}
```

### Parser Class
HTTP message parser with byte-level range tracking:

```typescript
import { Parser } from '@tlsn/plugin-sdk';

const parser = new Parser(httpTranscript);
const json = parser.json();

// Extract byte ranges for selective disclosure
const ranges = parser.ranges.body('screen_name', { type: 'json', hideKey: true });
```

**Features:**
- Parse HTTP requests and responses
- Handle chunked transfer encoding
- Extract header ranges with case-insensitive names
- Extract JSON field ranges (top-level only)
- Array field access returns range for entire array (PR #212)
- Regex-based body pattern matching
- Track byte offsets for TLSNotary selective disclosure

**Limitations:**
- Nested JSON field access (e.g., `"user.profile.name"`) not yet supported
- Multi-chunk responses map to first chunk's offset only

### QuickJS Sandboxing
- Uses `@sebastianwessel/quickjs` for secure JavaScript execution
- Plugins run in isolated WebAssembly environment
- Network and filesystem access disabled by default
- Host controls available capabilities through `env` object
- Reactive rendering: `main()` function called whenever hook state changes
- Force re-render: `main(true)` can be called to force UI re-render even if state hasn't changed (used on content script initialization)

### Config Extraction
The SDK provides utilities to extract plugin config without full execution:

```typescript
import { extractConfig } from '@tlsn/plugin-sdk';

// Fast extraction using regex (name/description only)
const basicConfig = await extractConfig(pluginCode);

// Full extraction using QuickJS sandbox (includes permissions)
const host = new Host({ /* ... */ });
const fullConfig = await host.getPluginConfig(pluginCode);
```

### Build Configuration
- **Vite**: Builds isomorphic package for Node.js and browser
- **TypeScript**: Strict mode with full type declarations
- **Testing**: Vitest with coverage reporting
- **Output**: ESM module in `dist/` directory

## Verifier Server Package (`packages/verifier`)

Rust-based HTTP/WebSocket server for TLSNotary verification:

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
  "api.x.com":
    url: "https://your-backend.example.com/webhook/twitter"
    headers:
      Authorization: "Bearer your-secret-token"
      X-Source: "tlsn-verifier"

  # Wildcard for unmatched servers
  "*":
    url: "https://your-backend.example.com/webhook/default"
```

Webhooks receive POST requests with:
- Session info (ID, custom data)
- Redacted transcripts (only revealed ranges visible)
- Reveal configuration

**Running the Server:**
```bash
cd packages/verifier
cargo run                    # Development
cargo build --release        # Production
cargo test                   # Tests
```

**Session Flow:**
1. Extension creates session via `/session` WebSocket
2. Server returns `sessionId` and waits for verifier connection
3. Extension connects to `/verifier?sessionId=<id>`
4. Prover sends HTTP request through `/proxy?token=<host>`
5. Verifier validates TLS handshake and transcript
6. Server returns verification result with transcripts
7. If webhook configured, sends POST to configured endpoint (fire-and-forget)

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

**Log Level Storage** (extension only):
The extension persists log level in IndexedDB via `src/utils/logLevelStorage.ts`:
- `getStoredLogLevel()`: Retrieve saved log level (defaults to WARN)
- `setStoredLogLevel(level)`: Save log level to IndexedDB
- Uses `idb-keyval` for simple key-value storage

## Demo Package (`packages/demo`)

Docker-based demo environment for testing plugins:

**Files:**
- `twitter.js`, `swissbank.js`, `spotify.js` - Example plugin files (PR #210 added Spotify)
- `docker-compose.yml` - Docker services configuration
- `nginx.conf` - Reverse proxy configuration
- `start.sh` - Setup script with URL templating

**Docker Services:**
1. `verifier` - TLSNotary verifier server (port 7047)
2. `demo-static` - nginx serving static plugin files
3. `nginx` - Reverse proxy (port 80)

**Environment Variables:**
- `VERIFIER_HOST` - Verifier server host (default: `localhost:7047`)
- `SSL` - Use https/wss protocols (default: `false`)

**Usage:**
```bash
# Local development
./start.sh

# Production with SSL
VERIFIER_HOST=verifier.tlsnotary.org SSL=true ./start.sh

# Docker detached mode
./start.sh -d
```

The `start.sh` script:
1. Processes plugin files, replacing `verifierUrl` and `proxyUrl` placeholders
2. Copies processed files to `generated/` directory
3. Starts Docker Compose services

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

### DevConsole Default Template
The default plugin code in `DevConsole/index.tsx` is heavily commented to serve as educational documentation. When modifying, maintain the comprehensive inline comments explaining:
- Each step of the proof generation flow
- Purpose of each header and parameter
- What each reveal handler does
- How React-like hooks work

### Test Data Sanitization
Parser tests (`packages/plugin-sdk/src/parser.test.ts`) use redacted sensitive data:
- Authentication tokens: `REDACTED_BEARER_TOKEN`, `REDACTED_CSRF_TOKEN_VALUE`
- Screen names: `test_user` (not real usernames)
- Cookie values: `REDACTED_GUEST_ID`, `REDACTED_COOKIE_VALUE`

### Known Issues

- **Nested JSON field access**: Parser does not yet support paths like `"user.profile.name"`
- **Duplicate CLAUDE.md**: `packages/extension/CLAUDE.md` contains outdated documentation; use root CLAUDE.md instead

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

