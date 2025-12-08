import browser from 'webextension-polyfill';
import { WindowManager } from '../../background/WindowManager';
import { confirmationManager } from '../../background/ConfirmationManager';
import { extractConfig, type PluginConfig } from '@tlsn/plugin-sdk';
import type {
  InterceptedRequest,
  InterceptedRequestHeader,
} from '../../types/window-manager';
import { validateUrl } from '../../utils/url-validator';

const chrome = global.chrome as any;
// Basic background script setup
console.log('Background script loaded');

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
  console.log('Extension installed/updated:', details.reason);
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
    console.log(
      `[Background] Managed window closed: ${managedWindow.uuid} (ID: ${windowId})`,
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
    console.log(
      `[Background] Tab ${tabId} complete, showing overlay for window ${managedWindow.id}`,
    );
    await windowManager.showOverlay(managedWindow.id);
  }
});

// Basic message handler
browser.runtime.onMessage.addListener((request, sender, sendResponse: any) => {
  console.log('[Background] Message received:', request.type);

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
    console.log(
      '[Background] RENDER_PLUGIN_UI request received:',
      request.json,
      request.windowId,
    );
    windowManager.showPluginUI(request.windowId, request.json);
    return true;
  }

  // Handle plugin confirmation responses from popup
  if (request.type === 'PLUGIN_CONFIRM_RESPONSE') {
    console.log('[Background] PLUGIN_CONFIRM_RESPONSE received:', request);
    confirmationManager.handleConfirmationResponse(
      request.requestId,
      request.allowed,
    );
    return true;
  }

  // Handle code execution requests
  if (request.type === 'EXEC_CODE') {
    console.log('[Background] EXEC_CODE request received');

    (async () => {
      try {
        // Step 1: Extract plugin config for confirmation
        let pluginConfig: PluginConfig | null = null;
        try {
          pluginConfig = await extractConfig(request.code);
          console.log('[Background] Extracted plugin config:', pluginConfig);
        } catch (extractError) {
          console.warn(
            '[Background] Failed to extract plugin config:',
            extractError,
          );
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
          console.error('[Background] Confirmation error:', confirmError);
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
          console.log('[Background] User rejected plugin execution');
          sendResponse({
            success: false,
            error: 'User rejected plugin execution',
          });
          return;
        }

        // Step 4: User allowed - proceed with execution
        console.log(
          '[Background] User allowed plugin execution, proceeding...',
        );

        // Ensure offscreen document exists
        await createOffscreenDocument();

        // Forward to offscreen document
        const response = await chrome.runtime.sendMessage({
          type: 'EXEC_CODE_OFFSCREEN',
          code: request.code,
          requestId: request.requestId,
        });
        console.log('[Background] EXEC_CODE_OFFSCREEN response:', response);
        sendResponse(response);
      } catch (error) {
        console.error('[Background] Error executing code:', error);
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
    console.log(
      '[Background] CLOSE_WINDOW request received:',
      request.windowId,
    );

    if (!request.windowId) {
      console.error('[Background] No windowId provided');
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
        console.log(`[Background] Window ${request.windowId} closed`);
        sendResponse({
          type: 'WINDOW_CLOSED',
          payload: {
            windowId: request.windowId,
          },
        });
      })
      .catch((error) => {
        console.error('[Background] Error closing window:', error);
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
    console.log('[Background] OPEN_WINDOW request received:', request.url);

    // Validate URL using comprehensive validator
    const urlValidation = validateUrl(request.url);
    if (!urlValidation.valid) {
      console.error('[Background] URL validation failed:', urlValidation.error);
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

        console.log(`[Background] Window created: ${windowId}, Tab: ${tabId}`);

        try {
          // Register window with WindowManager
          const managedWindow = await windowManager.registerWindow({
            id: windowId,
            tabId: tabId,
            url: request.url,
            showOverlay: request.showOverlay !== false, // Default to true
          });

          console.log(`[Background] Window registered: ${managedWindow.uuid}`);

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
          console.error(
            '[Background] Window registration failed:',
            registrationError,
          );
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
        console.error('[Background] Error creating window:', error);
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
    console.log('Offscreen API not available');
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
createOffscreenDocument().catch(console.error);

// Periodic cleanup of invalid windows (every 5 minutes)
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
setInterval(() => {
  console.log('[Background] Running periodic window cleanup...');
  windowManager.cleanupInvalidWindows().catch((error) => {
    console.error('[Background] Error during cleanup:', error);
  });
}, CLEANUP_INTERVAL_MS);

// Run initial cleanup after 10 seconds
setTimeout(() => {
  windowManager.cleanupInvalidWindows().catch((error) => {
    console.error('[Background] Error during initial cleanup:', error);
  });
}, 10000);

export {};
