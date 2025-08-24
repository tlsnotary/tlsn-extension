# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
- `npm install` - Install dependencies
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build production extension
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with auto-fix

## Architecture Overview

### Extension Structure
This is a minimal Chrome Extension boilerplate (Manifest V3) with a clean multi-component architecture:

1. **Background Service Worker** (`src/entries/Background/`)
   - Persistent background script for extension logic
   - Handles extension lifecycle and API interactions
   - Central hub for message passing between components

2. **Content Scripts** (`src/entries/Content/`)
   - Scripts injected into web pages
   - DOM interaction and page manipulation
   - Bridge between web pages and extension

3. **Popup** (`src/entries/Popup/`)
   - Extension action popup UI
   - React-based interface
   - Quick access to extension features

4. **Offscreen Document** (`src/entries/Offscreen/`)
   - Isolated context for special operations
   - Can be used for tasks requiring DOM or other APIs not available in service workers

### Core Dependencies
- **React 18**: UI components for popup and offscreen pages
- **Redux**: State management across extension components
- **TypeScript**: Type safety and better developer experience
- **Webpack 5**: Module bundling and build process
- **PostCSS + Tailwind**: Styling and design system

### Build System
- Webpack 5 with TypeScript compilation
- Separate bundles for each extension component
- Hot reload support for development
- Production builds with optimizations

### Project Structure
```
src/
├── entries/           # Extension entry points
│   ├── Background/    # Service worker
│   ├── Content/       # Content scripts
│   ├── Offscreen/     # Offscreen document
│   └── Popup/         # Popup UI
├── reducers/          # Redux state management
├── utils/             # Shared utilities
└── manifest.json      # Extension manifest

```

## Development Workflow

1. **Install dependencies**: `npm install`
2. **Start development**: `npm run dev`
3. **Load extension**: Open Chrome, navigate to chrome://extensions/, enable Developer Mode, and load unpacked from the `build/` directory
4. **Make changes**: Edit code and webpack will auto-rebuild
5. **Build for production**: `npm run build`

## Important Notes
- Manifest V3 compliant with service worker architecture
- Content scripts inject into all HTTP/HTTPS pages by default
- Redux store provides centralized state management
- TypeScript configured for strict type checking