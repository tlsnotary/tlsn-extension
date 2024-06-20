import browser from 'webextension-polyfill';
import { ContentScriptRequest, ContentScriptTypes, RPCServer } from './rpc';
import { BackgroundActiontype, RequestHistory } from '../Background/rpc';
import { minimatch } from 'minimatch';
import { urlify } from '../../utils/misc';
const charwise = require('charwise');

(async () => {
  loadScript('content.bundle.js');
  const server = new RPCServer();

  server.on(ContentScriptTypes.connect, async () => {
    const connected = await browser.runtime.sendMessage({
      type: BackgroundActiontype.connect_request,
      data: {
        ...getPopupData(),
      },
    });

    if (!connected) throw new Error('user rejected.');

    return connected;
  });

  server.on(
    ContentScriptTypes.get_history,
    async (request: ContentScriptRequest<{ method: string; url: string }>) => {
      const { method: filterMethod, url: filterUrl } = request.params || {};

      if (!filterMethod || !filterUrl)
        throw new Error('params must include method and url.');

      const response: RequestHistory[] = await browser.runtime.sendMessage({
        type: BackgroundActiontype.get_history_request,
        data: {
          ...getPopupData(),
          method: filterMethod,
          url: filterUrl,
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
