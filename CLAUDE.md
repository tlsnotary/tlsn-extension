# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm install` - Install dependencies
- `npm run dev` - Start webpack dev server with hot reload on port 3000 (default)
- `npm run build` - Build extension (uses NODE_ENV from utils/build.js, defaults to production)
- `npm run build:webpack` - Direct webpack build with production mode
- `npm run lint` - Run ESLint to check code quality
- `npm run lint:fix` - Run ESLint with auto-fix for issues

## TLSNotary Extension

This is a Chrome Extension (Manifest V3) for TLSNotary, enabling secure notarization of TLS data. The extension was recently refactored (commit 92ecb55) to a minimal boilerplate, with TLSN overlay functionality being incrementally added back.

**Important**: The extension must match the version of the notary server it connects to.

## Architecture Overview

### Extension Entry Points
The extension has 5 main entry points defined in `webpack.config.js`:

#### 1. **Background Service Worker** (`src/entries/Background/index.ts`)
Core responsibilities:
- **TLSN Window Management**: Creates popup windows for TLSN operations, tracks window/tab IDs
- **Request Interception**: Uses `webRequest.onBeforeRequest` API to intercept all HTTP requests from TLSN windows
- **Request Storage**: Maintains in-memory array of intercepted requests (`tlsnRequests`)
- **Message Routing**: Forwards messages between content scripts, popup, and injected page scripts
- **Offscreen Document Management**: Creates offscreen documents for background DOM operations (Chrome 109+)
- Uses `webextension-polyfill` for cross-browser compatibility

Key message handlers:
- `PING` → `PONG` (connectivity test)
- `TLSN_CONTENT_TO_EXTENSION` → Opens new popup window, tracks requests
- `CONTENT_SCRIPT_READY` → Confirms content script loaded

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
- **Page API**: Exposes `window.extensionAPI` object to web pages
- **Message Bridge**: Provides `sendMessage()` method that posts messages via `window.postMessage`
- **Lifecycle Event**: Dispatches `extension_loaded` custom event when ready
- **Web Accessible Resource**: Listed in manifest's `web_accessible_resources`

Page API usage:
```javascript
window.extensionAPI.sendMessage({ action: 'startTLSN' });
window.addEventListener('extension_loaded', () => { /* ready */ });
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

**Page → Extension Flow**:
```
Page (window.postMessage)
  ↓
Content Script (window.addEventListener('message'))
  ↓
Background (browser.runtime.sendMessage)
```

**Extension → Page Flow**:
```
Background (browser.tabs.sendMessage)
  ↓
Content Script (browser.runtime.onMessage)
  ↓
Page DOM manipulation (overlay, etc.)
```

**Security**: Content script only accepts messages from same origin (`event.origin === window.location.origin`)

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

1. **Initial Setup**:
   ```bash
   npm install  # Requires Node.js >= 18
   ```

2. **Development Mode**:
   ```bash
   npm run dev  # Starts webpack-dev-server on port 3000
   ```
   - Hot module replacement enabled
   - Files written to `build/` directory
   - Source maps: `cheap-module-source-map`

3. **Load Extension in Chrome**:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" toggle
   - Click "Load unpacked"
   - Select the `build/` folder
   - Extension auto-reloads on file changes (requires manual refresh for manifest changes)

4. **Testing TLSN Functionality**:
   - Trigger `TLSN_CONTENT_TO_EXTENSION` message from a page using `window.extensionAPI.sendMessage()`
   - Background script opens popup window to x.com
   - All requests in that window are intercepted and displayed in overlay

5. **Production Build**:
   ```bash
   NODE_ENV=production npm run build  # Creates build/ and zip/
   ```
   - Minified output with Terser
   - No source maps
   - Creates versioned zip file for Chrome Web Store submission

6. **Linting**:
   ```bash
   npm run lint      # Check for issues
   npm run lint:fix  # Auto-fix issues
   ```

## Known Issues & Legacy Code

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

## Publishing

After building:
1. Test extension thoroughly in Chrome
2. Create production build: `NODE_ENV=production npm run build`
3. Upload `zip/tlsn-extension-{version}.zip` to Chrome Web Store
4. Follow [Chrome Web Store publishing guide](https://developer.chrome.com/webstore/publish)

## Resources

- [Webpack Documentation](https://webpack.js.org/concepts/)
- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill)