# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Monorepo Commands (from root)
- `npm install` - Install all dependencies for all packages
- `npm run dev` - Start extension development server on port 3000
- `npm run build` - Build production extension
- `npm run build:all` - Build all packages in monorepo
- `npm run test` - Run tests for all packages
- `npm run lint` - Run linting for all packages
- `npm run lint:fix` - Auto-fix linting issues for all packages
- `npm run serve:test` - Serve test page on port 8081
- `npm run clean` - Remove all node_modules, dist, and build directories

### Extension Package Commands
- `npm run build` - Production build with zip creation
- `npm run build:webpack` - Direct webpack build
- `npm run dev` - Start webpack dev server with hot reload
- `npm run test` - Run Vitest tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report
- `npm run lint` / `npm run lint:fix` - ESLint checks and fixes
- `npm run serve:test` - Python HTTP server for integration tests

### Plugin SDK Package Commands
- `npm run build` - Build isomorphic package with Vite + TypeScript declarations
- `npm run test` - Run Vitest tests
- `npm run test:coverage` - Generate test coverage
- `npm run lint` - Run all linters (ESLint, Prettier, TypeScript)
- `npm run lint:fix` - Auto-fix linting issues

## Monorepo Architecture

The project is organized as a monorepo using npm workspaces with two main packages:

- **`packages/extension`**: Chrome Extension (Manifest V3) for TLSNotary
- **`packages/plugin-sdk`**: SDK for developing and running TLSN WebAssembly plugins using QuickJS sandboxing

**Important**: The extension must match the version of the notary server it connects to.

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

#### 2. **Content Script** (`src/entries/Content/index.ts`)
Injected into all HTTP/HTTPS pages via manifest. Responsibilities:
- **Script Injection**: Injects `content.bundle.js` into page context to expose page-accessible API
- **TLSN Overlay Management**: Creates/updates full-screen overlay showing intercepted requests
- **Message Bridge**: Bridges messages between page scripts and extension background
- **Request Display**: Real-time updates of intercepted requests in overlay UI

Message handlers:
- `GET_PAGE_INFO` → Returns page title, URL, domain
- `SHOW_TLSN_OVERLAY` → Creates overlay with initial requests
- `UPDATE_TLSN_REQUESTS` → Updates overlay with new requests
- `HIDE_TLSN_OVERLAY` → Removes overlay and clears state

Window message handler:
- Listens for `TLSN_CONTENT_SCRIPT_MESSAGE` from page scripts
- Forwards to background via `TLSN_CONTENT_TO_EXTENSION`

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

#### 5. **Offscreen Document** (`src/entries/Offscreen/index.tsx`)
Isolated React component for background processing:
- **Purpose**: Handles DOM operations unavailable in service workers
- **Message Handling**: Listens for `PROCESS_DATA` messages (example implementation)
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

#### **SessionManager** (`src/background/SessionManager.ts`)
Plugin session management (currently imported but not integrated):
- Uses `@tlsn/plugin-sdk` Host class for plugin execution
- Manages plugin sessions with UUID tracking
- Intended for future plugin execution functionality

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
The SDK provides a `Host` class for sandboxed plugin execution:

```typescript
import Host from '@tlsn/plugin-sdk';

const host = new Host();

// Add capabilities that plugins can use
host.addCapability('log', (message) => console.log(message));
host.addCapability('fetch', async (url) => fetch(url));

// Load and run plugins
host.loadPlugin('plugin-id', pluginCode);
const result = await host.runPlugin('plugin-id');
```

### QuickJS Sandboxing
- Uses `@sebastianwessel/quickjs` for secure JavaScript execution
- Plugins run in isolated WebAssembly environment
- Network and filesystem access disabled by default
- Host controls available capabilities through `env` object

### Build Configuration
- **Vite**: Builds isomorphic package for Node.js and browser
- **TypeScript**: Strict mode with full type declarations
- **Testing**: Vitest with coverage reporting
- **Output**: ESM module in `dist/` directory

## Known Issues & Legacy Code

⚠️ **Legacy Code Warning**: `src/entries/utils.ts` contains imports from non-existent files:
- `Background/rpc.ts` (removed in refactor)
- `SidePanel/types.ts` (removed in refactor)
- Functions: `pushToRedux()`, `openSidePanel()`, `waitForEvent()`
- **Status**: Dead code, not used by current entry points
- **Action**: Remove this file or refactor if functionality needed

⚠️ **SessionManager Integration**: Currently imported in background script but not actively used. Intended for future plugin execution features.

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

