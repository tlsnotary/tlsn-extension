import browser from 'webextension-polyfill';
import { ContentScriptTypes, RPCServer } from './rpc';
import { BackgroundActiontype } from '../Background/rpc';

(async () => {
  loadScript('content.bundle.js');
  const server = new RPCServer();
  server.on(ContentScriptTypes.connect, async () => {
    const response = await browser.runtime.sendMessage({
      type: BackgroundActiontype.connect,
      data: {
        origin: window.origin,
        position: {
          left: window.screen.width / 2 - 240,
          top: window.screen.height / 2 - 300,
        },
      },
    });
    return response;
  });
})();

function loadScript(filename: string) {
  const url = browser.runtime.getURL(filename);
  const script = document.createElement('script');
  script.setAttribute('type', 'text/javascript');
  script.setAttribute('src', url);
  document.body.appendChild(script);
}
