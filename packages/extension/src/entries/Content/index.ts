import browser from 'webextension-polyfill';
import type { ContentMessage, ExecCodeResponse } from '@tlsn/host-extension/types';
import { renderPluginUI } from '@tlsn/host-extension/content';
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

  if (request.type === 'GET_PAGE_INFO') {
    return Promise.resolve({
      title: document.title,
      url: window.location.href,
      domain: window.location.hostname,
    });
  }

  if (request.type === 'RENDER_PLUGIN_UI') {
    renderPluginUI(request.json, request.windowId, {
      onPluginAction: (onclick, windowId) => {
        browser.runtime.sendMessage({ type: 'PLUGIN_UI_CLICK', onclick, windowId });
      },
    });
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
