import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
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
    browser.runtime.onMessage.addListener((request: any) => {
      // Example message handling
      if (request.type === 'PROCESS_DATA') {
        return Promise.resolve({ success: true, data: 'Processed in offscreen' });
      }

      // Handle config extraction requests (uses QuickJS)
      if (request.type === 'EXTRACT_CONFIG') {
        logger.debug('Offscreen extracting config from code');

        if (!sessionManager) {
          return Promise.resolve({
            success: false,
            error: 'SessionManager not initialized',
          });
        }

        return sessionManager
          .awaitInit()
          .then((sm) => sm.extractConfig(request.code))
          .then((config) => {
            logger.debug('Extracted config:', config);
            return { success: true, config };
          })
          .catch((error) => {
            logger.error('Config extraction error:', error);
            return { success: false, error: error.message };
          });
      }

      // Handle code execution requests
      if (request.type === 'EXEC_CODE_OFFSCREEN') {
        logger.debug('Offscreen executing code:', request.code);

        if (!sessionManager) {
          return Promise.resolve({
            success: false,
            error: 'SessionManager not initialized',
            requestId: request.requestId,
          });
        }

        return sessionManager
          .awaitInit()
          .then((sm) =>
            sm.executePlugin(request.code, request.requestId),
          )
          .then((result) => {
            logger.debug('Plugin execution result:', result);
            return {
              success: true,
              result,
              requestId: request.requestId,
            };
          })
          .catch((error) => {
            logger.error('Plugin execution error:', error);
            return {
              success: false,
              error: error.message,
              requestId: request.requestId,
            };
          });
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
