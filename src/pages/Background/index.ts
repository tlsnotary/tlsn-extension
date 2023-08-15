import {BackgroundActiontype, RequestLog} from "./actionTypes";
import {Mutex} from "async-mutex";
import {addRequest} from "../../reducers/requests";

let RequestsLogs: {
  [tabId: string]: {
    [requestId: string]: RequestLog;
  };
} = {};

const mutex = new Mutex();

let offscreen;

(async () => {
  if (offscreen) {
    await offscreen;
    offscreen = null;
  } else  {
    // @ts-ignore
    offscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'workers for multithreading',
    });
    await offscreen;
    offscreen = null;
  }

  chrome.tabs.onActivated.addListener(tabs => {
    const newLog = {
      [tabs.tabId]: RequestsLogs[tabs.tabId],
    };
    RequestsLogs = newLog;
  })

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
        if (method === 'OPTIONS') return ;
        if (requestBody) {
          if (requestBody.raw && requestBody.raw[0]?.bytes) {
            const bodyString = String.fromCharCode.apply(
              null,
              new Uint8Array(requestBody.raw[0].bytes) as any,
            );

            RequestsLogs[details.tabId] = RequestsLogs[details.tabId] || {};

            RequestsLogs[details.tabId][details.requestId] = {
              ...RequestsLogs[details.tabId][details.requestId],
              requestBody: bodyString,
            };
          } else if (requestBody.formData) {
            RequestsLogs[details.tabId] = RequestsLogs[details.tabId] || {};
            RequestsLogs[details.tabId][details.requestId] = {
              ...RequestsLogs[details.tabId][details.requestId],
              formData: requestBody.formData,
            };
          }
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
        if (method === 'OPTIONS') return ;

        RequestsLogs[details.tabId] = RequestsLogs[details.tabId] || {};

        RequestsLogs[details.tabId][details.requestId] = {
          ...RequestsLogs[details.tabId][details.requestId],
          method: details.method,
          type: details.type,
          url: details.url,
          initiator: details.initiator || null,
          tabId: details.tabId,
          requestId: details.requestId,
          responseHeaders,
        };

        chrome.runtime.sendMessage({
          type: BackgroundActiontype.push_action,
          data: {
            tabId: details.tabId,
            request: RequestsLogs[details.tabId][details.requestId],
          },
          action: addRequest(RequestsLogs[details.tabId][details.requestId]),
        });
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
      }
      case BackgroundActiontype.clear_requests: {
        RequestsLogs = {};
        return sendResponse();
      }
      break;
    }
  });
})();