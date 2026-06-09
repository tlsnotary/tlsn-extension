import browser from 'webextension-polyfill';
import { WindowManager } from '../../background/WindowManager';
import { confirmationManager } from '../../background/ConfirmationManager';
import type { PluginConfig } from '@tlsn/plugin-sdk';
import type {
  InterceptedRequest,
  InterceptedRequestHeader,
  ApprovalMode,
  BackgroundMessage,
} from '@tlsn/host-extension/types';
import { validateUrl, getStoredLogLevel } from '@tlsn/host-extension/util';
import { logger } from '@tlsn/common';

const chrome = (global as typeof globalThis).chrome;

// Initialize logger with stored log level
getStoredLogLevel().then((level) => {
  logger.init(level);
  logger.info('Background script loaded');
});

// Initialize WindowManager for multi-window support
const windowManager = new WindowManager();

// Track requestId → tabId for routing progress events back to the originating tab.
// Entries have a TTL to prevent leaks if the offscreen document crashes before cleanup.
const PROGRESS_ROUTE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const progressRoutes: Map<string, { tabId: number; createdAt: number }> = new Map();

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
    logger.debug(`Managed window closed: ${managedWindow.uuid} (ID: ${windowId})`);
    await windowManager.closeWindow(windowId);
  }
});

// Listen for tab updates to show overlay when tab is ready (Task 3.4)
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, _tab) => {
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
    logger.debug(`Tab ${tabId} complete, showing overlay for window ${managedWindow.id}`);
    await windowManager.showOverlay(managedWindow.id);
  }
});

// Basic message handler
browser.runtime.onMessage.addListener((msg: unknown, sender: browser.Runtime.MessageSender) => {
  const request = msg as BackgroundMessage;
  logger.debug('Message received:', request.type);

  if (request.type === 'CONTENT_SCRIPT_READY') {
    if (!sender.tab?.windowId) {
      return;
    }
    windowManager.reRenderPluginUI(sender.tab.windowId as number);
    return; // No response needed
  }

  // Example response
  if (request.type === 'PING') {
    return Promise.resolve({ type: 'PONG' });
  }

  if (request.type === 'RENDER_PLUGIN_UI') {
    logger.debug('RENDER_PLUGIN_UI request received, windowId=%d', request.windowId);
    windowManager.showPluginUI(request.windowId, request.json);
    return; // No response needed
  }

  // Handle plugin code request from confirmation popup
  if (request.type === 'GET_PLUGIN_CODE') {
    const code = confirmationManager.getPluginCode(request.requestId);
    return Promise.resolve({ code: code || null });
  }

  // Handle plugin confirmation responses from popup
  if (request.type === 'PLUGIN_CONFIRM_RESPONSE') {
    logger.debug('PLUGIN_CONFIRM_RESPONSE received:', request);
    confirmationManager.handleConfirmationResponse(request.requestId, request.mode);
    return; // No response needed
  }

  // Route PROVE_PROGRESS from offscreen to the originating tab
  if (request.type === 'PROVE_PROGRESS') {
    const route = progressRoutes.get(request.requestId);
    if (route) {
      browser.tabs.sendMessage(route.tabId, {
        type: 'PROVE_PROGRESS',
        requestId: request.requestId,
        step: request.step,
        progress: request.progress,
        message: request.message,
        source: request.source,
      });
    }
    return; // No response needed
  }

  // Handle code execution requests
  if (request.type === 'EXEC_CODE') {
    logger.debug('EXEC_CODE request received');

    // Store requestId → tabId mapping for progress routing
    if (request.requestId && sender.tab?.id) {
      progressRoutes.set(request.requestId, {
        tabId: sender.tab.id,
        createdAt: Date.now(),
      });
    }

    // Return a Promise so the polyfill keeps the message channel open
    // and resolves when the async work completes. This is more reliable
    // than the sendResponse + return true pattern.
    return (async () => {
      try {
        // Step 1: Look up plugin stats (config, hash, prior execution count) via offscreen
        let pluginConfig: PluginConfig | null = null;
        let pluginHash = '';
        let executionCount = 0;
        try {
          const stats = await getPluginStatsViaOffscreen(request.code, request.pageOrigin ?? '');
          pluginConfig = stats.config;
          pluginHash = stats.hash;
          executionCount = stats.count;
          logger.debug('Plugin stats:', {
            config: pluginConfig,
            hash: pluginHash,
            count: executionCount,
          });
        } catch (extractError) {
          logger.warn('Failed to get plugin stats:', extractError);
          // Continue with defaults - user will see "Unknown Plugin" warning
        }

        // Step 2: Request user confirmation
        const confirmRequestId = `confirm_${Date.now()}_${Math.random()}`;
        let mode: ApprovalMode;

        try {
          mode = await confirmationManager.requestConfirmation(
            pluginConfig,
            confirmRequestId,
            executionCount,
            sender.tab?.url,
            request.code,
          );
        } catch (confirmError) {
          logger.error('Confirmation error:', confirmError);
          return {
            success: false,
            error: confirmError instanceof Error ? confirmError.message : 'Confirmation failed',
          };
        }

        // Step 3: If user denied, return rejection error
        if (mode === 'rejected') {
          logger.info('User rejected plugin execution');
          return {
            success: false,
            error: 'User rejected plugin execution',
          };
        }

        // Step 4: User allowed - proceed with execution
        logger.info('User allowed plugin execution, proceeding...');

        // Ensure offscreen document exists
        await createOffscreenDocument();

        const response = await chrome.runtime.sendMessage({
          type: 'EXEC_CODE_OFFSCREEN',
          code: request.code,
          requestId: request.requestId,
          sessionData: {
            ...request.sessionData,
            _approvalMode: mode,
            _pluginHash: pluginHash,
          },
        });
        logger.debug('EXEC_CODE_OFFSCREEN response:', response);
        return response;
      } catch (error) {
        logger.error('Error executing code:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Code execution failed',
        };
      } finally {
        // Clean up progress route
        if (request.requestId) {
          progressRoutes.delete(request.requestId);
        }
      }
    })();
  }

  // Handle CLOSE_WINDOW requests
  if (request.type === 'CLOSE_WINDOW') {
    logger.debug('CLOSE_WINDOW request received:', request.windowId);

    if (!request.windowId) {
      logger.error('No windowId provided');
      return Promise.resolve({
        type: 'WINDOW_ERROR',
        payload: {
          error: 'No windowId provided',
          details: 'windowId is required to close a window',
        },
      });
    }

    // Close the window using WindowManager
    return windowManager
      .closeWindow(request.windowId)
      .then(() => {
        logger.debug(`Window ${request.windowId} closed`);
        return {
          type: 'WINDOW_CLOSED',
          payload: {
            windowId: request.windowId,
          },
        };
      })
      .catch((error) => {
        logger.error('Error closing window:', error);
        return {
          type: 'WINDOW_ERROR',
          payload: {
            error: 'Failed to close window',
            details: String(error),
          },
        };
      });
  }

  // Handle OPEN_WINDOW requests from content scripts
  if (request.type === 'OPEN_WINDOW') {
    logger.debug('OPEN_WINDOW request received:', request.url);

    // Validate URL using comprehensive validator
    const urlValidation = validateUrl(request.url);
    if (!urlValidation.valid) {
      logger.error('URL validation failed:', urlValidation.error);
      return Promise.resolve({
        type: 'WINDOW_ERROR',
        payload: {
          error: 'Invalid URL',
          details: urlValidation.error || 'URL validation failed',
        },
      });
    }

    // Calculate position to center on the active browser window, then open
    const popupWidth = request.width || 900;
    const popupHeight = request.height || 700;

    return browser.windows
      .getCurrent()
      .then((currentWindow) => {
        let left: number | undefined;
        let top: number | undefined;

        if (
          currentWindow.left != null &&
          currentWindow.top != null &&
          currentWindow.width != null &&
          currentWindow.height != null
        ) {
          left = Math.round(currentWindow.left + (currentWindow.width - popupWidth) / 2);
          top = Math.round(currentWindow.top + (currentWindow.height - popupHeight) / 2);
        }

        return { left, top };
      })
      .catch(() => ({
        left: undefined as number | undefined,
        top: undefined as number | undefined,
      }))
      .then(({ left, top }) =>
        browser.windows.create({
          url: request.url,
          type: 'popup',
          width: popupWidth,
          height: popupHeight,
          left,
          top,
        }),
      )
      .then(async (window) => {
        if (!window.id || !window.tabs || !window.tabs[0] || !window.tabs[0].id) {
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

          return {
            type: 'WINDOW_OPENED',
            payload: {
              windowId: managedWindow.id,
              uuid: managedWindow.uuid,
              tabId: managedWindow.tabId,
            },
          };
        } catch (registrationError) {
          // Registration failed (e.g., window limit exceeded)
          // Close the window we just created
          logger.error('Window registration failed:', registrationError);
          await browser.windows.remove(windowId).catch(() => {
            // Ignore errors if window already closed
          });

          return {
            type: 'WINDOW_ERROR',
            payload: {
              error: 'Window registration failed',
              details: String(registrationError),
            },
          };
        }
      })
      .catch((error) => {
        logger.error('Error creating window:', error);
        return {
          type: 'WINDOW_ERROR',
          payload: {
            error: 'Failed to create window',
            details: String(error),
          },
        };
      });
  }

  if (request.type === 'TO_BG_RE_RENDER_PLUGIN_UI') {
    windowManager.reRenderPluginUI(request.windowId);
    return; // No response needed
  }

  // Unknown message type - no response needed
  return;
});

// Mutex for offscreen document creation to prevent race conditions
let offscreenDocumentCreationPromise: Promise<void> | null = null;

// Create offscreen document if needed (Chrome 109+)
// Uses mutex to prevent race conditions when multiple callers try to create simultaneously
async function createOffscreenDocument(): Promise<void> {
  // If creation is already in progress, wait for it
  if (offscreenDocumentCreationPromise) {
    return offscreenDocumentCreationPromise;
  }

  // Create the promise and store it for other callers to wait on
  offscreenDocumentCreationPromise = (async () => {
    try {
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
        logger.debug('Offscreen document already exists');
        return;
      }

      // Create offscreen document
      logger.debug('Creating offscreen document...');
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification: 'Run QuickJS sandbox and TLS prover in a worker context',
      });
      logger.debug('Offscreen document created successfully');
    } finally {
      // Clear the promise so future calls can create if needed
      offscreenDocumentCreationPromise = null;
    }
  })();

  return offscreenDocumentCreationPromise;
}

// Initialize offscreen document
createOffscreenDocument().catch((err) => logger.error('Offscreen document error:', err));

/**
 * Get plugin stats (config, content hash, prior execution count) by sending code
 * to the offscreen document, where QuickJS, SubtleCrypto and IndexedDB are available.
 */
async function getPluginStatsViaOffscreen(
  code: string,
  pageOrigin: string,
): Promise<{ config: PluginConfig | null; hash: string; count: number }> {
  try {
    // Ensure offscreen document exists
    await createOffscreenDocument();

    // Send message to offscreen and wait for response
    const response = await chrome.runtime.sendMessage({
      type: 'GET_PLUGIN_STATS_OFFSCREEN',
      code,
      pageOrigin,
    });

    if (response?.success) {
      return {
        config: (response.config as PluginConfig | null) ?? null,
        hash: (response.hash as string) ?? '',
        count: (response.count as number) ?? 0,
      };
    }

    logger.warn('Plugin stats lookup returned no data:', response?.error);
    return { config: null, hash: '', count: 0 };
  } catch (error) {
    logger.error('Failed to get plugin stats via offscreen:', error);
    return { config: null, hash: '', count: 0 };
  }
}

// Periodic cleanup of invalid windows and stale progress routes (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
setInterval(() => {
  logger.debug('Running periodic cleanup...');
  windowManager.cleanupInvalidWindows().catch((error) => {
    logger.error('Error during window cleanup:', error);
  });

  // Evict stale progress routes (TTL-based)
  const now = Date.now();
  for (const [requestId, route] of progressRoutes) {
    if (now - route.createdAt > PROGRESS_ROUTE_TTL_MS) {
      logger.debug('Evicting stale progress route:', requestId);
      progressRoutes.delete(requestId);
    }
  }
}, CLEANUP_INTERVAL_MS);

// Run initial cleanup after 10 seconds
setTimeout(() => {
  windowManager.cleanupInvalidWindows().catch((error) => {
    logger.error('Error during initial cleanup:', error);
  });
}, 10000);

export {};
