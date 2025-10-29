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
const DEFAULT_CODE = `// Open X.com and return a greeting
const config = {
  name: 'X Profile Prover',
  description: 'This plugin will prove your X.com profile.',
};

async function onClick() {
  const [header] = useHeaders(headers => {
    return headers.filter(header => header.url.includes('https://api.x.com/1.1/account/settings.json'));
  });
  const headers = {
    'cookie': header.requestHeaders.find(header => header.name === 'Cookie')?.value,
    'x-csrf-token': header.requestHeaders.find(header => header.name === 'x-csrf-token')?.value,
    'x-client-transaction-id': header.requestHeaders.find(header => header.name === 'x-client-transaction-id')?.value,
    Host: 'api.x.com',
    authorization: header.requestHeaders.find(header => header.name === 'authorization')?.value,
    'Accept-Encoding': 'identity',
    Connection: 'close',
  };

  const resp = await prove({
    url: 'https://api.x.com/1.1/account/settings.json',
    method: 'GET',
    headers: headers,
  }, {
    verifierUrl: 'http://localhost:7047',
    proxyUrl: 'wss://notary.pse.dev/proxy?token=api.x.com',
    maxRecvData: 16384,
    maxSentData: 4096,
    reveal: [
      {
        type: 'SENT',
        part: 'START_LINE',
        action: 'REVEAL',
      },
      {
        type: 'RECV',
        part: 'START_LINE',
        action: 'REVEAL',
      },
      {
        type: 'RECV',
        part: 'HEADERS',
        action: 'REVEAL',
        params: {
          key: 'date',
        },
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
    ]
  });

  done(JSON.stringify(resp));
}

function main() {
  const [header] = useHeaders(headers => headers.filter(header => header.url.includes('https://api.x.com/1.1/account/settings.json')));

  useEffect(() => {
    openWindow('https://x.com');
  }, []);

  return div({
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
  }, [
    div({
      style: {
        fontWeight: 'bold',
        color: header ? 'green' : 'red',
      },
    }, [ header ? 'Profile detected!' : 'No profile detected']),
    header
      ? button({
        style: {
          color: 'black',
          backgroundColor: 'white',
        },
        onclick: 'onClick',
      }, ['Prove'])
      : div({ style: {color: 'black'}}, ['Please login to x.com'])
  ]);
}

export default {
  main,
  onClick,
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
