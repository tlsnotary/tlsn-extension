import { onBeforeRequest, onResponseStarted, onSendHeaders } from './handlers';
import { deleteCacheByTabId } from './cache';
import browser from 'webextension-polyfill';
import { getAppState, removePlugin, setDefaultPluginsInstalled } from './db';
import { installPlugin } from './plugins/utils';

(async () => {
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

  switch (defaultPluginsInstalled) {
    case false: {
      try {
        const twitterProfileUrl = browser.runtime.getURL(
          'twitter_profile.wasm',
        );
        const discordDmUrl = browser.runtime.getURL('discord_dm.wasm');
        await installPlugin(twitterProfileUrl);
        await installPlugin(discordDmUrl);
      } finally {
        await setDefaultPluginsInstalled('0.1.0.703');
      }
      break;
    }
    case true: {
      try {
        await removePlugin(
          '6931d2ad63340d3a1fb1a5c1e3f4454c5a518164d6de5ad272e744832355ee02',
        );
        const twitterProfileUrl = browser.runtime.getURL(
          'twitter_profile.wasm',
        );
        await installPlugin(twitterProfileUrl);
      } finally {
        await setDefaultPluginsInstalled('0.1.0.703');
      }
      break;
    }
    case '0.1.0.703':
      break;
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
