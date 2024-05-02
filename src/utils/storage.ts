export const NOTARY_API_LS_KEY = 'notary-api';
export const PROXY_API_LS_KEY = 'proxy-api';
export const HISTORY_LS_KEY = 'history';
export const MAX_SENT_LS_KEY = 'max-sent';
export const MAX_RECEIVED_LS_KEY = 'max-received';

export async function set(key: string, value: string) {
  return chrome.storage.sync.set({ [key]: value });
}

export async function get(key: string, defaultValue?: string) {
  return chrome.storage.sync
    .get(key)
    .then((json: any) => json[key] || defaultValue)
    .catch(() => '');
}
