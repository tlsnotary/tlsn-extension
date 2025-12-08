import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { SessionManager } from '../../offscreen/SessionManager';
import { logger } from '@tlsn/common';
import { getStoredLogLevel } from '../../utils/logLevelStorage';

const OffscreenApp: React.FC = () => {
  useEffect(() => {
    // Initialize logger with stored log level
    getStoredLogLevel().then((level) => {
      logger.init(level);
      logger.info('Offscreen document loaded');
    });

    // Initialize SessionManager
    const sessionManager = new SessionManager();
    logger.debug('SessionManager initialized in Offscreen');

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
        logger.debug('Offscreen executing code:', request.code);

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
            logger.debug('Plugin execution result:', result);
            sendResponse({
              success: true,
              result,
              requestId: request.requestId,
            });
          })
          .catch((error) => {
            logger.error('Plugin execution error:', error);
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
