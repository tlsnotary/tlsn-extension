import browser from 'webextension-polyfill';
import type { DomJson } from '@tlsn/plugin-sdk';
import type { ContentMessage, ExecCodeResponse } from '../../types/messages';
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

  // Preserve drag position across re-renders: if the user dragged the element,
  // its positioning was converted from bottom/right to top/left (bottom becomes 'auto').
  const prev = container.querySelector('[data-tlsn-draggable]') as HTMLElement | null;
  const savedPosition =
    prev && prev.style.bottom === 'auto' ? { top: prev.style.top, left: prev.style.left } : null;

  container.innerHTML = '';
  container.appendChild(createNode(json, windowId));

  if (savedPosition) {
    const el = container.querySelector('[data-tlsn-draggable]') as HTMLElement | null;
    if (el) {
      el.style.top = savedPosition.top;
      el.style.left = savedPosition.left;
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }
  }
}

function makeDraggable(el: HTMLElement) {
  // Use the first child as the drag handle (the header bar)
  const handle = el.firstElementChild as HTMLElement | null;

  if (!handle) return;

  handle.style.cursor = 'grab';

  let offsetX = 0;
  let offsetY = 0;

  const onMouseMove = (e: MouseEvent) => {
    const x = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth - el.offsetWidth));
    const y = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - el.offsetHeight));

    el.style.left = x + 'px';
    el.style.top = y + 'px';
  };

  const onMouseUp = () => {
    handle.style.cursor = 'grab';
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    // Only drag on primary button, ignore clicks on buttons inside the handle
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;

    handle.style.cursor = 'grabbing';

    // Convert bottom/right positioning to top/left
    const rect = el.getBoundingClientRect();

    el.style.top = rect.top + 'px';
    el.style.left = rect.left + 'px';
    el.style.bottom = 'auto';
    el.style.right = 'auto';

    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    e.preventDefault();
  });
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
      (node.style as unknown as Record<string, string>)[key] = value;
    });
  }

  if (json.options.inputType) (node as HTMLInputElement).type = json.options.inputType;
  if (json.options.checked !== undefined) (node as HTMLInputElement).checked = json.options.checked;
  if (json.options.value !== undefined) (node as HTMLInputElement).value = json.options.value;
  if (json.options.placeholder) (node as HTMLInputElement).placeholder = json.options.placeholder;
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

  if (json.options.draggable) {
    node.dataset.tlsnDraggable = '';
    makeDraggable(node);
  }

  return node;
}

// Listen for messages from the extension
browser.runtime.onMessage.addListener((msg: unknown) => {
  const request = msg as ContentMessage;
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

  // Forward progress events from background to page
  if (request.type === 'PROVE_PROGRESS') {
    window.postMessage(
      {
        type: 'TLSN_PROVE_PROGRESS',
        requestId: request.requestId,
        step: request.step,
        progress: request.progress,
        message: request.message,
        source: request.source,
      },
      window.location.origin,
    );
    return; // No response needed
  }

  // Relay: forward outbound MPC bytes from the extension to the page,
  // which sends them over its data channel to the verifier.
  if (request.type === 'RELAY_OUT') {
    window.postMessage(
      { type: 'TLSN_RELAY_OUT', requestId: request.requestId, data: request.data },
      window.location.origin,
    );
    return; // No response needed
  }

  if (request.type === 'GET_PAGE_INFO') {
    return Promise.resolve({
      title: document.title,
      url: window.location.href,
      domain: window.location.hostname,
    });
  }

  if (request.type === 'RENDER_PLUGIN_UI') {
    renderPluginUI(request.json, request.windowId);
    return Promise.resolve({ success: true });
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
  .catch((err) => logger.error('Failed to send CONTENT_SCRIPT_READY:', err));

// Listen for messages from the page
window.addEventListener('message', (event) => {
  // Only accept messages from the same origin
  if (event.origin !== window.location.origin) return;

  // Handle TLSN window.tlsn.open() calls
  if (event.data?.type === 'TLSN_OPEN_WINDOW') {
    logger.debug('[Content Script] Received TLSN_OPEN_WINDOW request:', event.data.payload);

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
        logger.error('[Content Script] Failed to send OPEN_WINDOW message:', error);
      });
  }

  // Relay: inbound MPC bytes from the page's data channel → extension.
  if (event.data?.type === 'TLSN_RELAY_IN') {
    browser.runtime
      .sendMessage({
        type: 'RELAY_IN',
        requestId: event.data.requestId,
        data: event.data.data,
      })
      .catch(() => {
        /* extension context may be gone */
      });
    return;
  }
  if (event.data?.type === 'TLSN_RELAY_CLOSED') {
    browser.runtime
      .sendMessage({ type: 'RELAY_CLOSED', requestId: event.data.requestId })
      .catch(() => {});
    return;
  }

  // Handle code execution requests
  if (event.data?.type === 'TLSN_EXEC_CODE') {
    logger.debug('[Content Script] Received TLSN_EXEC_CODE request:', event.data.payload);

    // Forward to background script
    browser.runtime
      .sendMessage({
        type: 'EXEC_CODE',
        code: event.data.payload.code,
        requestId: event.data.payload.requestId,
        sessionData: event.data.payload.sessionData,
        pageOrigin: window.location.origin,
      })
      .then((msg) => {
        const response = msg as ExecCodeResponse;
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
