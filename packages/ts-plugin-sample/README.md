# TypeScript Plugin Sample

A TypeScript implementation of the X Profile Prover plugin demonstrating how to write type-safe TLSN plugins.

## Overview

This package shows how to:
- Write TLSN plugins in TypeScript with full type safety
- Import types from `@tlsn/plugin-sdk`
- Compile TypeScript plugins to JavaScript for execution
- Use all plugin API features (prove, openWindow, UI rendering, hooks)

## Quick Start

### Installation

```bash
cd packages/ts-plugin-sample
npm install
```

### Build

```bash
npm run build
```

This bundles `src/index.ts` and `src/config.ts` into a single `build/index.js` file with clean `export default` statement.

### Development Mode

```bash
npm run dev
```

Watches for changes and rebuilds automatically.

### Type Checking

```bash
npm run typecheck
```

Runs TypeScript type checking without emitting files.

## Project Structure

```
ts-plugin-sample/
├── package.json          # Dependencies and build scripts
├── tsconfig.json         # TypeScript compiler configuration
├── build-wrapper.cjs     # Custom build script for clean exports
├── src/
│   ├── index.ts         # TypeScript plugin implementation
│   └── config.ts        # Plugin configuration
├── build/
│   ├── index.js         # Bundled plugin with export default
│   └── index.js.map     # Source map for debugging
└── README.md
```

## TypeScript Features

### Type Imports

Import types from the plugin SDK for compile-time checking:

```typescript
import type {
  PluginConfig,
  RequestPermission,
  Handler,
  InterceptedRequestHeader,
  DomJson,
} from '@tlsn/plugin-sdk';
```

### Plugin Config Type Safety

```typescript
const config: PluginConfig = {
  name: 'X Profile Prover',
  description: 'This plugin will prove your X.com profile.',
  version: '0.1.0',
  author: 'TLSN Team',
  requests: [
    {
      method: 'GET',
      host: 'api.x.com',
      pathname: '/1.1/account/settings.json',
      verifierUrl: 'https://verifier.tlsnotary.org',
    } satisfies RequestPermission,
  ],
  urls: ['https://x.com/*'],
};
```

### Plugin API Globals

The plugin execution environment (QuickJS sandbox) provides these globals:

```typescript
// Declare types for globals injected by the sandbox
declare function div(options?: DomOptions, children?: DomJson[]): DomJson;
declare function button(options?: DomOptions, children?: DomJson[]): DomJson;
declare function openWindow(url: string, options?: {...}): Promise<{...}>;
declare function useEffect(callback: () => void, deps: any[]): void;
declare function useHeaders(filter: (headers: InterceptedRequestHeader[]) => InterceptedRequestHeader[]): InterceptedRequestHeader[];
declare function useState<T>(key: string, defaultValue: T): T;
declare function setState<T>(key: string, value: T): void;
declare function prove(requestOptions: {...}, proverOptions: {...}): Promise<any>;
declare function done(result?: any): void;
```

### Type-Safe Handlers

```typescript
const handlers: Handler[] = [
  {
    type: 'SENT',
    part: 'START_LINE',
    action: 'REVEAL',
  },
  {
    type: 'RECV',
    part: 'BODY',
    action: 'REVEAL',
    params: {
      type: 'json',
      path: 'screen_name',
    },
  },
];
```

## Key Differences from JavaScript

### 1. Type Annotations

```typescript
// JavaScript
function onClick() {
  const isRequestPending = useState('isRequestPending', false);
  // ...
}

// TypeScript
async function onClick(): Promise<void> {
  const isRequestPending = useState<boolean>('isRequestPending', false);
  // ...
}
```

### 2. Interface Compliance

TypeScript ensures your config matches the `PluginConfig` interface:

```typescript
const config: PluginConfig = {
  name: 'X Profile Prover',           // ✓ Required
  description: 'Proves X profile',    // ✓ Required
  version: '0.1.0',                    // ✓ Optional
  requests: [...],                     // ✓ Optional
  urls: [...],                         // ✓ Optional
  // TypeScript will error if required fields are missing!
};
```

### 3. Compile-Time Errors

```typescript
// This will error at compile time:
const handler: Handler = {
  type: 'INVALID',  // ❌ Type '"INVALID"' is not assignable to type 'HandlerType'
  part: 'BODY',
  action: 'REVEAL',
};

// This will pass:
const handler: Handler = {
  type: 'RECV',     // ✓ Valid HandlerType
  part: 'BODY',
  action: 'REVEAL',
};
```

## Build Configuration

### Build Tool: esbuild + Custom Wrapper

The plugin uses **esbuild** with a custom build wrapper:
- **Single file output:** All code bundled into `build/index.js` (7.2KB, 257 lines)
- **ES Module format:** Standard `export default` statement
- **No external imports:** All dependencies bundled inline
- **Zero runtime SDK dependency:** Handler types are string unions (no runtime imports needed)
- **Source maps:** Generated for debugging (`build/index.js.map`)
- **Fast builds:** ~10ms typical build time

The build wrapper (`build-wrapper.cjs`) transforms the esbuild output to use a clean `export default` statement matching the JavaScript plugin format.

### TypeScript Config (`tsconfig.json`)

TypeScript is used for type checking only (`npm run typecheck`):
- **Target:** ES2020 (modern browser features)
- **Strict:** Full type checking enabled
- **Global types:** Includes SDK globals for plugin API functions

## Loading in Extension

After building, the compiled `build/index.js` can be loaded in the TLSN extension:

1. Build the plugin: `npm run build`
2. The output is `build/index.js` with clean ES module export:
   ```javascript
   export default {
     main,
     onClick,
     expandUI,
     minimizeUI,
     config,
   };
   ```
3. Load and execute in the extension:
   ```javascript
   const pluginCode = fs.readFileSync('build/index.js', 'utf8');
   const plugin = await sandbox.eval(pluginCode);
   // plugin = { main, onClick, expandUI, minimizeUI, config }
   ```
4. The plugin executes with full type safety verified at compile time

**Output Characteristics:**
- ✅ Single file with `export default` statement
- ✅ No external imports (all dependencies bundled)
- ✅ Zero runtime SDK dependency (types are string unions)
- ✅ ES Module format
- ✅ Matches JavaScript plugin structure

## Comparison with JavaScript Plugin

See `packages/demo/generated/twitter.js` for the equivalent JavaScript implementation.

**Advantages of TypeScript:**
- Compile-time type checking
- IDE autocomplete and IntelliSense
- Catches errors before runtime
- Better documentation via types
- Refactoring safety

**Trade-offs:**
- Requires build step
- Slightly more verbose (type annotations)
- Need to maintain type declarations

## Development Tips

### 1. Use Type Inference

TypeScript can infer many types:

```typescript
// Explicit (verbose)
const header: InterceptedRequestHeader | undefined = useHeaders(...)[0];

// Inferred (cleaner)
const [header] = useHeaders(...);  // Type inferred from useHeaders return type
```

### 2. Use `satisfies` for Config

```typescript
// Good: Type-checked but allows literal types
requests: [
  {
    method: 'GET',
    host: 'api.x.com',
    // ...
  } satisfies RequestPermission,
]

// Also good: Full type annotation
const request: RequestPermission = {
  method: 'GET',
  // ...
};
```

### 3. Enable Strict Mode

Keep `"strict": true` in `tsconfig.json` for maximum type safety.

### 4. Check Build Errors

```bash
npm run build

# Check for type errors without building
npx tsc --noEmit
```

## Resources

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [Plugin SDK Types](../plugin-sdk/src/types.ts)
- [JavaScript Plugin Example](../demo/generated/twitter.js)
- [TLSN Extension Docs](../../CLAUDE.md)

## License

MIT
