import {BackgroundActiontype, RequestLog} from "./actionTypes";
import {Mutex} from "async-mutex";

const RequestsLogs: {
  [tabId: string]: {
    [requestId: string]: RequestLog;
  };
} = {};

const mutex = new Mutex();

(async () => {
  // @ts-ignore
  chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],
    justification: 'workers for multithreading',
  });

  chrome.webRequest.onSendHeaders.addListener(
    details => {
      mutex.runExclusive(async () => {
        const { method, type } = details;

        if (method === 'POST') {
          // console.log('post', details);
        }

        if (method !== 'OPTIONS') {
          RequestsLogs[details.tabId] = RequestsLogs[details.tabId] || {};
          RequestsLogs[details.tabId][details.requestId] = {
            ...RequestsLogs[details.tabId][details.requestId],
            method: details.method as 'GET' | 'POST',
            type: details.type,
            url: details.url,
            initiator: details.initiator || null,
            requestHeaders: details.requestHeaders || [],
            tabId: details.tabId,
            requestId: details.requestId,
          };
        }
      });
    },
    {
      urls: ["<all_urls>"],
    },
    ['requestHeaders']
  );

  chrome.webRequest.onBeforeRequest.addListener(
    details => {
      mutex.runExclusive(async () => {
        const { method, type, requestBody } = details;
        if (method === 'POST' && requestBody && requestBody?.raw && requestBody.raw[0]?.bytes) {
          const bodyString = String.fromCharCode.apply(
            null,
            new Uint8Array(requestBody.raw[0].bytes) as any,
          );


          RequestsLogs[details.tabId] = RequestsLogs[details.tabId] || {};

          RequestsLogs[details.tabId][details.requestId] = {
            ...RequestsLogs[details.tabId][details.requestId],
            requestBody: bodyString,
          };
        }
      });
    },
    {
      urls: ["<all_urls>"],
    },
    ['requestBody']
  );

  chrome.webRequest.onResponseStarted.addListener(
    details => {
      mutex.runExclusive(async () => {
        const { method, type, responseHeaders } = details;
          RequestsLogs[details.tabId] = RequestsLogs[details.tabId] || {};

          RequestsLogs[details.tabId][details.requestId] = {
            ...RequestsLogs[details.tabId][details.requestId],
            responseHeaders,
          };
      });
    },
    {
      urls: ["<all_urls>"],
    },
    ['responseHeaders']
  );

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
      case BackgroundActiontype.get_requests: {
        RequestsLogs[request.data] = RequestsLogs[request.data] || {};
        return sendResponse(Object.values(RequestsLogs[request.data]));
      };
      break;
    }
  });
})();