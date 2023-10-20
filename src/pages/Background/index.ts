import {
  BackgroundActiontype,
  RequestLog,
  type RequestHistory,
} from './actionTypes';

import { Mutex } from 'async-mutex';
import NodeCache from 'node-cache';
import { addRequest } from '../../reducers/requests';
import { addRequestHistory } from '../../reducers/history';
import { Level } from 'level';
import charwise from 'charwise';

let RequestsLogs: {
  [tabId: string]: NodeCache;
} = {};

const mutex = new Mutex();
const cache = new NodeCache({
  stdTTL: 60 * 5, // default 5m TTL
  maxKeys: 1000000,
});

let creatingOffscreen;

chrome.tabs.onActivated.addListener((tabs) => {
  RequestsLogs[tabs.tabId] =
    RequestsLogs[tabs.tabId] ||
    new NodeCache({
      stdTTL: 60 * 5, // default 5m TTL
      maxKeys: 1000000,
    });
});

chrome.tabs.onRemoved.addListener((tab) => {
  delete RequestsLogs[tab];
});

(async () => {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl],
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = (chrome as any).offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: 'workers for multithreading',
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }

  chrome.webRequest.onSendHeaders.addListener(
    (details) => {
      mutex.runExclusive(async () => {
        const { method, tabId, requestId } = details;

        // console.log('details', details);
        if (method !== 'OPTIONS') {
          RequestsLogs[tabId] =
            RequestsLogs[tabId] ||
            new NodeCache({
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
    ['requestHeaders', 'extraHeaders'],
  );

  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      mutex.runExclusive(async () => {
        const { method, requestBody, tabId, requestId } = details;

        if (method === 'OPTIONS') return;

        if (requestBody) {
          RequestsLogs[tabId] =
            RequestsLogs[tabId] ||
            new NodeCache({
              stdTTL: 60 * 5, // default 5m TTL
              maxKeys: 1000000,
            });

          const existing = RequestsLogs[tabId].get<RequestLog>(requestId);

          if (requestBody.raw && requestBody.raw[0]?.bytes) {
            try {
              RequestsLogs[details.tabId].set(requestId, {
                ...existing,
                requestBody: Buffer.from(requestBody.raw[0].bytes).toString(
                  'utf-8',
                ),
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
        const { method, responseHeaders, tabId, requestId } = details;

        if (method === 'OPTIONS') return;

        RequestsLogs[tabId] =
          RequestsLogs[tabId] ||
          new NodeCache({
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

        chrome.runtime.sendMessage({
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
    ['responseHeaders', 'extraHeaders'],
  );

  chrome.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {
      switch (request.type) {
        case BackgroundActiontype.get_requests: {
          const keys = RequestsLogs[request.data]?.keys() || [];
          const data = keys.map((key) => RequestsLogs[request.data]?.get(key));
          return sendResponse(data);
        }
        case BackgroundActiontype.clear_requests: {
          RequestsLogs = {};
          return sendResponse();
        }
        case BackgroundActiontype.get_prove_requests: {
          getNotaryRequests().then((reqs) => {
            for (const req of reqs) {
              chrome.runtime.sendMessage({
                type: BackgroundActiontype.push_action,
                data: {
                  tabId: 'background',
                },
                action: addRequestHistory(req),
              });
            }
          });
          return sendResponse();
        }
        case BackgroundActiontype.finish_prove_request: {
          const { id, proof } = request.data;

          const newReq = await addNotaryRequestProofs(id, proof);

          if (newReq) {
            chrome.runtime.sendMessage({
              type: BackgroundActiontype.push_action,
              data: {
                tabId: 'background',
              },
              action: addRequestHistory(await getNotaryRequest(id)),
            });
          }

          return sendResponse();
        }
        case BackgroundActiontype.delete_prove_request: {
          const id = request.data;
          await removeNotaryRequest(id);
          return sendResponse();
        }
        case BackgroundActiontype.retry_prove_request: {
          const { id, notaryUrl, websocketProxyUrl } = request.data;

          await setNotaryRequestStatus(id, 'pending');

          const req = await getNotaryRequest(id);

          chrome.runtime.sendMessage<any, string>({
            type: BackgroundActiontype.process_prove_request,
            data: {
              ...req,
              notaryUrl,
              websocketProxyUrl,
            },
          });

          return sendResponse();
        }
        case BackgroundActiontype.prove_request_start: {
          const {
            url,
            method,
            headers,
            body,
            maxTranscriptSize,
            notaryUrl,
            websocketProxyUrl,
          } = request.data;

          const { id } = await addNotaryRequest(Date.now(), {
            url,
            method,
            headers,
            body,
            maxTranscriptSize,
            notaryUrl,
            websocketProxyUrl,
          });

          await setNotaryRequestStatus(id, 'pending');

          chrome.runtime.sendMessage({
            type: BackgroundActiontype.push_action,
            data: {
              tabId: 'background',
            },
            action: addRequestHistory(await getNotaryRequest(id)),
          });

          chrome.runtime.sendMessage<any, string>({
            type: BackgroundActiontype.process_prove_request,
            data: {
              id,
              url,
              method,
              headers,
              body,
              maxTranscriptSize,
              notaryUrl,
              websocketProxyUrl,
            },
          });

          return sendResponse();
        }
        default:
          break;
      }
    },
  );
})();

const db = new Level('./ext-db', {
  valueEncoding: 'json',
});
const historyDb = db.sublevel('history', { valueEncoding: 'json' });

async function addNotaryRequest(
  now = Date.now(),
  request: RequestHistory,
): Promise<RequestHistory> {
  const id = charwise.encode(now).toString('hex');
  const newReq = {
    ...request,
    id,
  };
  await historyDb.put(id, newReq);
  return newReq;
}

async function addNotaryRequestProofs(
  id: string,
  proof: { session: any; substrings: any },
): Promise<RequestHistory | null> {
  const existing = await historyDb.get(id);

  if (!existing) return null;

  const newReq = {
    ...existing,
    proof,
    status: 'success',
  };

  await historyDb.put(id, newReq);

  return newReq;
}

async function setNotaryRequestStatus(
  id: string,
  status: '' | 'pending' | 'success' | 'error',
): Promise<RequestHistory | null> {
  const existing = await historyDb.get(id);

  if (!existing) return null;

  const newReq = {
    ...existing,
    status,
  };

  await historyDb.put(id, newReq);

  return newReq;
}

async function removeNotaryRequest(id: string): Promise<RequestHistory | null> {
  const existing = await historyDb.get(id);

  if (!existing) return null;

  await historyDb.del(id);

  return existing;
}

async function getNotaryRequests(): Promise<RequestHistory[]> {
  const retVal = [];
  for await (const [key, value] of historyDb.iterator()) {
    retVal.push(value);
  }
  return retVal;
}

async function getNotaryRequest(id: string): Promise<RequestHistory | null> {
  return historyDb.get(id);
}
