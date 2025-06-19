import { BackgroundActiontype } from './rpc';
import mutex from './mutex';
import browser from 'webextension-polyfill';
import { addRequest } from '../../reducers/requests';
import { urlify } from '../../utils/misc';
import { getRequestLog, upsertRequestLog } from './db';

export const onSendHeaders = (
  details: browser.WebRequest.OnSendHeadersDetailsType,
) => {
  return mutex.runExclusive(async () => {
    const { method, tabId, requestId } = details;

    if (method !== 'OPTIONS') {
      const { origin, pathname } = urlify(details.url) || {};

      const link = [origin, pathname].join('');

      if (link && details.requestHeaders) {
        upsertRequestLog({
          method: details.method as 'GET' | 'POST',
          type: details.type,
          url: details.url,
          initiator: details.initiator || null,
          requestHeaders: details.requestHeaders || [],
          tabId: tabId,
          requestId: requestId,
          updatedAt: Date.now(),
        });
      }
    }
  });
};

export const onBeforeRequest = (
  details: browser.WebRequest.OnBeforeRequestDetailsType,
) => {
  mutex.runExclusive(async () => {
    const { method, requestBody, tabId, requestId } = details;

    if (method === 'OPTIONS') return;

    if (requestBody) {
      if (requestBody.raw && requestBody.raw[0]?.bytes) {
        try {
          await upsertRequestLog({
            requestBody: Buffer.from(requestBody.raw[0].bytes).toString(
              'utf-8',
            ),
            requestId: requestId,
            tabId: tabId,
            updatedAt: Date.now(),
          });
        } catch (e) {
          console.error(e);
        }
      } else if (requestBody.formData) {
        await upsertRequestLog({
          formData: Object.fromEntries(
            Object.entries(requestBody.formData).map(([key, value]) => [
              key,
              Array.isArray(value) ? value : [value],
            ]),
          ),
          requestId: requestId,
          tabId: tabId,
          updatedAt: Date.now(),
        });
      }
    }
  });
};

export const onResponseStarted = (
  details: browser.WebRequest.OnResponseStartedDetailsType,
) => {
  mutex.runExclusive(async () => {
    const { method, responseHeaders, tabId, requestId } = details;

    if (method === 'OPTIONS') return;

    await upsertRequestLog({
      method: details.method,
      type: details.type,
      url: details.url,
      initiator: details.initiator || null,
      tabId: tabId,
      requestId: requestId,
      responseHeaders,
      updatedAt: Date.now(),
    });

    const newLog = await getRequestLog(requestId);

    if (!newLog) {
      console.error('Request log not found', requestId);
      return;
    }

    chrome.runtime.sendMessage({
      type: BackgroundActiontype.push_action,
      data: {
        tabId: details.tabId,
        request: newLog,
      },
      action: addRequest(newLog),
    });
  });
};
