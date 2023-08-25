import { BackgroundActiontype, RequestLog } from './actionTypes';
import { Mutex } from 'async-mutex';
import NodeCache from 'node-cache';
import { addRequest } from '../../reducers/requests';

let RequestsLogs: {
  [tabId: string]: NodeCache;
} = {};

const mutex = new Mutex();
const cache = new NodeCache({
  stdTTL: 60 * 5, // default 5m TTL
  maxKeys: 1000000,
});

(chrome as any).offscreen.createDocument({
  url: 'offscreen.html',
  reasons: ['WORKERS'],
  justification: 'workers for multithreading',
});

chrome.tabs.onActivated.addListener((tabs) => {
  RequestsLogs[tabs.tabId] = RequestsLogs[tabs.tabId] || new NodeCache({
    stdTTL: 60 * 5, // default 5m TTL
    maxKeys: 1000000,
  });
});

chrome.tabs.onRemoved.addListener((tab) => {
  delete RequestsLogs[tab];
});

(async () => {
  chrome.webRequest.onSendHeaders.addListener(
    (details) => {
      mutex.runExclusive(async () => {
        const { method, tabId, requestId } = details;

        if (method !== 'OPTIONS') {
          RequestsLogs[tabId] = RequestsLogs[tabId] || new NodeCache({
            stdTTL: 60 * 5, // default 5m TTL
            maxKeys: 1000000,
          });
          const existing = RequestsLogs[tabId].get<RequestLog>(requestId);
          RequestsLogs[tabId].set(requestId, {
            ...existing,
            method: details.method as 'GET' | 'POST',
            type: details.type,
            url: details.url,
            initiator: details.initiator || null,
            requestHeaders: details.requestHeaders || [],
            tabId: tabId,
            requestId: requestId,
          });
        }
      });
    },
    {
      urls: ['<all_urls>'],
    },
    ['requestHeaders'],
  );

  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      mutex.runExclusive(async () => {
        const { method, requestBody, tabId, requestId } = details;
        
        if (method === 'OPTIONS') return;

        if (requestBody) {
          RequestsLogs[tabId] = RequestsLogs[tabId] || new NodeCache({
            stdTTL: 60 * 5, // default 5m TTL
            maxKeys: 1000000,
          });

          const existing = RequestsLogs[tabId].get<RequestLog>(requestId);

          if (requestBody.raw && requestBody.raw[0]?.bytes) {
            try {
              RequestsLogs[details.tabId].set(requestId, {
                ...existing,
                requestBody: Buffer.from(requestBody.raw[0].bytes).toString('utf-8'),
              });
            } catch (e) {
              console.error(e);
            }

          } else if (requestBody.formData) {
            RequestsLogs[details.tabId].set(requestId, {
              ...existing,
              formData: requestBody.formData,
            });
          }
        }
      });
    },
    {
      urls: ['<all_urls>'],
    },
    ['requestBody'],
  );

  chrome.webRequest.onResponseStarted.addListener(
    (details) => {
      mutex.runExclusive(async () => {
        const { method, responseHeaders, tabId, requestId, } = details;
        
        if (method === 'OPTIONS') return;

        RequestsLogs[tabId] = RequestsLogs[tabId] || new NodeCache({
          stdTTL: 60 * 5, // default 5m TTL
          maxKeys: 1000000,
        });

        const existing = RequestsLogs[tabId].get<RequestLog>(requestId);
        const newLog: RequestLog = {
          requestHeaders: [],
          ...existing,
          method: details.method,
          type: details.type,
          url: details.url,
          initiator: details.initiator || null,
          tabId: tabId,
          requestId: requestId,
          responseHeaders,
        };

        RequestsLogs[tabId].set(requestId, newLog);

        await chrome.runtime.sendMessage({
          type: BackgroundActiontype.push_action,
          data: {
            tabId: details.tabId,
            request: newLog,
          },
          action: addRequest(newLog),
        });
      });
    },
    {
      urls: ['<all_urls>'],
    },
    ['responseHeaders'],
  );

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
      case BackgroundActiontype.get_requests: {
        const keys = RequestsLogs[request.data]?.keys() || [];
        const data = keys.map((key) => RequestsLogs[request.data]?.get(key));

        return sendResponse((data));
      }
      case BackgroundActiontype.clear_requests: {
        RequestsLogs = {};
        return sendResponse();
      }
      default:
        break;
    }
  });
})();
