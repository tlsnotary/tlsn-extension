import browser from 'webextension-polyfill';
import { type DomJson } from '../../offscreen/SessionManager';

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
    background-color: rgba(0, 0, 0, 0.85);
    z-index: 999999;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
  `;

  document.body.appendChild(overlay);
}

function renderPluginUI(json: DomJson, windowId: number) {
  let container = document.getElementById('tlsn-plugin-container');

  if (!container) {
    const el = document.createElement('div');
    el.id = 'tlsn-plugin-container';
    document.body.appendChild(el);
    container = el;
  }

  container.innerHTML = '';
  container.appendChild(createNode(json, windowId));
}

function createNode(json: DomJson, windowId: number): HTMLElement | Text {
  if (typeof json === 'string') {
    const node = document.createTextNode(json);
    return node;
  }

  const node = document.createElement(json.type);

  if (json.options.className) {
    node.className = json.options.className;
  }

  if (json.options.id) {
    node.id = json.options.id;
  }

  if (json.options.style) {
    Object.entries(json.options.style).forEach(([key, value]) => {
      node.style[key as any] = value;
    });
  }

  if (json.options.onclick) {
    node.addEventListener('click', () => {
      browser.runtime.sendMessage({
        type: 'PLUGIN_UI_CLICK',
        onclick: json.options.onclick,
        windowId,
      });
    });
  }

  json.children.forEach((child) => {
    node.appendChild(createNode(child, windowId));
  });

  return node;
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

  if (request.type === 'RENDER_PLUGIN_UI') {
    renderPluginUI(request.json, request.windowId);
    sendResponse({ success: true });
  }

  // if (request.type === 'SHOW_TLSN_OVERLAY') {
  //   createTLSNOverlay();
  //   sendResponse({ success: true });
  // }

  // if (request.type === 'UPDATE_TLSN_REQUESTS') {
  //   console.log('updateTLSNOverlay', request.requests);
  //   updateTLSNOverlay(request.requests || []);
  //   sendResponse({ success: true });
  // }

  // if (request.type === 'HIDE_TLSN_OVERLAY') {
  //   const overlay = document.getElementById('tlsn-overlay');
  //   if (overlay) {
  //     overlay.remove();
  //   }
  //   sendResponse({ success: true });
  // }

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
        console.log('[Content Script] EXEC_CODE response:', response);
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
