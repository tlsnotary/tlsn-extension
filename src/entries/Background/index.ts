import browser from 'webextension-polyfill';

const chrome = global.chrome as any;
// Basic background script setup
console.log('Background script loaded');

// Storage for TLSN window requests
interface StoredRequest {
  method: string;
  url: string;
  timestamp: number;
}

let tlsnWindowId: number | null = null;
let tlsnTabId: number | null = null;
let tlsnRequests: StoredRequest[] = [];

// Handle extension install/update
browser.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
});

browser.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    console.log('details', details.tabId);
    console.log('tlsnTabId', tlsnTabId);
  },
  { urls: ['<all_urls>'] },
  ['requestHeaders'],
);
// Set up webRequest listener to intercept all requests
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    console.log('details', details.tabId);
    console.log('tlsnTabId', tlsnTabId);
    // Only store requests from the TLSN window/tab
    if (tlsnTabId && details.tabId === tlsnTabId) {
      const request: StoredRequest = {
        method: details.method,
        url: details.url,
        timestamp: Date.now(),
      };

      tlsnRequests.push(request);

      console.log('tlsnRequests', tlsnRequests);
      // Send updated requests to the content script
      browser.tabs
        .sendMessage(tlsnTabId, {
          type: 'UPDATE_TLSN_REQUESTS',
          requests: tlsnRequests,
        })
        .catch(() => {
          // Ignore errors if content script not ready
        });
    }
  },
  { urls: ['<all_urls>'] },
  ['requestBody'],
);

// Listen for window removal
browser.windows.onRemoved.addListener((windowId) => {
  if (windowId === tlsnWindowId) {
    console.log('TLSN window closed, clearing stored requests');
    tlsnWindowId = null;
    tlsnTabId = null;
    tlsnRequests = [];
  }
});

// Basic message handler
browser.runtime.onMessage.addListener((request, sender, sendResponse: any) => {
  console.log('Message received in background:', request);

  // Example response
  if (request.type === 'PING') {
    sendResponse({ type: 'PONG' });
  }

  if (request.type === 'TLSN_CONTENT_TO_EXTENSION') {
    console.log('TLSN request received, opening new window');

    // Clear any previous TLSN data
    tlsnWindowId = null;
    tlsnTabId = null;
    tlsnRequests = [];

    // Open a new window with x.com
    browser.windows
      .create({
        url: 'https://x.com',
        type: 'popup',
        width: 900,
        height: 700,
      })
      .then((window) => {
        console.log('New window created:', window.id);

        // Store the window and tab IDs for request tracking
        tlsnWindowId = window.id!;

        if (window.tabs && window.tabs[0]) {
          const tabId = window.tabs[0].id!;
          tlsnTabId = tabId;

          // Wait for the page to load then inject the overlay
          browser.tabs.onUpdated.addListener(
            function listener(updatedTabId, changeInfo) {
              if (updatedTabId === tabId && changeInfo.status === 'complete') {
                // Remove the listener
                browser.tabs.onUpdated.removeListener(listener);

                // Send message to content script to show overlay with initial requests
                browser.tabs
                  .sendMessage(tabId, {
                    type: 'SHOW_TLSN_OVERLAY',
                    requests: tlsnRequests,
                  })
                  .catch((error) => {
                    console.error(
                      'Error sending message to content script:',
                      error,
                    );
                  });
              }
            },
          );
        }
      })
      .catch((error) => {
        console.error('Error creating window:', error);
      });
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

export {};
