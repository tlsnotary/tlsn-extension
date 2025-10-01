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

// Store for intercepted requests
let currentRequests: any[] = [];

// Function to create and show the TLSN overlay
function createTLSNOverlay(initialRequests?: any[]) {
  if (initialRequests) {
    currentRequests = initialRequests;
  }

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
    background-color: rgba(0, 0, 0, 0.85);
    z-index: 999999;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  `;

  // Create message box
  const messageBox = document.createElement('div');
  messageBox.id = 'tlsn-message-box';
  messageBox.style.cssText = `
    background: linear-gradient(135deg, #1e1e2e 0%, #2a2a3e 100%);
    color: white;
    padding: 30px;
    border-radius: 16px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    animation: fadeInScale 0.3s ease-out;
    max-width: 800px;
    width: 90%;
    max-height: 600px;
    display: flex;
    flex-direction: column;
  `;

  // Build request list HTML
  let requestsHTML = '';
  if (currentRequests.length > 0) {
    requestsHTML = currentRequests
      .map(
        (req, index) => `
      <div style="
        background: rgba(255, 255, 255, 0.05);
        padding: 8px 12px;
        margin-bottom: 6px;
        border-radius: 6px;
        display: flex;
        gap: 12px;
        font-size: 13px;
        border-left: 3px solid #667eea;
      ">
        <span style="
          color: #ffd700;
          font-weight: 600;
          min-width: 60px;
        ">${req.method}</span>
        <span style="
          color: #e0e0e0;
          word-break: break-all;
          flex: 1;
        ">${req.url}</span>
      </div>
    `,
      )
      .join('');
  } else {
    requestsHTML = `
      <div style="
        color: rgba(255, 255, 255, 0.5);
        text-align: center;
        padding: 20px;
        font-style: italic;
      ">
        No requests intercepted yet...
      </div>
    `;
  }

  messageBox.innerHTML = `
    <div style="
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    ">
      TLSN Plugin In Progress
    </div>
    <div style="
      font-size: 14px;
      opacity: 0.7;
      margin-bottom: 20px;
    ">
      Intercepting network requests from this window
    </div>
    <div style="
      background: rgba(0, 0, 0, 0.3);
      border-radius: 8px;
      padding: 12px;
      overflow-y: auto;
      max-height: 400px;
      flex: 1;
    ">
      <div style="
        font-size: 12px;
        font-weight: 600;
        margin-bottom: 12px;
        color: #667eea;
        text-transform: uppercase;
        letter-spacing: 1px;
      ">
        Intercepted Requests (${currentRequests.length})
      </div>
      ${requestsHTML}
    </div>
  `;

  // Add CSS animation
  const existingStyle = document.getElementById('tlsn-styles');
  if (!existingStyle) {
    const style = document.createElement('style');
    style.id = 'tlsn-styles';
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

      #tlsn-message-box::-webkit-scrollbar {
        width: 8px;
      }

      #tlsn-message-box::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
      }

      #tlsn-message-box::-webkit-scrollbar-thumb {
        background: rgba(102, 126, 234, 0.5);
        border-radius: 4px;
      }

      #tlsn-message-box::-webkit-scrollbar-thumb:hover {
        background: rgba(102, 126, 234, 0.7);
      }
    `;
    document.head.appendChild(style);
  }

  overlay.appendChild(messageBox);
  document.body.appendChild(overlay);
}

// Function to update the overlay with new requests
function updateTLSNOverlay(requests: any[]) {
  currentRequests = requests;
  const overlay = document.getElementById('tlsn-overlay');
  if (overlay) {
    createTLSNOverlay(requests);
  }
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
    createTLSNOverlay(request.requests || []);
    sendResponse({ success: true });
  }

  if (request.type === 'UPDATE_TLSN_REQUESTS') {
    console.log('updateTLSNOverlay', request.requests);
    updateTLSNOverlay(request.requests || []);
    sendResponse({ success: true });
  }

  if (request.type === 'HIDE_TLSN_OVERLAY') {
    const overlay = document.getElementById('tlsn-overlay');
    if (overlay) {
      overlay.remove();
    }
    currentRequests = [];
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

  // Handle TLSN window.tlsn.open() calls
  if (event.data?.type === 'TLSN_OPEN_WINDOW') {
    console.log(
      '[Content Script] Received TLSN_OPEN_WINDOW request:',
      event.data.payload,
    );

    // Forward to background script with OPEN_WINDOW type
    browser.runtime
      .sendMessage({
        type: 'OPEN_WINDOW',
        url: event.data.payload.url,
        width: event.data.payload.width,
        height: event.data.payload.height,
        showOverlay: event.data.payload.showOverlay,
      })
      .catch((error) => {
        console.error(
          '[Content Script] Failed to send OPEN_WINDOW message:',
          error,
        );
      });
  }

  // Handle code execution requests
  if (event.data?.type === 'TLSN_EXEC_CODE') {
    console.log(
      '[Content Script] Received TLSN_EXEC_CODE request:',
      event.data.payload,
    );

    // Forward to background script
    browser.runtime
      .sendMessage({
        type: 'EXEC_CODE',
        code: event.data.payload.code,
        requestId: event.data.payload.requestId,
      })
      .then((response) => {
        // Send response back to page
        window.postMessage(
          {
            type: 'TLSN_EXEC_CODE_RESPONSE',
            requestId: event.data.payload.requestId,
            success: true,
            result: response.result,
          },
          window.location.origin,
        );
      })
      .catch((error) => {
        console.error('[Content Script] Failed to execute code:', error);
        // Send error back to page
        window.postMessage(
          {
            type: 'TLSN_EXEC_CODE_RESPONSE',
            requestId: event.data.payload.requestId,
            success: false,
            error: error.message || 'Code execution failed',
          },
          window.location.origin,
        );
      });
  }

  // Handle legacy TLSN_CONTENT_SCRIPT_MESSAGE
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
