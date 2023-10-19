import React, { useEffect } from 'react';
import * as Comlink from 'comlink';
import { BackgroundActiontype } from '../Background/actionTypes';

const TLSN: any = Comlink.wrap(
  new Worker(new URL('./worker.ts', import.meta.url)),
);

const Offscreen = () => {
  useEffect(() => {
    (async function offscreenloaded() {
      chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
        switch (request.type) {
          case BackgroundActiontype.process_prove_request: {
            const {
              url,
              method,
              headers,
              body = '',
              maxTranscriptSize,
              notaryUrl,
              websocketProxyUrl,
              id,
            } = request.data;

            new TLSN({
              notaryUrl,
              websocketProxyUrl,
            })
              .then(async tlsn => {
                const proof = await tlsn.prover(url, {
                  method,
                  headers,
                  body,
                  maxTranscriptSize,
                  notaryUrl,
                  websocketProxyUrl,
                });

                chrome.runtime.sendMessage<any, string>({
                  type: BackgroundActiontype.finish_prove_request,
                  data: {
                    id,
                    proof,
                  },
                });
                console.log('offscreen process_prove_request', id, proof, request.data);
              });

            break;
          }
          default:
            break;
        }
      });
    })();
  }, []);

  return <div className="App" />;
};

export default Offscreen;
