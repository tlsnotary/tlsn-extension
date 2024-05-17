import NodeCache from 'node-cache';

let RequestsLogs: {
  [tabId: string]: NodeCache;
} = {};

let HeadersStore: {
  [hostname: string]: NodeCache;
} = {};

let CookieStore: {
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

export const deleteCookiesByHost = (hostname: string) => {
  delete CookieStore[hostname];
};

export const getCookieStoreByHost = (hostname: string): NodeCache => {
  CookieStore[hostname] =
    CookieStore[hostname] ||
    new NodeCache({
      stdTTL: 60 * 5, // default 5m TTL
      maxKeys: 1000000,
    });

  return CookieStore[hostname];
};

export const clearRequestCache = () => {
  RequestsLogs = {};
};

export const clearHeaderCache = () => {
  HeadersStore = {};
};

export const clearCookieCache = () => {
  CookieStore = {};
};

export const clearCache = () => {
  clearRequestCache();
  clearHeaderCache();
  clearCookieCache();
};
