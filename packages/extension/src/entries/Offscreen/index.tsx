import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { SessionManager } from '../../offscreen/SessionManager';
import { logger } from '@tlsn/common';
import { getStoredLogLevel } from '../../utils/logLevelStorage';
import { sha256 } from '../../utils/cryptoHash';
import { getPluginCount, incrementPluginCount } from '../../utils/pluginExecutionCounts';
import type { OffscreenMessage } from '../../types/messages';

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
    browser.runtime.onMessage.addListener((msg: unknown) => {
      const request = msg as OffscreenMessage;
      // Example message handling
      if (request.type === 'PROCESS_DATA') {
        return Promise.resolve({
          success: true,
          data: 'Processed in offscreen',
        });
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
          .then((sm) => sm.extractConfig(request.code as string))
          .then((config) => {
            logger.debug('Extracted config:', config);
            return { success: true, config };
          })
          .catch((error) => {
            logger.error('Config extraction error:', error);
            return { success: false, error: error.message };
          });
      }

      if (request.type === 'GET_PLUGIN_STATS_OFFSCREEN') {
        return sessionManager.awaitInit().then(async (sm) => {
          const config = await sm.extractConfig(request.code as string);
          const hash = await sha256((request.code as string) + (request.pageOrigin as string));
          const count = await getPluginCount(hash);
          return { success: true, config, hash, count };
        });
      }

      if (request.type === 'INCREMENT_PLUGIN_COUNT_OFFSCREEN') {
        return incrementPluginCount(request.hash as string).then(() => ({ success: true }));
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
            sm.executePlugin(
              request.code as string,
              request.requestId as string | undefined,
              request.sessionData as Record<string, string> | undefined,
            ),
          )
          .then(async (result) => {
            logger.debug('Plugin execution result:', result);
            const pluginHash = (request.sessionData as Record<string, string> | undefined)
              ?._pluginHash;
            if (pluginHash) {
              await incrementPluginCount(pluginHash);
            }
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
