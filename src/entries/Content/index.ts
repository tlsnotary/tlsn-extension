import browser, { browserAction } from 'webextension-polyfill';
import { ContentScriptRequest, ContentScriptTypes, RPCServer } from './rpc';
import { BackgroundActiontype, RequestHistory } from '../Background/rpc';
import { urlify } from '../../utils/misc';

(async () => {
  loadScript('content.bundle.js');
  const server = new RPCServer();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === BackgroundActiontype.get_local_storage) {
      chrome.runtime.sendMessage({
        type: BackgroundActiontype.set_local_storage,
        data: { ...localStorage },
      });
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === BackgroundActiontype.get_session_storage) {
      chrome.runtime.sendMessage({
        type: BackgroundActiontype.set_session_storage,
        data: { ...sessionStorage },
      });
    }
  });

  server.on(
    ContentScriptTypes.notarize,
    async (
      request: ContentScriptRequest<{
        url: string;
        method?: string;
        headers?: { [key: string]: string };
        metadata?: { [key: string]: string };
        body?: string;
        notaryUrl?: string;
        websocketProxyUrl?: string;
        maxSentData?: number;
        maxRecvData?: number;
      }>,
    ) => {
      const {
        url,
        method,
        headers,
        body,
        maxSentData,
        maxRecvData,
        notaryUrl,
        websocketProxyUrl,
        metadata,
      } = request.params || {};

      if (!url || !urlify(url)) throw new Error('invalid url.');

      const proof = await browser.runtime.sendMessage({
        type: BackgroundActiontype.notarize_request,
        data: {
          ...getPopupData(),
          url,
          method,
          headers,
          body,
          maxSentData,
          maxRecvData,
          notaryUrl,
          websocketProxyUrl,
          metadata,
        },
      });

      return proof;
    },
  );

  server.on(
    ContentScriptTypes.run_plugin_by_url,
    async (
      request: ContentScriptRequest<{
        url: string;
        params?: Record<string, string>;
      }>,
    ) => {
      const { url, params } = request.params || {};

      if (!url) throw new Error('params must include url');

      const response = await browser.runtime.sendMessage({
        type: BackgroundActiontype.run_plugin_by_url_request,
        data: {
          ...getPopupData(),
          url,
          params,
        },
      });

      return response;
    },
  );
})();

function loadScript(filename: string) {
  const url = browser.runtime.getURL(filename);
  const script = document.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.setAttribute('src', url);
  document.body.appendChild(script);
}

function getPopupData() {
  return {
    origin: window.origin,
    position: {
      left: window.screen.width / 2 - 240,
      top: window.screen.height / 2 - 300,
    },
  };
}
