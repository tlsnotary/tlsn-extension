import { onBeforeRequest, onResponseStarted, onSendHeaders } from './handlers';
import { deleteCacheByTabId } from './cache';
import browser from 'webextension-polyfill';
import { getAppState, setDefaultPluginsInstalled } from './db';
import { installPlugin } from './plugins/utils';
import { BackgroundActiontype } from './rpc';
import { setStorage } from './db';

(async () => {
  chrome.runtime.onMessage.addListener(async (request, sender) => {
    if (
      request.type === BackgroundActiontype.get_browser_storage &&
      sender.tab?.url
    ) {
      const url = new URL(sender.tab.url);
      const hostname = url.hostname;
      const storage: { [key: string]: string } = request.storage;
      for (const [key, value] of Object.entries(storage)) {
        await setStorage(hostname, key, value);
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
