import browser from 'webextension-polyfill';
import { DomJson } from '@tlsn/plugin-sdk/src/types';
import { logger, LogLevel } from '@tlsn/common';

// Initialize logger at DEBUG level for content scripts (no IndexedDB access)
logger.init(LogLevel.DEBUG);
logger.debug('Content script loaded on:', window.location.href);

// Inject a script into the page if needed
function injectScript() {
  const script = document.createElement('script');
  script.src = browser.runtime.getURL('content.bundle.js');
  script.type = 'text/javascript';
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => script.remove();
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

const ALLOWED_ELEMENT_TYPES = new Set([
  'div',
  'span',
  'p',
  'button',
  'input',
  'label',
  'a',
  'img',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'table',
  'tr',
  'td',
  'th',
  'thead',
  'tbody',
  'form',
  'select',
  'option',
  'textarea',
  'pre',
  'code',
  'strong',
  'em',
  'br',
  'hr',
]);

function createNode(json: DomJson, windowId: number): HTMLElement | Text {
  if (typeof json === 'string') {
    const node = document.createTextNode(json);
    return node;
  }

  if (!ALLOWED_ELEMENT_TYPES.has(json.type)) {
    logger.warn(`[Content] Blocked disallowed element type: ${json.type}`);
    return document.createTextNode('');
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

  if (json.options.inputType)
    (node as HTMLInputElement).type = json.options.inputType;
  if (json.options.checked !== undefined)
    (node as HTMLInputElement).checked = json.options.checked;
  if (json.options.value !== undefined)
    (node as HTMLInputElement).value = json.options.value;
  if (json.options.placeholder)
    (node as HTMLInputElement).placeholder = json.options.placeholder;
  if (json.options.disabled !== undefined)
    (node as HTMLInputElement).disabled = json.options.disabled;

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
  logger.debug('Content script received message:', request);

  // Forward offscreen logs to page
  if (request.type === 'OFFSCREEN_LOG') {
    window.postMessage(
      {
        type: 'TLSN_OFFSCREEN_LOG',
        level: request.level,
        message: request.message,
      },
      window.location.origin,
    );
    return; // No response needed
  }

  if (request.type === 'GET_PAGE_INFO') {
    // Example: Get page information
    sendResponse({
      title: document.title,
      url: window.location.href,
      domain: window.location.hostname,
    });
    return true; // Response sent synchronously but return true for consistency
  }

  if (request.type === 'RENDER_PLUGIN_UI') {
    renderPluginUI(request.json, request.windowId);
    sendResponse({ success: true });
    return true; // Response sent
  }

  // Unknown message type - no response needed
  return;
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
    logger.debug(
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
        logger.error(
          '[Content Script] Failed to send OPEN_WINDOW message:',
          error,
        );
      });
  }

  // Handle code execution requests
  if (event.data?.type === 'TLSN_EXEC_CODE') {
    logger.debug(
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
        logger.debug('[Content Script] EXEC_CODE response:', response);

        // Check if background returned success or error
        if (response && response.success === false) {
          // Background returned an error (e.g., user rejected plugin)
          window.postMessage(
            {
              type: 'TLSN_EXEC_CODE_RESPONSE',
              requestId: event.data.payload.requestId,
              success: false,
              error: response.error || 'Code execution failed',
            },
            window.location.origin,
          );
        } else {
          // Success - send result back to page
          window.postMessage(
            {
              type: 'TLSN_EXEC_CODE_RESPONSE',
              requestId: event.data.payload.requestId,
              success: true,
              result: response?.result,
            },
            window.location.origin,
          );
        }
      })
      .catch((error) => {
        logger.error('[Content Script] Failed to execute code:', error);
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
