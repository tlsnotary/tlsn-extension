import NodeCache from 'node-cache';

let RequestsLogs: {
  [tabId: string]: NodeCache;
} = {};

let HeadersStore: {
  [hostname: string]: NodeCache;
} = {};

export const deleteCacheByTabId = (tabId: number) => {
  delete RequestsLogs[tabId];
};

export const getCacheByTabId = (tabId: number): NodeCache => {
  RequestsLogs[tabId] =
    RequestsLogs[tabId] ||
    new NodeCache({
      stdTTL: 60 * 5, // default 5m TTL
      maxKeys: 1000000,
    });

  return RequestsLogs[tabId];
};

export const deleteHeadersByHost = (hostname: string) => {
  delete HeadersStore[hostname];
};

export const getHeaderStoreByHost = (hostname: string): NodeCache => {
  HeadersStore[hostname] =
    HeadersStore[hostname] ||
    new NodeCache({
      stdTTL: 60 * 5, // default 5m TTL
      maxKeys: 1000000,
    });

  return HeadersStore[hostname];
};

export const clearRequestCache = () => {
  RequestsLogs = {};
};

export const clearHeaderCache = () => {
  HeadersStore = {};
};

export const clearCache = () => {
  clearRequestCache();
  clearHeaderCache();
};
