import React, { useEffect } from 'react';
import * as Comlink from 'comlink';
import { BackgroundActiontype } from '../Background/actionTypes';

const Offscreen = () => {
  useEffect(() => {
    (async function offscreenloaded() {
      console.log('offscreen loaded - spawning worker from worker.ts');

      chrome.runtime.onMessage.addListener(
        async (request, sender, sendResponse) => {
          switch (request.type) {
            case BackgroundActiontype.test_wasm: {
              const Wasm: any = Comlink.wrap(
                new Worker(new URL('./worker.ts', import.meta.url)),
              );
              await new Wasm();
              return sendResponse();
            }
            default:
              break;
          }
        },
      );
    })();
  }, []);

  return <div className="App" />;
};

export default Offscreen;
