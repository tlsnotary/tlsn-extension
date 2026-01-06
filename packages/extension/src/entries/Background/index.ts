import browser from 'webextension-polyfill';
import { WindowManager } from '../../background/WindowManager';
import { confirmationManager } from '../../background/ConfirmationManager';
import { permissionManager } from '../../background/PermissionManager';
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

// Temporary storage for granted origins pending window creation
// When a plugin is executed, we store the granted origins here
// Then when the plugin opens a window, we associate these origins with that window
let pendingGrantedOrigins: string[] = [];

// =============================================================================
// DYNAMIC WEBREQUEST LISTENER MANAGEMENT
// =============================================================================
// Track active dynamic listeners by origin pattern
// We need to store handler references to remove them later
type ListenerHandlers = {
  onBeforeRequest: (
    details: browser.WebRequest.OnBeforeRequestDetailsType,
  ) => void;
  onBeforeSendHeaders: (
    details: browser.WebRequest.OnBeforeSendHeadersDetailsType,
  ) => void;
};

const dynamicListeners = new Map<string, ListenerHandlers>();

/**
 * Handler for onBeforeRequest - intercepts request body
 */
function createOnBeforeRequestHandler() {
  return (details: browser.WebRequest.OnBeforeRequestDetailsType) => {
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

      logger.debug(`[webRequest] Intercepted request: ${details.url}`);
      windowManager.addRequest(managedWindow.id, request);
    }
  };
}

/**
 * Handler for onBeforeSendHeaders - intercepts request headers
 */
function createOnBeforeSendHeadersHandler() {
  return (details: browser.WebRequest.OnBeforeSendHeadersDetailsType) => {
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

      logger.debug(`[webRequest] Intercepted headers for: ${details.url}`);
      windowManager.addHeader(managedWindow.id, header);
    }
  };
}

/**
 * Register dynamic webRequest listeners for specific origin patterns.
 * Must be called AFTER permissions are granted for those origins.
 */
function registerDynamicListeners(origins: string[]): void {
  logger.info(`[webRequest] registerDynamicListeners called with:`, origins);

  for (const origin of origins) {
    // Skip if already registered
    if (dynamicListeners.has(origin)) {
      logger.debug(`[webRequest] Listener already registered for: ${origin}`);
      continue;
    }

    logger.info(`[webRequest] Registering listener for: "${origin}"`);

    const onBeforeRequestHandler = createOnBeforeRequestHandler();
    const onBeforeSendHeadersHandler = createOnBeforeSendHeadersHandler();

    try {
      browser.webRequest.onBeforeRequest.addListener(
        onBeforeRequestHandler,
        { urls: [origin] },
        ['requestBody', 'extraHeaders'],
      );

      browser.webRequest.onBeforeSendHeaders.addListener(
        onBeforeSendHeadersHandler,
        { urls: [origin] },
        ['requestHeaders', 'extraHeaders'],
      );

      dynamicListeners.set(origin, {
        onBeforeRequest: onBeforeRequestHandler,
        onBeforeSendHeaders: onBeforeSendHeadersHandler,
      });

      logger.info(
        `[webRequest] Successfully registered listener for: ${origin}`,
      );
    } catch (error) {
      logger.error(
        `[webRequest] Failed to register listener for ${origin}:`,
        error,
      );
    }
  }
}

/**
 * Unregister dynamic webRequest listeners for specific origin patterns.
 * Should be called when permissions are revoked.
 */
function unregisterDynamicListeners(origins: string[]): void {
  logger.info(`[webRequest] unregisterDynamicListeners called with:`, origins);
  logger.info(
    `[webRequest] Current dynamicListeners Map keys:`,
    Array.from(dynamicListeners.keys()),
  );

  for (const origin of origins) {
    logger.info(`[webRequest] Looking for listener with key: "${origin}"`);
    const handlers = dynamicListeners.get(origin);
    if (!handlers) {
      logger.warn(
        `[webRequest] No listener found for: "${origin}" - available keys: ${Array.from(dynamicListeners.keys()).join(', ')}`,
      );
      continue;
    }

    logger.info(`[webRequest] Found handlers for: ${origin}, removing...`);

    try {
      browser.webRequest.onBeforeRequest.removeListener(
        handlers.onBeforeRequest,
      );
      logger.info(
        `[webRequest] Removed onBeforeRequest listener for: ${origin}`,
      );

      browser.webRequest.onBeforeSendHeaders.removeListener(
        handlers.onBeforeSendHeaders,
      );
      logger.info(
        `[webRequest] Removed onBeforeSendHeaders listener for: ${origin}`,
      );

      dynamicListeners.delete(origin);
      logger.info(
        `[webRequest] Successfully unregistered all listeners for: ${origin}`,
      );
    } catch (error) {
      logger.error(
        `[webRequest] Failed to unregister listener for ${origin}:`,
        error,
      );
    }
  }

  logger.info(
    `[webRequest] After unregister, remaining keys:`,
    Array.from(dynamicListeners.keys()),
  );
}

/**
 * Unregister all dynamic webRequest listeners.
 */
function unregisterAllDynamicListeners(): void {
  const origins = Array.from(dynamicListeners.keys());
  unregisterDynamicListeners(origins);
}

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

// NOTE: Static webRequest listeners removed - using dynamic listeners instead
// Dynamic listeners are registered when plugin permissions are granted
// and unregistered when permissions are revoked

// Listen for window removal - clean up permissions and listeners
browser.windows.onRemoved.addListener(async (windowId) => {
  const managedWindow = windowManager.getWindow(windowId);
  if (managedWindow) {
    logger.debug(
      `Managed window closed: ${managedWindow.uuid} (ID: ${windowId})`,
    );

    // Get granted origins before closing the window
    const grantedOrigins = managedWindow.grantedOrigins || [];

    logger.info(
      `[Permission Cleanup] Window ${windowId} grantedOrigins:`,
      grantedOrigins,
    );
    logger.info(
      `[Permission Cleanup] Current dynamicListeners keys:`,
      Array.from(dynamicListeners.keys()),
    );

    // Clean up permissions and listeners for this window
    if (grantedOrigins.length > 0) {
      logger.info(
        `[Permission Cleanup] Window ${windowId} closed, cleaning up ${grantedOrigins.length} origins:`,
        grantedOrigins,
      );

      // Step 1: Unregister dynamic webRequest listeners FIRST
      logger.info(
        '[Permission Cleanup] Step 1: Unregistering dynamic listeners...',
      );
      unregisterDynamicListeners(grantedOrigins);
      logger.info(
        '[Permission Cleanup] Step 1 complete. Remaining dynamicListeners:',
        Array.from(dynamicListeners.keys()),
      );

      // Step 2: Revoke host permissions AFTER listeners are removed
      logger.info('[Permission Cleanup] Step 2: Revoking host permissions...');
      try {
        const removed =
          await permissionManager.removePermissions(grantedOrigins);
        logger.info(
          `[Permission Cleanup] Step 2 complete. Permissions removed: ${removed}`,
        );
      } catch (error) {
        logger.error(
          `[Permission Cleanup] Step 2 FAILED for window ${windowId}:`,
          error,
        );
      }
    } else {
      logger.info(
        `[Permission Cleanup] Window ${windowId} has no granted origins to clean up`,
      );
    }

    await windowManager.closeWindow(windowId);
  }
});

// Listen for tab updates to show overlay when tab is ready
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act when tab becomes complete
  if (changeInfo.status !== 'complete') {
    return;
  }

  // Check if this tab belongs to a managed window for overlay handling
  const managedWindow = windowManager.getWindowByTabId(tabId);
  if (managedWindow) {
    // If overlay should be shown but isn't visible yet, show it now
    if (managedWindow.showOverlayWhenReady && !managedWindow.overlayVisible) {
      logger.debug(
        `Tab ${tabId} complete, showing overlay for window ${managedWindow.id}`,
      );
      await windowManager.showOverlay(managedWindow.id);
    }
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
      request.grantedOrigins || [],
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

        // Step 2: Request user confirmation (popup also handles permission request)
        const confirmRequestId = `confirm_${Date.now()}_${Math.random()}`;
        let confirmResult: { allowed: boolean; grantedOrigins: string[] };

        try {
          confirmResult = await confirmationManager.requestConfirmation(
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
        if (!confirmResult.allowed) {
          logger.info('User rejected plugin execution or denied permissions');
          sendResponse({
            success: false,
            error: 'User rejected plugin execution',
          });
          return;
        }

        // Step 4: User allowed and permissions granted - proceed with execution
        logger.info(
          'User allowed plugin execution, granted origins:',
          confirmResult.grantedOrigins,
        );

        // Step 4.1: Register dynamic webRequest listeners for granted origins
        // This must happen AFTER permissions are granted
        if (confirmResult.grantedOrigins.length > 0) {
          logger.info(
            '[EXEC_CODE] Registering dynamic webRequest listeners for:',
            confirmResult.grantedOrigins,
          );
          registerDynamicListeners(confirmResult.grantedOrigins);

          // Store granted origins for association with the window that will be opened
          // The OPEN_WINDOW handler will associate these with the new window
          pendingGrantedOrigins = confirmResult.grantedOrigins;
          logger.info(
            '[EXEC_CODE] Stored pendingGrantedOrigins:',
            pendingGrantedOrigins,
          );
        }

        // Step 4.2: Execute plugin
        // Note: Cleanup happens when the window is closed (windows.onRemoved listener)
        // NOT in a finally block here, because EXEC_CODE_OFFSCREEN returns immediately
        // when the plugin starts, not when it finishes
        await createOffscreenDocument();

        const response = await chrome.runtime.sendMessage({
          type: 'EXEC_CODE_OFFSCREEN',
          code: request.code,
          requestId: request.requestId,
        });
        logger.debug('EXEC_CODE_OFFSCREEN response:', response);
        sendResponse(response);
      } catch (error) {
        logger.error('Error executing code:', error);

        // Clean up listeners and pending origins if execution failed before window opened
        if (pendingGrantedOrigins.length > 0) {
          logger.info(
            '[EXEC_CODE] Error occurred - cleaning up pending origins:',
            pendingGrantedOrigins,
          );
          unregisterDynamicListeners(pendingGrantedOrigins);
          await permissionManager.removePermissions(pendingGrantedOrigins);
          pendingGrantedOrigins = [];
        }

        sendResponse({
          success: false,
          error:
            error instanceof Error ? error.message : 'Code execution failed',
        });
      }
    })();

    return true; // Keep message channel open for async response
  }

  // Handle permission requests from offscreen/content scripts
  if (request.type === 'REQUEST_HOST_PERMISSIONS') {
    logger.debug('REQUEST_HOST_PERMISSIONS received:', request.origins);

    (async () => {
      try {
        const granted = await permissionManager.requestPermissions(
          request.origins,
        );
        sendResponse({ success: true, granted });
      } catch (error) {
        logger.error('Failed to request permissions:', error);
        sendResponse({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Permission request failed',
        });
      }
    })();

    return true;
  }

  if (request.type === 'REMOVE_HOST_PERMISSIONS') {
    logger.debug('REMOVE_HOST_PERMISSIONS received:', request.origins);

    (async () => {
      try {
        const removed = await permissionManager.removePermissions(
          request.origins,
        );
        sendResponse({ success: true, removed });
      } catch (error) {
        logger.error('Failed to remove permissions:', error);
        sendResponse({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Permission removal failed',
        });
      }
    })();

    return true;
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

          // Associate pending granted origins with this window
          // These will be cleaned up when the window is closed
          logger.info(
            `[OPEN_WINDOW] pendingGrantedOrigins at association time:`,
            pendingGrantedOrigins,
          );
          if (pendingGrantedOrigins.length > 0) {
            logger.info(
              `[OPEN_WINDOW] Associating ${pendingGrantedOrigins.length} origins with window ${windowId}:`,
              pendingGrantedOrigins,
            );
            windowManager.setGrantedOrigins(windowId, pendingGrantedOrigins);
            logger.info(
              `[OPEN_WINDOW] Successfully associated origins. Window ${windowId} now has grantedOrigins:`,
              windowManager.getGrantedOrigins(windowId),
            );
            // Clear pending origins now that they're associated
            pendingGrantedOrigins = [];
          } else {
            logger.warn(
              `[OPEN_WINDOW] No pending origins to associate with window ${windowId}`,
            );
          }

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
