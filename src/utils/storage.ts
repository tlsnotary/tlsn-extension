import { LoggingLevel } from 'tlsn-js';
import { MAX_RECV, MAX_SENT, NOTARY_API, NOTARY_PROXY } from './constants';

export const NOTARY_API_LS_KEY = 'notary-api';
export const PROXY_API_LS_KEY = 'proxy-api';
export const MAX_SENT_LS_KEY = 'max-sent';
export const MAX_RECEIVED_LS_KEY = 'max-received';
export const LOGGING_FILTER_KEY = 'logging-filter-2';

export async function set(key: string, value: string) {
  return chrome.storage.sync.set({ [key]: value });
}

export async function get(key: string, defaultValue?: string) {
  return chrome.storage.sync
    .get(key)
    .then((json: any) => json[key] || defaultValue)
    .catch(() => defaultValue);
}

export async function getMaxSent() {
  return parseInt(await get(MAX_SENT_LS_KEY, MAX_SENT.toString()));
}

export async function getMaxRecv() {
  return parseInt(await get(MAX_RECEIVED_LS_KEY, MAX_RECV.toString()));
}

export async function getNotaryApi() {
  return await get(NOTARY_API_LS_KEY, NOTARY_API);
}

export async function getProxyApi() {
  return await get(PROXY_API_LS_KEY, NOTARY_PROXY);
}

export async function getLoggingFilter(): Promise<LoggingLevel> {
  return await get(LOGGING_FILTER_KEY, 'Info');
}
