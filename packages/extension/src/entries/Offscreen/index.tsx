import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { SessionManager } from '../../background/SessionManager';

const sessionManager = new SessionManager();

const OffscreenApp: React.FC = () => {
  useEffect(() => {
    console.log('Offscreen document loaded');

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Offscreen received message:', request);

      // Example message handling
      if (request.type === 'PROCESS_DATA') {
        // Process data in offscreen context
        sendResponse({ success: true, data: 'Processed in offscreen' });
        return true;
      }

      // Handle code execution requests
      if (request.type === 'EXEC_CODE_OFFSCREEN') {
        console.log('Offscreen executing code:', request.code);

        // Execute code using SessionManager
        sessionManager.executePlugin(request.code)
          .then(result => {
            console.log('Code execution result:', result);
            sendResponse({
              success: true,
              result: result,
              requestId: request.requestId,
            });
          })
          .catch(error => {
            console.error('Code execution error:', error);
            sendResponse({
              success: false,
              error: error.message || 'Code execution failed',
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
