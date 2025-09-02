import browser from 'webextension-polyfill';

const chrome = global.chrome as any;
// Basic background script setup
console.log('Background script loaded');

// Handle extension install/update
browser.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed/updated:', details.reason);
});

// Basic message handler
browser.runtime.onMessage.addListener((request, sender, sendResponse: any) => {
  console.log('Message received in background:', request);

  // Example response
  if (request.type === 'PING') {
    sendResponse({ type: 'PONG' });
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
