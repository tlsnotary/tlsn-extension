import browser from 'webextension-polyfill';
import { WindowManager } from '../../background/WindowManager';
import type { InterceptedRequest } from '../../types/window-manager';

const chrome = global.chrome as any;
// Basic background script setup
console.log('Background script loaded');

// Initialize WindowManager for multi-window support
const windowManager = new WindowManager();

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
      };

      console.log(
        `[Background] Request intercepted for window ${managedWindow.id}:`,
        details.method,
        details.url,
      );

      // Add request to window's request history
      windowManager.addRequest(managedWindow.id, request);
    }
  },
  { urls: ['<all_urls>'] },
  ['requestBody'],
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

  // Example response
  if (request.type === 'PING') {
    sendResponse({ type: 'PONG' });
    return true;
  }

  // Backward compatibility: Handle legacy TLSN_CONTENT_TO_EXTENSION message (Task 3.5)
  // This maintains compatibility with existing code that uses the old API
  if (request.type === 'TLSN_CONTENT_TO_EXTENSION') {
    console.log(
      '[Background] Legacy TLSN_CONTENT_TO_EXTENSION received, opening x.com window',
    );

    // Open x.com window using the new WindowManager system
    browser.windows
      .create({
        url: 'https://x.com',
        type: 'popup',
        width: 900,
        height: 700,
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

        console.log(
          `[Background] Legacy window created: ${windowId}, Tab: ${tabId}`,
        );

        // Register with WindowManager (overlay will be shown when tab loads)
        await windowManager.registerWindow({
          id: windowId,
          tabId: tabId,
          url: 'https://x.com',
          showOverlay: true,
        });
      })
      .catch((error) => {
        console.error('[Background] Error creating legacy window:', error);
      });

    return true;
  }

  // Handle OPEN_WINDOW requests from content scripts
  if (request.type === 'OPEN_WINDOW') {
    console.log('[Background] OPEN_WINDOW request received:', request.url);

    // Validate URL protocol (only allow http and https)
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(request.url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        console.error(
          `[Background] Invalid protocol: ${parsedUrl.protocol}. Only http and https are allowed.`,
        );
        sendResponse({
          type: 'WINDOW_ERROR',
          payload: {
            error: 'Invalid protocol',
            details: `Only HTTP and HTTPS URLs are supported. Received: ${parsedUrl.protocol}`,
          },
        });
        return true;
      }
    } catch (error) {
      console.error('[Background] Invalid URL:', request.url);
      sendResponse({
        type: 'WINDOW_ERROR',
        payload: {
          error: 'Invalid URL',
          details: String(error),
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
