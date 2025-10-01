/**
 * Browser-friendly loader for the WebAssembly Component
 *
 * This provides all the WASI stubs needed for the component to run in the browser
 */

// Create minimal WASI stub implementations
// Note: The keys must match what the transpiled component expects
const wasiStubs = {
  // Without version suffix (what the transpiled code looks for)
  'wasi:cli/stderr': {
    getStderr: () => ({
      write: (data) => { console.error(new TextDecoder().decode(data)); return data.length; }
    })
  },
  'wasi:cli/stdin': {
    getStdin: () => ({ read: () => new Uint8Array(0) })
  },
  'wasi:cli/stdout': {
    getStdout: () => ({
      write: (data) => { console.log(new TextDecoder().decode(data)); return data.length; }
    })
  },
  'wasi:cli/terminal-input': {
    TerminalInput: class {}
  },
  'wasi:cli/terminal-output': {
    TerminalOutput: class {}
  },
  'wasi:cli/terminal-stderr': {
    getTerminalStderr: () => null
  },
  'wasi:cli/terminal-stdin': {
    getTerminalStdin: () => null
  },
  'wasi:cli/terminal-stdout': {
    getTerminalStdout: () => null
  },
  'wasi:clocks/monotonic-clock': {
    now: () => BigInt(Date.now() * 1000000),
    resolution: () => BigInt(1000000),
    subscribeDuration: () => ({ ready: () => true }),
    subscribeInstant: () => ({ ready: () => true })
  },
  'wasi:clocks/wall-clock': {
    now: () => BigInt(Date.now() * 1000000),
    resolution: () => BigInt(1000000)
  },
  'wasi:filesystem/preopens': {
    getDirectories: () => []
  },
  'wasi:filesystem/types': {
    Descriptor: class {},
    filesystemErrorCode: () => 'unsupported'
  },
  'wasi:http/outgoing-handler': {
    handle: () => { throw new Error('HTTP not supported'); }
  },
  'wasi:http/types': {
    Fields: class {},
    FutureIncomingResponse: class {},
    IncomingBody: class {},
    IncomingRequest: class {},
    IncomingResponse: class {},
    OutgoingBody: class {},
    OutgoingRequest: class {},
    OutgoingResponse: class {},
    RequestOptions: class {},
    ResponseOutparam: class {}
  },
  'wasi:io/error': {
    Error: class Error { constructor(msg) { this.message = msg; } }
  },
  'wasi:io/poll': {
    Pollable: class {},
    poll: () => []
  },
  'wasi:io/streams': {
    InputStream: class {
      read() { return new Uint8Array(0); }
      subscribe() { return { ready: () => true }; }
    },
    OutputStream: class {
      write(data) { return data.length; }
      subscribe() { return { ready: () => true }; }
    }
  },
  'wasi:random/random': {
    getRandomBytes: (len) => {
      const bytes = new Uint8Array(len);
      crypto.getRandomValues(bytes);
      return bytes;
    },
    getRandomU64: () => {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      return new DataView(bytes.buffer).getBigUint64(0, true);
    }
  }
};

// Load and instantiate the component
async function loadComponent() {
  const { instantiate } = await import('/browser/hello.component.js');

  // Function to load core WASM modules
  async function getCoreModule(path) {
    const response = await fetch(`/browser/${path}`);
    const bytes = await response.arrayBuffer();
    return WebAssembly.compile(bytes);
  }

  // Instantiate with WASI stubs
  const component = await instantiate(getCoreModule, wasiStubs);

  return component;
}

// Export for use in HTML
window.loadWasmComponent = loadComponent;