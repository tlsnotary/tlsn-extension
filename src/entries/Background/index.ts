import { onBeforeRequest, onResponseStarted, onSendHeaders } from './handlers';
import { deleteCacheByTabId } from './cache';
import browser from 'webextension-polyfill';
import { getAppState, setDefaultPluginsInstalled } from './db';
import { installPlugin } from './plugins/utils';
import { BackgroundActiontype } from './rpc';
import {
  setLocalStorage,
  setSessionStorage,
  getLocalStorageByHost,
} from './db';

(async () => {
  chrome.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {
      if (request.type === BackgroundActiontype.get_local_storage) {
        const { localStorageData, hostname } = request;
        console.log('background', localStorageData);
        // Use `setLocalStorage` for each key-value pair
        for (const [key, value] of Object.entries(localStorageData)) {
          await setLocalStorage(hostname, key, value as any);
        }
      }
    },
  );

  chrome.runtime.onMessage.addListener(async (request, sender) => {
    if (
      request.type === BackgroundActiontype.set_session_storage &&
      sender.tab?.url
    ) {
      const url = new URL(sender.tab.url);
      const hostname = url.hostname;
      const sessionStorage: { [key: string]: string } = request.data;

      for (const [key, value] of Object.entries(sessionStorage || {})) {
        await setSessionStorage(hostname, key, value);
      }
    }
  });

  browser.webRequest.onSendHeaders.addListener(
    onSendHeaders,
    {
      urls: ['<all_urls>'],
    },
    ['requestHeaders', 'extraHeaders'],
  );

  browser.webRequest.onBeforeRequest.addListener(
    onBeforeRequest,
    {
      urls: ['<all_urls>'],
    },
    ['requestBody'],
  );

  browser.webRequest.onResponseStarted.addListener(
    onResponseStarted,
    {
      urls: ['<all_urls>'],
    },
    ['responseHeaders', 'extraHeaders'],
  );

  browser.tabs.onRemoved.addListener((tabId) => {
    deleteCacheByTabId(tabId);
  });

  const { defaultPluginsInstalled } = await getAppState();

  if (!defaultPluginsInstalled) {
    try {
      const twitterProfileUrl = browser.runtime.getURL('twitter_profile.wasm');
      const discordDmUrl = browser.runtime.getURL('discord_dm.wasm');
      await installPlugin(twitterProfileUrl);
      await installPlugin(discordDmUrl);
    } finally {
      await setDefaultPluginsInstalled(true);
    }
  }

  const { initRPC } = await import('./rpc');
  await createOffscreenDocument();
  initRPC();
})();

let creatingOffscreen: any;
async function createOffscreenDocument() {
  const offscreenUrl = browser.runtime.getURL('offscreen.html');
  // @ts-ignore
  const existingContexts = await browser.runtime.getContexts({
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
}
