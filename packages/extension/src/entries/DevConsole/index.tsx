import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import browser from 'webextension-polyfill';
import './index.scss';

// Create window.tlsn API for extension pages
class ExtensionAPI {
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

// Initialize window.tlsn API
if (typeof window !== 'undefined') {
  (window as any).tlsn = new ExtensionAPI();
}

interface ConsoleEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'error' | 'success';
}

const DEFAULT_CODE = `// Open X.com and return a greeting
const config = {
  name: 'X Profile Prover',
  description: 'This plugin will prove your X.com profile.',
};

async function prove() {
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
  console.log('headers', headers);
  const proverId = await createProver('api.x.com', 'http://localhost:7047');
  console.log('prover', proverId);
  await sendRequest(proverId, 'wss://notary.pse.dev/proxy?token=api.x.com', {
    url: 'https://api.x.com/1.1/account/settings.json',
    method: 'GET',
    headers: headers,
  });
  const { sent, recv } = await transcript(proverId);

  const commit = {
    sent: subtractRanges(
      { start: 0, end: sent.length },
      mapStringToRange(
        [
          \`x-csrf-token: \${headers['x-csrf-token']}\`,
          \`x-client-transaction-id: \${headers['x-client-transaction-id']}\`,
          \`cookie: \${headers['cookie']}\`,
          \`authorization: \${headers.authorization}\`,
        ],
        Buffer.from(sent).toString('utf-8'),
      ),
    ),
    recv: [{ start: 0, end: recv.length }],
  };

  console.log('commit', commit);
  await reveal(proverId, commit);
  done(proverId);
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
        onclick: 'prove',
      }, ['Prove'])
      : div({ style: {color: 'black'}}, ['Please login to x.com'])
  ]);
}
export default {
  main,
  prove,
  config,
};
`;

const DevConsole: React.FC = () => {
  const [code, setCode] = useState<string>(DEFAULT_CODE);
  const consoleOutputRef = useRef<HTMLDivElement>(null);
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([
    {
      timestamp: new Date().toLocaleTimeString(),
      message: 'DevConsole initialized. window.tlsn API ready.',
      type: 'success',
    },
  ]);

  // Auto-scroll console to bottom when new entries are added
  useEffect(() => {
    if (consoleOutputRef.current) {
      consoleOutputRef.current.scrollTop =
        consoleOutputRef.current.scrollHeight;
    }
  }, [consoleEntries]);

  const addConsoleEntry = (
    message: string,
    type: ConsoleEntry['type'] = 'info',
  ) => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleEntries((prev) => [...prev, { timestamp, message, type }]);
  };

  const executeCode = async () => {
    const codeToExecute = code.trim();

    if (!codeToExecute) {
      addConsoleEntry('No code to execute', 'error');
      return;
    }

    addConsoleEntry('Executing code...', 'info');
    const startTime = performance.now();

    try {
      const result = await (window as any).tlsn.execCode(codeToExecute);
      const executionTime = (performance.now() - startTime).toFixed(2);

      addConsoleEntry(`Execution completed in ${executionTime}ms`, 'success');

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

  const clearConsole = () => {
    setConsoleEntries([
      {
        timestamp: new Date().toLocaleTimeString(),
        message: 'Console cleared',
        type: 'info',
      },
    ]);
  };

  return (
    <div className="dev-console">
      <div className="editor-section">
        <div className="editor-header">
          <div className="editor-title">Code Editor</div>
          <div className="editor-actions">
            <button className="btn btn-primary" onClick={executeCode}>
              ▶️ Run Code
            </button>
          </div>
        </div>
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

      <div className="console-section">
        <div className="console-header">
          <div className="console-title">Console</div>
          <div className="editor-actions">
            <button className="btn btn-secondary" onClick={clearConsole}>
              Clear Console
            </button>
          </div>
        </div>
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

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(<DevConsole />);
