# @tlsn/plugin-sdk

SDK for developing and running TLSN plugins with HTTP request interception, proof generation, and React-like hooks.

## Overview

This package provides:

- **Host Environment**: QuickJS-based sandboxed runtime for executing plugin code
- **Plugin Capabilities**: React-like hooks, DOM JSON creation, window management, and proof generation
- **Type Definitions**: TypeScript types for plugin development

## Features

### Plugin Capabilities

Plugins run in a sandboxed QuickJS environment with access to the following APIs:

#### UI Components

- **`div(options?, children?)`** - Create div elements
- **`button(options?, children?)`** - Create button elements with click handlers

#### React-like Hooks

- **`useEffect(callback, deps?)`** - Run side effects when dependencies change
- **`useRequests(filter)`** - Subscribe to intercepted HTTP requests
- **`useHeaders(filter)`** - Subscribe to intercepted HTTP request headers

#### Window Management

- **`openWindow(url, options?)`** - Open new browser windows with request interception
  - Options: `width`, `height`, `showOverlay`
- **`done(result?)`** - Complete plugin execution and close windows

#### Proof Generation

- **`prove(request, options)`** - Generate TLSNotary proofs for HTTP requests
  - Request: `url`, `method`, `headers`
  - Options: `verifierUrl`, `proxyUrl`, `maxRecvData`, `maxSentData`, `handlers`
  - Automatically manages `_proveProgress` state for real-time progress feedback

## Installation

```bash
npm install @tlsn/plugin-sdk
```

## Usage

### Creating a Plugin Host

```typescript
import { Host } from '@tlsn/plugin-sdk';

const host = new Host({
  onProve: async (request, options, onProgress?) => {
    // Handle proof generation
    // Call onProgress?.({ step, progress, message }) to update plugin UI
    return proofResult;
  },
  onRenderPluginUi: (domJson) => {
    // Render plugin UI
  },
  onCloseWindow: (windowId) => {
    // Clean up window
  },
  onOpenWindow: async (url, options) => {
    // Open browser window with request interception
    return { windowId, uuid, tabId };
  },
});

// Execute plugin code
await host.executePlugin(pluginCode, { eventEmitter });
```

### Writing a Plugin

See [`packages/demo/public/plugins/twitter.js`](../demo/public/plugins/twitter.js) for a complete working example, [`packages/ts-plugin-sample`](../ts-plugin-sample) for a TypeScript example, and [PLUGIN.md](../../PLUGIN.md) for full API documentation.

### Progress Reporting

The `prove()` function automatically updates a reserved `_proveProgress` state key with real-time progress data. Plugins can read this state in `main()` to render a progress bar:

```javascript
function main() {
  const progress = useState('_proveProgress', null);
  // progress = { step: 'MPC_SETUP', progress: 0.2, message: 'MPC session established' }
  // ... render progress bar based on progress.progress and progress.message
}
```

See [PLUGIN.md - Progress Reporting](../../PLUGIN.md#automatic-progress-via-_proveprogress-state) for full documentation and examples.

### Reveal Handlers

Control what data is revealed in proofs:

```javascript
reveal: [
  // Reveal request start line
  {
    type: 'SENT',
    part: 'START_LINE',
    action: 'REVEAL',
  },
  // Reveal specific header
  {
    type: 'RECV',
    part: 'HEADERS',
    action: 'REVEAL',
    params: { key: 'date' },
  },
  // Reveal JSON field value only
  {
    type: 'RECV',
    part: 'BODY',
    action: 'REVEAL',
    params: {
      type: 'json',
      path: 'screen_name',
      hideKey: true, // Only reveal the value
    },
  },
  // Reveal pattern match
  {
    type: 'RECV',
    part: 'BODY',
    action: 'REVEAL',
    params: {
      type: 'regex',
      regex: /user_id=\d+/g,
    },
  },
];
```

**Handler Types**:

- `SENT` - Request data
- `RECV` - Response data

**Handler Parts**:

- `START_LINE` - Full start line
- `PROTOCOL` - HTTP version
- `METHOD` - HTTP method
- `REQUEST_TARGET` - Request path
- `STATUS_CODE` - Response status
- `HEADERS` - HTTP headers
- `BODY` - Response body

**Handler Actions**:

- `REVEAL` - Include in proof as plaintext
- `HASH` - Commit with hash (default: BLAKE3)
- `ASSERT` - Reveal the value and have the verifier evaluate a comparison against it; the boolean result is reported as `assert` on the handler result (report-only, never aborts the proof)

```javascript
// Reveal the balance AND prove it is >= 1000
{
  type: 'RECV',
  part: 'BODY',
  action: { kind: 'ASSERT', op: 'gte', value: 1000, valueType: 'number' },
  params: { type: 'json', path: 'accounts.EUR', hideKey: true },
}
```

`ASSERT` supports `op: 'gt' | 'gte' | 'lt' | 'lte'` (with `value`), `op: 'between'` (with `min`, `max`, optional `inclusive`), and `op: 'in'` (with `values`). The ordering ops and `between` require a `valueType` of `'number'` | `'bigint'` | `'date'` | `'string'` that controls the comparison (numeric types ignore `_`/`,` separators; `date` parses RFC 3339 / ISO-8601). Operands may be strings for large bigints or date values. `in` tests membership (separator-tolerant).

## Architecture

### Plugin Execution Flow

```
1. Load plugin code
2. Create sandboxed QuickJS environment
3. Inject plugin capabilities (div, button, useEffect, etc.)
4. Execute plugin code to extract exports
5. Call main() function to render initial UI
6. React to events (clicks, requests, headers)
7. Re-render UI when state changes
8. Generate proofs when requested
9. Clean up when done() is called
```

### Hook System

Plugins use React-like hooks for state management:

- **`useEffect`**: Runs callbacks when dependencies change
- **`useRequests`**: Filters and tracks intercepted requests
- **`useHeaders`**: Filters and tracks intercepted headers

Hooks are evaluated during each `main()` call and compared with previous values to determine if re-rendering is needed.

## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- src/executePlugin.test.ts

# Run browser tests
npm run test:browser

# Run with coverage
npm run test:coverage
```

## Development

### Building

```bash
npm run build  # Build SDK with TypeScript declarations
```

### Linting

```bash
npm run lint      # Check code quality
npm run lint:fix  # Auto-fix issues
```

## Known Limitations

1. **Circular Reference in Node.js Tests**: The QuickJS sandbox serialization encounters circular references when passing hook capabilities in Node.js test environment. This is a test environment artifact and does not affect production code (verified by the extension's SessionManager).

## License

MIT
