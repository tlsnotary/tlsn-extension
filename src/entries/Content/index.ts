import browser from 'webextension-polyfill';
import { ContentScriptTypes, RPCServer } from './rpc';
import { BackgroundActiontype, RequestHistory } from '../Background/rpc';
const charwise = require('charwise');

(async () => {
  loadScript('content.bundle.js');
  const server = new RPCServer();

  server.on(ContentScriptTypes.connect, async () => {
    const connected = await browser.runtime.sendMessage({
      type: BackgroundActiontype.connect_request,
      data: {
        origin: window.origin,
        position: {
          left: window.screen.width / 2 - 240,
          top: window.screen.height / 2 - 300,
        },
      },
    });

    if (!connected) throw new Error('user rejected.');

    return connected;
  });

  server.on(ContentScriptTypes.get_history, async () => {
    const response: RequestHistory[] = await browser.runtime.sendMessage({
      type: BackgroundActiontype.get_prove_requests,
    });

    return response.map(
      ({ id, method, url, notaryUrl, websocketProxyUrl }) => ({
        id,
        time: new Date(charwise.decode(id)),
        method,
        url,
        notaryUrl,
        websocketProxyUrl,
      }),
    );
  });
})();

function loadScript(filename: string) {
  const url = browser.runtime.getURL(filename);
  const script = document.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.setAttribute('src', url);
  document.body.appendChild(script);
}
