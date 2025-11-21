import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { SessionManager } from '../../offscreen/SessionManager';

const OffscreenApp: React.FC = () => {
  useEffect(() => {
    console.log('Offscreen document loaded');

    // Override console.log to forward logs to background
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    console.log = function(...args: any[]) {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');

      // Forward to background for relay to page
      chrome.runtime.sendMessage({
        type: 'CONSOLE_LOG',
        level: 'info',
        message: message
      }).catch(() => {}); // Ignore errors if no listeners

      originalConsoleLog.apply(console, args);
    };

    console.error = function(...args: any[]) {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');

      chrome.runtime.sendMessage({
        type: 'CONSOLE_LOG',
        level: 'error',
        message: message
      }).catch(() => {});

      originalConsoleError.apply(console, args);
    };

    console.warn = function(...args: any[]) {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');

      chrome.runtime.sendMessage({
        type: 'CONSOLE_LOG',
        level: 'warning',
        message: message
      }).catch(() => {});

      originalConsoleWarn.apply(console, args);
    };

    // Initialize SessionManager
    const sessionManager = new SessionManager();
    console.log('SessionManager initialized in Offscreen');

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      // Example message handling
      if (request.type === 'PROCESS_DATA') {
        // Process data in offscreen context
        sendResponse({ success: true, data: 'Processed in offscreen' });
        return true;
      }

      // Handle code execution requests
      if (request.type === 'EXEC_CODE_OFFSCREEN') {
        console.log('Offscreen executing code:', request.code);

        if (!sessionManager) {
          sendResponse({
            success: false,
            error: 'SessionManager not initialized',
            requestId: request.requestId,
          });
          return true;
        }

        // Execute plugin code using SessionManager
        sessionManager
          .awaitInit()
          .then((sessionManager) => sessionManager.executePlugin(request.code))
          .then((result) => {
            console.log('Plugin execution result:', result);
            sendResponse({
              success: true,
              result,
              requestId: request.requestId,
            });
          })
          .catch((error) => {
            console.error('Plugin execution error:', error);
            sendResponse({
              success: false,
              error: error.message,
              requestId: request.requestId,
            });
          });

        return true; // Keep message channel open for async response
      }
    });
  }, []);

  return (
    <div className="offscreen-container">
      <h1>Offscreen Document</h1>
      <p>This document runs in the background for processing tasks.</p>
    </div>
  );
};

const container = document.getElementById('app-container');
if (container) {
  const root = createRoot(container);
  root.render(<OffscreenApp />);
}
