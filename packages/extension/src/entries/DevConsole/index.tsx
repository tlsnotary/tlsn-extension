import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import browser from 'webextension-polyfill';
import './index.scss';

/**
 * ExtensionAPI Class
 *
 * Provides a communication bridge between the DevConsole UI and the background
 * service worker for executing plugin code.
 *
 * This API is exposed as `window.tlsn` and allows the DevConsole to:
 * - Execute plugin code in a sandboxed QuickJS environment
 * - Communicate with the plugin-sdk Host via background messages
 * - Receive execution results or error messages
 */
class ExtensionAPI {
  /**
   * Execute plugin code in the background service worker
   *
   * @param code - JavaScript code string to execute (must export main, onClick, config)
   * @returns Promise resolving to the execution result
   * @throws Error if code is invalid or execution fails
   *
   * Flow:
   * 1. Sends EXEC_CODE message to background service worker
   * 2. Background creates QuickJS sandbox with plugin capabilities
   * 3. Code is evaluated and main() is called
   * 4. Results are returned or errors are thrown
   */
  async execCode(code: string): Promise<unknown> {
    if (!code || typeof code !== 'string') {
      throw new Error('Code must be a non-empty string');
    }

    const response = await browser.runtime.sendMessage({
      type: 'EXEC_CODE',
      code,
      requestId: `exec_${Date.now()}_${Math.random()}`,
    });

    if (response.success) {
      return response.result;
    } else {
      throw new Error(response.error || 'Code execution failed');
    }
  }
}

// Initialize window.tlsn API for use in DevConsole
if (typeof window !== 'undefined') {
  (window as any).tlsn = new ExtensionAPI();
}

/**
 * ConsoleEntry Interface
 *
 * Represents a single entry in the DevConsole output panel
 */
interface ConsoleEntry {
  /** Time when the entry was created (HH:MM:SS format) */
  timestamp: string;
  /** The console message text */
  message: string;
  /** Entry type affecting display styling */
  type: 'info' | 'error' | 'success';
}

/**
 * Default Plugin Code Template
 *
 * This is the starter code shown in the DevConsole editor.
 * It demonstrates a complete TLSN plugin with:
 * - Config object with plugin metadata
 * - onClick handler for proof generation
 * - main() function with React-like hooks (useEffect, useHeaders)
 * - UI rendering with div/button components
 * - prove() call with reveal handlers for selective disclosure
 *
 * Plugin Capabilities Used:
 * - useHeaders: Subscribe to intercepted HTTP request headers
 * - useEffect: Run side effects when dependencies change
 * - openWindow: Open browser windows with request interception
 * - div/button: Create UI components
 * - prove: Generate TLSNotary proofs with selective disclosure
 * - done: Complete plugin execution
 */
const DEFAULT_CODE = `// =============================================================================
// PLUGIN CONFIGURATION
// =============================================================================
/**
 * The config object defines plugin metadata displayed to users.
 * This information appears in the plugin selection UI.
 */
const config = {
  name: 'X Profile Prover',
  description: 'This plugin will prove your X.com profile.',
};

// =============================================================================
// PROOF GENERATION CALLBACK
// =============================================================================
/**
 * This function is triggered when the user clicks the "Prove" button.
 * It extracts authentication headers from intercepted requests and generates
 * a TLSNotary proof using the unified prove() API.
 *
 * Flow:
 * 1. Get the intercepted X.com API request headers
 * 2. Extract authentication headers (Cookie, CSRF token, OAuth token, etc.)
 * 3. Call prove() with the request configuration and reveal handlers
 * 4. prove() internally:
 *    - Creates a prover connection to the verifier
 *    - Sends the HTTP request through the TLS prover
 *    - Captures the TLS transcript (sent/received bytes)
 *    - Parses the transcript with byte-level range tracking
 *    - Applies selective reveal handlers to show only specified data
 *    - Generates and returns the cryptographic proof
 * 5. Return the proof result to the caller via done()
 */
async function onClick() {
  // Check if request is already pending
  const isRequestPending = useState('isRequestPending', false);
  if (isRequestPending) {
    return; // Prevent multiple concurrent requests
  }

  // Set request pending state to true
  setState('isRequestPending', true);

  try {
    // Step 1: Get the intercepted header from the X.com API request
    // useHeaders() provides access to all intercepted HTTP request headers
    // We filter for the specific X.com API endpoint we want to prove
    const [header] = useHeaders(headers => {
      return headers.filter(header => header.url.includes('https://api.x.com/1.1/account/settings.json'));
    });

    // Step 2: Extract authentication headers from the intercepted request
    // These headers are required to authenticate with the X.com API
    const headers = {
    // Cookie: Session authentication token
    'cookie': header.requestHeaders.find(header => header.name === 'Cookie')?.value,

    // X-CSRF-Token: Cross-Site Request Forgery protection token
    'x-csrf-token': header.requestHeaders.find(header => header.name === 'x-csrf-token')?.value,

    // X-Client-Transaction-ID: Request tracking identifier
    'x-client-transaction-id': header.requestHeaders.find(header => header.name === 'x-client-transaction-id')?.value,

    // Host: Target server hostname
    Host: 'api.x.com',

    // Authorization: OAuth bearer token for API authentication
    authorization: header.requestHeaders.find(header => header.name === 'authorization')?.value,

    // Accept-Encoding: Must be 'identity' for TLSNotary (no compression)
    // TLSNotary requires uncompressed data to verify byte-for-byte
    'Accept-Encoding': 'identity',

    // Connection: Use 'close' to complete the connection after one request
    Connection: 'close',
  };

  // Step 3: Generate TLS proof using the unified prove() API
  // This single function handles the entire proof generation pipeline
  const resp = await prove(
    // -------------------------------------------------------------------------
    // REQUEST OPTIONS
    // -------------------------------------------------------------------------
    // Defines the HTTP request to be proven
    {
      url: 'https://api.x.com/1.1/account/settings.json',  // Target API endpoint
      method: 'GET',                                        // HTTP method
      headers: headers,                                     // Authentication headers
    },

    // -------------------------------------------------------------------------
    // PROVER OPTIONS
    // -------------------------------------------------------------------------
    // Configures the TLS proof generation process
    {
      // Verifier URL: The notary server that verifies the TLS connection
      // Must be running locally or accessible at this address
      verifierUrl: 'http://localhost:7047',

      // Proxy URL: WebSocket proxy that relays TLS data to the target server
      // The token parameter specifies which server to connect to
      proxyUrl: 'wss://notary.pse.dev/proxy?token=api.x.com',

      // Maximum bytes to receive from server (response size limit)
      maxRecvData: 16384,  // 16 KB

      // Maximum bytes to send to server (request size limit)
      maxSentData: 4096,   // 4 KB

      // -----------------------------------------------------------------------
      // HANDLERS
      // -----------------------------------------------------------------------
      // These handlers specify which parts of the TLS transcript to reveal
      // in the proof. Unrevealed data is redacted for privacy.
      handlers: [
        // Reveal the request start line (GET /path HTTP/1.1)
        // This proves the HTTP method and path were sent
        {
          type: 'SENT',           // Direction: data sent to server
          part: 'START_LINE',     // Part: HTTP request line
          action: 'REVEAL',       // Action: include as plaintext in proof
        },

        // Reveal the response start line (HTTP/1.1 200 OK)
        // This proves the server responded with status code 200
        {
          type: 'RECV',           // Direction: data received from server
          part: 'START_LINE',     // Part: HTTP response line
          action: 'REVEAL',       // Action: include as plaintext in proof
        },

        // Reveal the 'date' header from the response
        // This proves when the server generated the response
        {
          type: 'RECV',           // Direction: data received from server
          part: 'HEADERS',        // Part: HTTP headers
          action: 'REVEAL',       // Action: include as plaintext in proof
          params: {
            key: 'date',          // Specific header to reveal
          },
        },

        // Reveal the 'screen_name' field from the JSON response body
        // This proves the X.com username without revealing other profile data
        {
          type: 'RECV',           // Direction: data received from server
          part: 'BODY',           // Part: HTTP response body
          action: 'REVEAL',       // Action: include as plaintext in proof
          params: {
            type: 'json',         // Body format: JSON
            path: 'screen_name',  // JSON field to reveal (top-level only)
          },
        },
      ]
    }
  );

    // Step 4: Complete plugin execution and return the proof result
    // done() signals that the plugin has finished and passes the result back
    done(JSON.stringify(resp));
  } catch (error) {
    console.error('Proof generation failed:', error);
    done({ error: error.message });
  } finally {
    // Reset request pending state after 1 second to allow UI feedback
    setTimeout(() => {
      setState('isRequestPending', false);
    }, 1000);
  }
}

// =============================================================================
// MAIN UI FUNCTION
// =============================================================================
/**
 * The main() function is called reactively whenever plugin state changes.
 * It returns a DOM structure that is rendered as the plugin UI.
 *
 * React-like Hooks Used:
 * - useHeaders(): Subscribes to intercepted HTTP request headers
 * - useEffect(): Runs side effects when dependencies change
 * - useState(): Manages component state
 *
 * UI Flow:
 * 1. Check if X.com API request headers have been intercepted
 * 2. If not intercepted yet: Show "Please login" message
 * 3. If intercepted: Show "Profile detected" with a "Prove" button
 * 4. On first render: Open X.com in a new window to trigger login
 * 5. Can minimize to floating action button and expand back
 */
function expandUI() {
  setState('isMinimized', false);
}

function minimizeUI() {
  setState('isMinimized', true);
}

function main() {
  // State management
  const isMinimized = useState('isMinimized', false);
  const isRequestPending = useState('isRequestPending', false);

  // Subscribe to intercepted headers for the X.com API endpoint
  // This will reactively update whenever new headers matching the filter arrive
  const [header] = useHeaders(headers => headers.filter(header => header.url.includes('https://api.x.com/1.1/account/settings.json')));

  // Run once on plugin load: Open X.com in a new window
  // The empty dependency array [] means this runs only once
  // The opened window's requests will be intercepted by the plugin
  useEffect(() => {
    openWindow('https://x.com');
  }, []);

  // If minimized, show floating action button
  if (isMinimized) {
    return div({
      style: {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '60px',
        height: '60px',
        borderRadius: '50%',
        backgroundColor: '#4CAF50',
        boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
        zIndex: '999999',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        fontSize: '24px',
        color: 'white',
      },
      onclick: 'expandUI',
    }, ['🔐']);
  }

  // Loading spinner component
  const spinner = div({
    style: {
      width: '24px',
      height: '24px',
      border: '3px solid #f3f3f3',
      borderTop: '3px solid #4CAF50',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
      margin: '10px auto',
    }
  }, []);

  // Add keyframes for spinner animation
  const style = document.createElement('style');
  style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
  if (!document.head.querySelector('style[data-plugin-spinner]')) {
    style.setAttribute('data-plugin-spinner', 'true');
    document.head.appendChild(style);
  }

  // Render the plugin UI overlay
  // This creates a fixed-position widget in the bottom-right corner
  return div({
    style: {
      position: 'fixed',
      bottom: '0',
      right: '8px',
      width: '280px',
      borderRadius: '8px 8px 0 0',
      backgroundColor: 'white',
      boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
      zIndex: '999999',
      fontSize: '14px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      overflow: 'hidden',
    },
  }, [
    // Header with minimize button
    div({
      style: {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '12px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        color: 'white',
      }
    }, [
      div({
        style: {
          fontWeight: '600',
          fontSize: '16px',
        }
      }, ['X Profile Prover']),
      button({
        style: {
          background: 'transparent',
          border: 'none',
          color: 'white',
          fontSize: '20px',
          cursor: 'pointer',
          padding: '0',
          width: '24px',
          height: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        onclick: 'minimizeUI',
      }, ['−'])
    ]),

    // Content area
    div({
      style: {
        padding: '20px',
        backgroundColor: '#f8f9fa',
      }
    }, [
      // Status indicator showing whether profile is detected
      div({
        style: {
          marginBottom: '16px',
          padding: '12px',
          borderRadius: '6px',
          backgroundColor: header ? '#d4edda' : '#f8d7da',
          color: header ? '#155724' : '#721c24',
          border: \`1px solid \$\{header ? '#c3e6cb' : '#f5c6cb'\}\`,
          fontWeight: '500',
        },
      }, [
        header ? '✓ Profile detected' : '⚠ No profile detected'
      ]),

      // Conditional UI based on whether we have intercepted the headers
      header ? (
        isRequestPending ?
          // Show spinner when request is pending
          div({
            style: {
              textAlign: 'center',
              padding: '20px',
            }
          }, [
            spinner,
            div({
              style: {
                marginTop: '12px',
                color: '#666',
                fontSize: '14px',
              }
            }, ['Generating proof...'])
          ])
          :
          // Show prove button when not pending
          button({
            style: {
              width: '100%',
              padding: '12px 24px',
              borderRadius: '6px',
              border: 'none',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              fontWeight: '600',
              fontSize: '15px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            },
            onclick: 'onClick',
          }, ['Generate Proof'])
      ) : (
        // Show login message
        div({
          style: {
            textAlign: 'center',
            color: '#666',
            padding: '12px',
            backgroundColor: '#fff3cd',
            borderRadius: '6px',
            border: '1px solid #ffeaa7',
          }
        }, ['Please login to x.com to continue'])
      )
    ])
  ]);
}

// =============================================================================
// PLUGIN EXPORTS
// =============================================================================
/**
 * All plugins must export an object with these properties:
 * - main: The reactive UI rendering function
 * - onClick: Click handler callback for buttons
 * - expandUI: Handler to expand from minimized state
 * - minimizeUI: Handler to minimize the UI
 * - config: Plugin metadata
 */
export default {
  main,
  onClick,
  expandUI,
  minimizeUI,
  config,
};
`;

/**
 * DevConsole Component
 *
 * Interactive development console for testing TLSN plugins in real-time.
 *
 * Features:
 * - CodeMirror editor with JavaScript syntax highlighting
 * - Live code execution via window.tlsn.execCode()
 * - Console output panel with timestamped entries
 * - Auto-scrolling console
 * - Error handling and execution timing
 *
 * Architecture:
 * 1. User writes plugin code in CodeMirror editor
 * 2. Clicks "Run Code" button
 * 3. Code is sent to background service worker via EXEC_CODE message
 * 4. Background creates QuickJS sandbox with plugin capabilities
 * 5. Plugin main() is called and UI is rendered
 * 6. Results/errors are displayed in console panel
 */
const DevConsole: React.FC = () => {
  // Editor state - stores the plugin code
  const [code, setCode] = useState<string>(DEFAULT_CODE);

  // Console output ref for auto-scrolling
  const consoleOutputRef = useRef<HTMLDivElement>(null);

  // Console entries array with initial welcome message
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([
    {
      timestamp: new Date().toLocaleTimeString(),
      message: 'DevConsole initialized. window.tlsn API ready.',
      type: 'success',
    },
  ]);

  /**
   * Auto-scroll console to bottom when new entries are added
   * This ensures the latest output is always visible
   */
  useEffect(() => {
    if (consoleOutputRef.current) {
      consoleOutputRef.current.scrollTop =
        consoleOutputRef.current.scrollHeight;
    }
  }, [consoleEntries]);

  /**
   * Add a new entry to the console output
   *
   * @param message - The message to display
   * @param type - Entry type (info, error, success) for styling
   */
  const addConsoleEntry = (
    message: string,
    type: ConsoleEntry['type'] = 'info',
  ) => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleEntries((prev) => [...prev, { timestamp, message, type }]);
  };

  /**
   * Execute the plugin code in the background service worker
   *
   * Flow:
   * 1. Validate code is not empty
   * 2. Send code to background via window.tlsn.execCode()
   * 3. Background creates QuickJS sandbox with capabilities
   * 4. Plugin code is evaluated and main() is called
   * 5. Display results or errors in console
   *
   * Performance tracking:
   * - Measures execution time from send to response
   * - Includes sandbox creation, code evaluation, and main() execution
   */
  const executeCode = async () => {
    const codeToExecute = code.trim();

    if (!codeToExecute) {
      addConsoleEntry('No code to execute', 'error');
      return;
    }

    addConsoleEntry('Executing code...', 'info');
    const startTime = performance.now();

    try {
      // Execute code in sandboxed QuickJS environment
      const result = await (window as any).tlsn.execCode(codeToExecute);
      const executionTime = (performance.now() - startTime).toFixed(2);

      addConsoleEntry(`Execution completed in ${executionTime}ms`, 'success');

      // Display result if returned (from done() call or explicit return)
      if (result !== undefined) {
        if (typeof result === 'object') {
          addConsoleEntry(
            `Result:\n${JSON.stringify(result, null, 2)}`,
            'success',
          );
        } else {
          addConsoleEntry(`Result: ${result}`, 'success');
        }
      } else {
        addConsoleEntry(
          'Code executed successfully (no return value)',
          'success',
        );
      }
    } catch (error: any) {
      const executionTime = (performance.now() - startTime).toFixed(2);
      addConsoleEntry(
        `Error after ${executionTime}ms:\n${error.message}`,
        'error',
      );
    }
  };

  /**
   * Clear the console output panel
   * Resets to a single "Console cleared" message
   */
  const clearConsole = () => {
    setConsoleEntries([
      {
        timestamp: new Date().toLocaleTimeString(),
        message: 'Console cleared',
        type: 'info',
      },
    ]);
  };

  /**
   * Render the DevConsole UI
   *
   * Layout:
   * - Top: Code editor with CodeMirror
   * - Bottom: Console output panel
   * - Split 60/40 ratio
   *
   * Editor Features:
   * - JavaScript syntax highlighting
   * - Line numbers, bracket matching, auto-completion
   * - One Dark theme
   * - History (undo/redo)
   */
  return (
    <div className="dev-console">
      {/* Code Editor Section */}
      <div className="editor-section">
        <div className="editor-header">
          <div className="editor-title">Code Editor</div>
          <div className="editor-actions">
            <button className="btn btn-primary" onClick={executeCode}>
              ▶️ Run Code
            </button>
          </div>
        </div>
        {/* CodeMirror with JavaScript/JSX support */}
        <CodeMirror
          value={code}
          height="100%"
          theme={oneDark}
          extensions={[javascript({ jsx: true })]}
          onChange={(value) => setCode(value)}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            highlightSpecialChars: true,
            history: true,
            foldGutter: true,
            drawSelection: true,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            syntaxHighlighting: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: true,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            closeBracketsKeymap: true,
            defaultKeymap: true,
            searchKeymap: true,
            historyKeymap: true,
            foldKeymap: true,
            completionKeymap: true,
            lintKeymap: true,
          }}
          style={{
            fontSize: '14px',
            fontFamily: "'Monaco', 'Courier New', monospace",
            height: '0',
            flexGrow: 1,
          }}
        />
      </div>

      {/* Console Output Section */}
      <div className="console-section">
        <div className="console-header">
          <div className="console-title">Console</div>
          <div className="editor-actions">
            <button className="btn btn-secondary" onClick={clearConsole}>
              Clear Console
            </button>
          </div>
        </div>
        {/* Scrollable console output with timestamped entries */}
        <div className="console-output" ref={consoleOutputRef}>
          {consoleEntries.map((entry, index) => (
            <div key={index} className={`console-entry ${entry.type}`}>
              <span className="console-timestamp">[{entry.timestamp}]</span>
              <span className="console-message">{entry.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Initialize React Application
 *
 * Mount the DevConsole component to the #root element in devconsole.html
 */
const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(<DevConsole />);
