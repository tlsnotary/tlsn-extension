import browser from 'webextension-polyfill';

console.log('Content script loaded on:', window.location.href);

// Inject a script into the page if needed
function injectScript() {
  const script = document.createElement('script');
  script.src = browser.runtime.getURL('content.bundle.js');
  script.type = 'text/javascript';
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
}

// Function to create and show the TLSN overlay
function createTLSNOverlay() {
  // Remove any existing overlay
  const existingOverlay = document.getElementById('tlsn-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'tlsn-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    z-index: 999999;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  `;

  // Create message box
  const messageBox = document.createElement('div');
  messageBox.style.cssText = `
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 40px 60px;
    border-radius: 16px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
    text-align: center;
    animation: fadeInScale 0.3s ease-out;
  `;

  messageBox.innerHTML = `
    <div style="font-size: 28px; font-weight: 700; margin-bottom: 12px;">
      TLSN Plugin In Progress
    </div>
    <div style="font-size: 16px; opacity: 0.9;">
      Processing secure notarization...
    </div>
  `;

  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes fadeInScale {
      0% {
        opacity: 0;
        transform: scale(0.9);
      }
      100% {
        opacity: 1;
        transform: scale(1);
      }
    }
  `;
  document.head.appendChild(style);

  overlay.appendChild(messageBox);
  document.body.appendChild(overlay);
}

// Listen for messages from the extension
browser.runtime.onMessage.addListener((request, sender, sendResponse: any) => {
  console.log('Content script received message:', request);

  if (request.type === 'GET_PAGE_INFO') {
    // Example: Get page information
    sendResponse({
      title: document.title,
      url: window.location.href,
      domain: window.location.hostname,
    });
  }

  if (request.type === 'SHOW_TLSN_OVERLAY') {
    createTLSNOverlay();
    sendResponse({ success: true });
  }

  if (request.type === 'HIDE_TLSN_OVERLAY') {
    const overlay = document.getElementById('tlsn-overlay');
    if (overlay) {
      overlay.remove();
    }
    sendResponse({ success: true });
  }

  return true; // Keep the message channel open
});

// Send a message to background script when ready
browser.runtime
  .sendMessage({
    type: 'CONTENT_SCRIPT_READY',
    url: window.location.href,
  })
  .catch(console.error);

// Listen for messages from the page
window.addEventListener('message', (event) => {
  // Only accept messages from the same origin
  if (event.origin !== window.location.origin) return;

  if (event.data?.type === 'TLSN_CONTENT_SCRIPT_MESSAGE') {
    // Forward to content script/extension
    browser.runtime.sendMessage({
      type: 'TLSN_CONTENT_TO_EXTENSION',
      payload: event.data.payload,
    });
  }
});

// Inject script if document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectScript);
} else {
  injectScript();
}

export {};
