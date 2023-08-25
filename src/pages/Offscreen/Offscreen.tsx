import React, { useEffect } from 'react';
import * as Comlink from 'comlink';
import { BackgroundActiontype } from '../Background/actionTypes';

const Offscreen = () => {
  useEffect(() => {
    (async function offscreenloaded() {
      console.log('offscreen loaded - spawning worker from worker.ts');

      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch (request.type) {
          case BackgroundActiontype.test_wasm: {
            const TLSN: any = Comlink.wrap(
              new Worker(new URL('./worker.ts', import.meta.url)),
            );

            new TLSN().then(async (tlsn: any) => {
              const data = await tlsn.prover();
              sendResponse({ data });
            });

            break;
          }
          default:
            break;
        }
        return true;
      });
    })();
  }, []);

  return <div className="App" />;
};

export default Offscreen;
