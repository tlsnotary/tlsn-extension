# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm install` - Install dependencies
- `npm run dev` - Start development server with hot reload (runs on port 3000)
- `npm run build` - Build production extension
- `NODE_ENV=production npm run build` - Build production-optimized extension
- `npm run lint` - Run ESLint to check code quality
- `npm run lint:fix` - Run ESLint with auto-fix for issues

## TLSNotary Extension

This is a Chrome Extension (Manifest V3) for TLSNotary, enabling secure notarization of TLS data. The extension must match the version of the notary server it connects to.

## Architecture Overview

### Extension Entry Points
The extension has 5 main entry points defined in webpack.config.js:

1. **Background Service Worker** (`src/entries/Background/index.ts`)
   - Persistent background script managing extension lifecycle
   - Message routing between components
   - Creates offscreen documents for background processing
   - Uses webextension-polyfill for cross-browser compatibility

2. **Content Script** (`src/entries/Content/index.ts`)
   - Injected into all HTTP/HTTPS pages
   - Entry point: `contentScript.bundle.js`

3. **Content Module** (`src/entries/Content/content.ts`)
   - Additional content script functionality
   - Entry point: `content.bundle.js`
   - Web accessible resource

4. **Popup UI** (`src/entries/Popup/index.tsx`)
   - React-based extension popup interface
   - Entry point: `popup.html`
   - Redux integration for state management

5. **Offscreen Document** (`src/entries/Offscreen/index.tsx`)
   - Isolated context for DOM operations not available in service workers
   - Entry point: `offscreen.html`
   - Created dynamically by background script using Chrome Offscreen API

### State Management
- Redux store in `src/reducers/index.tsx`
- Basic app state with message and count
- Action creators: `setMessage()`, `incrementCount()`
- Combined reducers pattern for scalability

### Build Configuration
- Webpack 5 with separate bundles for each entry point
- TypeScript compilation with ts-loader
- React Refresh for hot module replacement in development
- PostCSS with Tailwind CSS for styling
- Terser for production minification
- Assets copied: manifest.json, icons, CSS files

### Extension Permissions
- `storage` - For persistent data
- `activeTab` - For current tab access
- Content scripts on all HTTP/HTTPS pages

## Development Workflow

1. **Setup**: Run `npm install` to install dependencies
2. **Development**: Run `npm run dev` to start webpack dev server
3. **Load Extension**:
   - Navigate to `chrome://extensions/`
   - Enable Developer Mode
   - Click "Load unpacked" and select the `build/` directory
4. **Testing**: The extension auto-reloads on file changes in dev mode
5. **Production Build**: Run `NODE_ENV=production npm run build`

## Websockify Integration

The project supports Websockify for WebSocket proxying:
- Build: `docker run -it --rm -p 55688:80 novnc/websockify 80 api.x.com:443`
- Used for proxying TLS connections through WebSocket

## ESLint Configuration
- Extends prettier and TypeScript recommended rules
- Parser: @typescript-eslint/parser
- Enforces prettier formatting
- Ignores: node_modules, build, wasm, tlsn directories