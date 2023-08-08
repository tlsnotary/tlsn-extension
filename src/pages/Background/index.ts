import {BackgroundActiontype, RequestLog} from "./actionTypes";

const RequestsLogs: RequestLog[] = [];

(async () => {
  // @ts-ignore
  chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['WORKERS'],
    justification: 'workers for multithreading',
  });

  chrome.webRequest.onBeforeSendHeaders.addListener(
    details => {
      const { method, type } = details;

      if (method !== 'OPTIONS' && type === 'xmlhttprequest') {
        RequestsLogs.push({
          method: details.method as 'GET' | 'POST',
          type: details.type,
          url: details.url,
          initiator: details.initiator || null,
          requestHeaders: details.requestHeaders || [],
          tabId: details.tabId,
        });
      }

    },
    {
      urls: ["<all_urls>"],
    },
    ['requestHeaders']
  );

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.type) {
      case BackgroundActiontype.get_requests:
        return sendResponse(RequestsLogs.filter(({tabId}) => tabId === request.data));
    }
  });
})();