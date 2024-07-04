import NodeCache from 'node-cache';

let RequestsLogs: {
  [tabId: string]: NodeCache;
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

export const clearRequestCache = () => {
  RequestsLogs = {};
};

export const clearCache = () => {
  clearRequestCache();
};
