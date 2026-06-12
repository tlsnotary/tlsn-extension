/**
 * RequestInterceptor — registers `webRequest.onBeforeRequest` and
 * `webRequest.onBeforeSendHeaders` listeners that route every captured
 * request/header through the supplied `WindowManager`.
 *
 * The handlers exit immediately for any tab the WindowManager doesn't track,
 * which is what scopes the broad `<all_urls>` permission to the windows the
 * plugin explicitly opened.
 */

import browser from 'webextension-polyfill';
import { logger } from '@tlsn/common';
import type { WindowManager } from './WindowManager';
import type { InterceptedRequest, InterceptedRequestHeader } from '../types/index';

export interface ExtensionRequestInterceptorOptions {
  windowManager: WindowManager;
  /** URL match patterns to listen on. Default `<all_urls>`. */
  urls?: string[];
}

export function installRequestInterceptor(opts: ExtensionRequestInterceptorOptions): void {
  const { windowManager } = opts;
  const urls = opts.urls ?? ['<all_urls>'];

  browser.webRequest.onBeforeRequest.addListener(
    (details) => {
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
        windowManager.addRequest(managedWindow.id, request);
      }
    },
    { urls },
    ['requestBody', 'extraHeaders'],
  );

  browser.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
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
        windowManager.addHeader(managedWindow.id, header);
      }
    },
    { urls },
    ['requestHeaders', 'extraHeaders'],
  );

  logger.debug('[host-extension] webRequest interceptor installed', { urls });
}
