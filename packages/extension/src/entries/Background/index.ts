import browser from 'webextension-polyfill';
import { WindowManager } from '../../background/WindowManager';
import { confirmationManager } from '../../background/ConfirmationManager';
import type { PluginConfig } from '@tlsn/plugin-sdk/src/types';
import type {
  InterceptedRequest,
  InterceptedRequestHeader,
} from '../../types/window-manager';
import { validateUrl } from '../../utils/url-validator';
import { logger } from '@tlsn/common';
import { getStoredLogLevel } from '../../utils/logLevelStorage';

const chrome = global.chrome as any;

// Initialize logger with stored log level
getStoredLogLevel().then((level) => {
  logger.init(level);
  logger.info('Background script loaded');
});

// Initialize WindowManager for multi-window support
const windowManager = new WindowManager();

// Create context menu for Developer Console - only for extension icon
browser.contextMenus.create({
  id: 'developer-console',
  title: 'Developer Console',
  contexts: ['action'],
});

// Handle context menu clicks
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'developer-console') {
    // Open Developer Console
    browser.tabs.create({
      url: browser.runtime.getURL('devConsole.html'),
    });
  }
});

// Handle extension install/update
browser.runtime.onInstalled.addListener((details) => {
  logger.info('Extension installed/updated:', details.reason);
});

// Set up webRequest listener to intercept all requests
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Check if this tab belongs to a managed window
    const managedWindow = windowManager.getWindowByTabId(details.tabId);

    if (managedWindow && details.tabId !== undefined) {
      const request: InterceptedRequest = {
        id: `${details.requestId}`,
        method: details.method,
        url: details.url,
        timestamp: Date.now(),
        tabId: details.tabId,
        requestBody: details.requestBody,
      };

      // if (details.requestBody) {
      //   console.log(details.requestBody);
      // }

      // Add request to window's request history
      windowManager.addRequest(managedWindow.id, request);
    }
  },
  { urls: ['<all_urls>'] },
  ['requestBody', 'extraHeaders'],
);

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Check if this tab belongs to a managed window
    const managedWindow = windowManager.getWindowByTabId(details.tabId);

    if (managedWindow && details.tabId !== undefined) {
      const header: InterceptedRequestHeader = {
        id: `${details.requestId}`,
        method: details.method,
        url: details.url,
        timestamp: details.timeStamp,
        type: details.type,
        requestHeaders: details.requestHeaders || [],
        tabId: details.tabId,
      };

      // Add request to window's request history
      windowManager.addHeader(managedWindow.id, header);
    }
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders', 'extraHeaders'],
);

// Listen for window removal
browser.windows.onRemoved.addListener(async (windowId) => {
  const managedWindow = windowManager.getWindow(windowId);
  if (managedWindow) {
    logger.debug(
      `Managed window closed: ${managedWindow.uuid} (ID: ${windowId})`,
    );
    await windowManager.closeWindow(windowId);
  }
});

// Listen for tab updates to show overlay when tab is ready (Task 3.4)
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act when tab becomes complete
  if (changeInfo.status !== 'complete') {
    return;
  }

  // Check if this tab belongs to a managed window
  const managedWindow = windowManager.getWindowByTabId(tabId);
  if (!managedWindow) {
    return;
  }

  // If overlay should be shown but isn't visible yet, show it now
  if (managedWindow.showOverlayWhenReady && !managedWindow.overlayVisible) {
    logger.debug(
      `Tab ${tabId} complete, showing overlay for window ${managedWindow.id}`,
    );
    await windowManager.showOverlay(managedWindow.id);
  }
});

// Basic message handler
browser.runtime.onMessage.addListener((request, sender, sendResponse: any) => {
  logger.debug('Message received:', request.type);

  if (request.type === 'CONTENT_SCRIPT_READY') {
    if (!sender.tab?.windowId) {
      return;
    }
    windowManager.reRenderPluginUI(sender.tab.windowId as number);
    return true;
  }

  // Example response
  if (request.type === 'PING') {
    sendResponse({ type: 'PONG' });
    return true;
  }

  if (request.type === 'RENDER_PLUGIN_UI') {
    logger.debug(
      'RENDER_PLUGIN_UI request received:',
      request.json,
      request.windowId,
    );
    windowManager.showPluginUI(request.windowId, request.json);
    return true;
  }

  // Handle plugin confirmation responses from popup
  if (request.type === 'PLUGIN_CONFIRM_RESPONSE') {
    logger.debug('PLUGIN_CONFIRM_RESPONSE received:', request);
    confirmationManager.handleConfirmationResponse(
      request.requestId,
      request.allowed,
    );
    return true;
  }

  // Handle code execution requests
  if (request.type === 'EXEC_CODE') {
    logger.debug('EXEC_CODE request received');

    (async () => {
      try {
        // Step 1: Extract plugin config for confirmation (via offscreen QuickJS)
        let pluginConfig: PluginConfig | null = null;
        try {
          pluginConfig = await extractConfigViaOffscreen(request.code);
          logger.debug('Extracted plugin config:', pluginConfig);
        } catch (extractError) {
          logger.warn('Failed to extract plugin config:', extractError);
          // Continue with null config - user will see "Unknown Plugin" warning
        }

        // Step 2: Request user confirmation
        const confirmRequestId = `confirm_${Date.now()}_${Math.random()}`;
        let userAllowed: boolean;

        try {
          userAllowed = await confirmationManager.requestConfirmation(
            pluginConfig,
            confirmRequestId,
          );
        } catch (confirmError) {
          logger.error('Confirmation error:', confirmError);
          sendResponse({
            success: false,
            error:
              confirmError instanceof Error
                ? confirmError.message
                : 'Confirmation failed',
          });
          return;
        }

        // Step 3: If user denied, return rejection error
        if (!userAllowed) {
          logger.info('User rejected plugin execution');
          sendResponse({
            success: false,
            error: 'User rejected plugin execution',
          });
          return;
        }

        // Step 4: User allowed - proceed with execution
        logger.info('User allowed plugin execution, proceeding...');

        // Ensure offscreen document exists
        await createOffscreenDocument();

        // Forward to offscreen document
        const response = await chrome.runtime.sendMessage({
          type: 'EXEC_CODE_OFFSCREEN',
          code: request.code,
          requestId: request.requestId,
        });
        logger.debug('EXEC_CODE_OFFSCREEN response:', response);
        sendResponse(response);
      } catch (error) {
        logger.error('Error executing code:', error);
        sendResponse({
          success: false,
          error:
            error instanceof Error ? error.message : 'Code execution failed',
        });
      }
    })();

    return true; // Keep message channel open for async response
  }

  // Handle CLOSE_WINDOW requests
  if (request.type === 'CLOSE_WINDOW') {
    logger.debug('CLOSE_WINDOW request received:', request.windowId);

    if (!request.windowId) {
      logger.error('No windowId provided');
      sendResponse({
        type: 'WINDOW_ERROR',
        payload: {
          error: 'No windowId provided',
          details: 'windowId is required to close a window',
        },
      });
      return true;
    }

    // Close the window using WindowManager
    windowManager
      .closeWindow(request.windowId)
      .then(() => {
        logger.debug(`Window ${request.windowId} closed`);
        sendResponse({
          type: 'WINDOW_CLOSED',
          payload: {
            windowId: request.windowId,
          },
        });
      })
      .catch((error) => {
        logger.error('Error closing window:', error);
        sendResponse({
          type: 'WINDOW_ERROR',
          payload: {
            error: 'Failed to close window',
            details: String(error),
          },
        });
      });

    return true; // Keep message channel open for async response
  }

  // Handle OPEN_WINDOW requests from content scripts
  if (request.type === 'OPEN_WINDOW') {
    logger.debug('OPEN_WINDOW request received:', request.url);

    // Validate URL using comprehensive validator
    const urlValidation = validateUrl(request.url);
    if (!urlValidation.valid) {
      logger.error('URL validation failed:', urlValidation.error);
      sendResponse({
        type: 'WINDOW_ERROR',
        payload: {
          error: 'Invalid URL',
          details: urlValidation.error || 'URL validation failed',
        },
      });
      return true;
    }

    // Open a new window with the requested URL
    browser.windows
      .create({
        url: request.url,
        type: 'popup',
        width: request.width || 900,
        height: request.height || 700,
      })
      .then(async (window) => {
        if (
          !window.id ||
          !window.tabs ||
          !window.tabs[0] ||
          !window.tabs[0].id
        ) {
          throw new Error('Failed to create window or get tab ID');
        }

        const windowId = window.id;
        const tabId = window.tabs[0].id;

        logger.info(`Window created: ${windowId}, Tab: ${tabId}`);

        try {
          // Register window with WindowManager
          const managedWindow = await windowManager.registerWindow({
            id: windowId,
            tabId: tabId,
            url: request.url,
            showOverlay: request.showOverlay !== false, // Default to true
          });

          logger.debug(`Window registered: ${managedWindow.uuid}`);

          // Send success response
          sendResponse({
            type: 'WINDOW_OPENED',
            payload: {
              windowId: managedWindow.id,
              uuid: managedWindow.uuid,
              tabId: managedWindow.tabId,
            },
          });
        } catch (registrationError) {
          // Registration failed (e.g., window limit exceeded)
          // Close the window we just created
          logger.error('Window registration failed:', registrationError);
          await browser.windows.remove(windowId).catch(() => {
            // Ignore errors if window already closed
          });

          sendResponse({
            type: 'WINDOW_ERROR',
            payload: {
              error: 'Window registration failed',
              details: String(registrationError),
            },
          });
        }
      })
      .catch((error) => {
        logger.error('Error creating window:', error);
        sendResponse({
          type: 'WINDOW_ERROR',
          payload: {
            error: 'Failed to create window',
            details: String(error),
          },
        });
      });

    return true; // Keep message channel open for async response
  }

  if (request.type === 'TO_BG_RE_RENDER_PLUGIN_UI') {
    windowManager.reRenderPluginUI(request.windowId);
    return;
  }

  return true; // Keep message channel open for async response
});

// Create offscreen document if needed (Chrome 109+)
async function createOffscreenDocument() {
  // Check if we're in a Chrome environment that supports offscreen documents
  if (!chrome?.offscreen) {
    logger.debug('Offscreen API not available');
    return;
  }

  const offscreenUrl = browser.runtime.getURL('offscreen.html');

  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl],
  });

  if (existingContexts.length > 0) {
    return;
  }

  // Create offscreen document
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['DOM_SCRAPING'],
    justification: 'Offscreen document for background processing',
  });
}

// Initialize offscreen document
createOffscreenDocument().catch((err) =>
  logger.error('Offscreen document error:', err),
);

/**
 * Extract plugin config by sending code to offscreen document where QuickJS runs.
 * This is more reliable than regex-based extraction.
 */
async function extractConfigViaOffscreen(
  code: string,
): Promise<PluginConfig | null> {
  try {
    // Ensure offscreen document exists
    await createOffscreenDocument();

    // Send message to offscreen and wait for response
    const response = await chrome.runtime.sendMessage({
      type: 'EXTRACT_CONFIG',
      code,
    });

    if (response?.success && response.config) {
      return response.config as PluginConfig;
    }

    logger.warn('Config extraction returned no config:', response?.error);
    return null;
  } catch (error) {
    logger.error('Failed to extract config via offscreen:', error);
    return null;
  }
}

// Periodic cleanup of invalid windows (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
setInterval(() => {
  logger.debug('Running periodic window cleanup...');
  windowManager.cleanupInvalidWindows().catch((error) => {
    logger.error('Error during cleanup:', error);
  });
}, CLEANUP_INTERVAL_MS);

// Run initial cleanup after 10 seconds
setTimeout(() => {
  windowManager.cleanupInvalidWindows().catch((error) => {
    logger.error('Error during initial cleanup:', error);
  });
}, 10000);

export {};
