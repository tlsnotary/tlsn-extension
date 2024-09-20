import { getCacheByTabId } from './cache';
import {
  BackgroundActiontype,
  RequestLog,
  handleProveRequestStart,
} from './rpc';
import mutex from './mutex';
import browser from 'webextension-polyfill';
import { addRequest } from '../../reducers/requests';
import { urlify } from '../../utils/misc';
import {
  setCookies,
  setHeaders,
  getNotaryRequestsByUrl,
  getNotaryRequests,
  getLastNotaryRequest,
} from './db';
import {
  NOTARY_API,
  NOTARY_PROXY,
  NOTARIZATION_BUFFER_TIME,
} from '../../utils/constants';
import { Bookmark, BookmarkManager } from '../../reducers/bookmarks';
import { get, NOTARY_API_LS_KEY, PROXY_API_LS_KEY } from '../../utils/storage';

export const onSendHeaders = (
  details: browser.WebRequest.OnSendHeadersDetailsType,
) => {
  return mutex.runExclusive(async () => {
    const { method, tabId, requestId } = details;

    if (method !== 'OPTIONS') {
      const cache = getCacheByTabId(tabId);
      const existing = cache.get<RequestLog>(requestId);
      const { hostname } = urlify(details.url) || {};

      if (hostname && details.requestHeaders) {
        details.requestHeaders.forEach((header) => {
          const { name, value } = header;
          if (/^cookie$/i.test(name) && value) {
            value
              .split(';')
              .map((v) => v.split('='))
              .forEach((cookie) => {
                setCookies(hostname, cookie[0].trim(), cookie[1]);
              });
          } else {
            setHeaders(hostname, name, value);
          }
        });
      }

      cache.set(requestId, {
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
};

export const onBeforeRequest = (
  details: browser.WebRequest.OnBeforeRequestDetailsType,
) => {
  mutex.runExclusive(async () => {
    const { method, requestBody, tabId, requestId } = details;

    if (method === 'OPTIONS') return;

    if (requestBody) {
      const cache = getCacheByTabId(tabId);
      const existing = cache.get<RequestLog>(requestId);

      if (requestBody.raw && requestBody.raw[0]?.bytes) {
        try {
          cache.set(requestId, {
            ...existing,
            requestBody: Buffer.from(requestBody.raw[0].bytes).toString(
              'utf-8',
            ),
          });
        } catch (e) {
          console.error(e);
        }
      } else if (requestBody.formData) {
        cache.set(requestId, {
          ...existing,
          formData: requestBody.formData,
        });
      }
    }
  });
};

export const handleNotarization = (
  details: browser.WebRequest.OnCompletedDetailsType,
) => {
  mutex.runExclusive(async () => {
    const storage = await chrome.storage.sync.get('enable-extension');
    const isEnabled = storage['enable-extension'];
    if (!isEnabled) return;

    //prevent spamming of requests
    const lastNotaryRequest = await getLastNotaryRequest();
    console.log('lastNotaryRequest', lastNotaryRequest);

    if (lastNotaryRequest) {
      const timeDiff = Date.now() - lastNotaryRequest.timestamp;
      if (timeDiff < NOTARIZATION_BUFFER_TIME) {
        return;
      }
    }

    const { tabId, requestId, frameId, url, method, type } = details;
    const cache = getCacheByTabId(tabId);

    if (tabId === -1 || frameId === -1) return;

    const req = cache.get<RequestLog>(requestId);

    //verify that url is part of the bookmarked providers
    const bookmarkManager = new BookmarkManager();
    const bookmarks = await bookmarkManager.getBookmarks();
    const bookmark = bookmarks.find(
      (bm) => url.includes(bm.url) && method === bm.method && type === bm.type,
    );
    const bookmarkIds = await bookmarkManager.getBookmarkIds();

    // console.log('=================');
    // console.log('handleNotarization');
    // console.log('url', url);
    // console.log('method', method);
    // console.log('type', type);
    // console.log('tabId', tabId);
    // console.log('id', requestId);
    // console.log('=================');

    // console.log('bookmarks', bookmarks);
    // console.log('bookmarkIds', bookmarkIds);

    if (!bookmark || !req) return;

    console.log('req', req);

    const requestHeaders = req?.requestHeaders;
    const requestBody = req?.requestBody || req?.formData;

    const hostname = urlify(req.url)?.hostname;

    const headers: { [k: string]: string } = req.requestHeaders.reduce(
      (acc: any, h) => {
        acc[h.name] = h.value;
        return acc;
      },
      { Host: hostname },
    );

    //TODO: for some reason, these needs to be override to work
    headers['Accept-Encoding'] = 'identity';
    headers['Connection'] = 'close';

    const notaryUrl = await get(NOTARY_API_LS_KEY, NOTARY_API);
    const websocketProxyUrl = await get(PROXY_API_LS_KEY, NOTARY_PROXY);

    await handleProveRequestStart(
      {
        type: BackgroundActiontype.prove_request_start,
        data: {
          cid: requestId,
          type: req.type,
          url: req.url,
          method: req.method,
          headers: headers,
          body: req.requestBody,
          maxTranscriptSize: 16384,
          secretHeaders: [],
          secretResps: [],
          notaryUrl,
          websocketProxyUrl,
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      () => {},
    );
  });
};

export const onResponseStarted = (
  details: browser.WebRequest.OnResponseStartedDetailsType,
) => {
  mutex.runExclusive(async () => {
    const { method, responseHeaders, tabId, requestId } = details;

    if (method === 'OPTIONS') return;

    const cache = getCacheByTabId(tabId);

    const existing = cache.get<RequestLog>(requestId);
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

    cache.set(requestId, newLog);

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

// export const onCompletedForNotarization = (
//   details: browser.WebRequest.OnBeforeRequestDetailsType,
// ) => {
//   console.log('onCompletedForNotarization');
//   console.log('details', details);
//   mutex.runExclusive(async () => {
//     const { method, url, type, tabId, requestId } = details;

//     if (tabId === -1) return;

//     const bookmark = bookmarks.find(
//       (bm) =>
//         url.startsWith(bm.url) && method === bm.method && type === bm.type,
//     );

//     if (bookmark) {
//       const cache = getCacheByTabId(tabId);

//       const req = cache.get<RequestLog>(requestId);

//       if (!req) return;

//       console.log('req', req);
//       const res = await replayRequest(req);
//       const secretHeaders = req.requestHeaders
//         .map((h) => {
//           return `${h.name.toLowerCase()}: ${h.value || ''}` || '';
//         })
//         .filter((d) => !!d);

//       const selectedValue = res.match(
//         new RegExp(bookmark.responseSelector, 'g'),
//       );

//       if (selectedValue) {
//         const revealed = bookmark.valueTransform.replace(
//           '%s',
//           selectedValue[0],
//         );
//         const selectionStart = res.indexOf(revealed);
//         const selectionEnd = selectionStart + revealed.length - 1;
//         const secretResps = [
//           res.substring(0, selectionStart),
//           res.substring(selectionEnd, res.length),
//         ].filter((d) => !!d);

//         const hostname = urlify(req.url)?.hostname;
//         const notaryUrl = await get(NOTARY_API_LS_KEY);
//         const websocketProxyUrl = await get(PROXY_API_LS_KEY);

//         const headers: { [k: string]: string } = req.requestHeaders.reduce(
//           (acc: any, h) => {
//             acc[h.name] = h.value;
//             return acc;
//           },
//           { Host: hostname },
//         );

//         //TODO: for some reason, these needs to be override to work
//         headers['Accept-Encoding'] = 'identity';
//         headers['Connection'] = 'close';

//         await handleProveRequestStart(
//           {
//             type: BackgroundActiontype.prove_request_start,
//             data: {
//               url: req.url,
//               method: req.method,
//               headers: headers,
//               body: req.requestBody,
//               maxTranscriptSize: 16384,
//               secretHeaders,
//               secretResps,
//               notaryUrl,
//               websocketProxyUrl,
//             },
//           },
//           // eslint-disable-next-line @typescript-eslint/no-empty-function
//           () => {},
//         );
//       }
//     }
//   });
// };
