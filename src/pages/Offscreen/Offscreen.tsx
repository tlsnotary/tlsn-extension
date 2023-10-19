import React, { useEffect } from 'react';
import * as Comlink from 'comlink';
import { BackgroundActiontype } from '../Background/actionTypes';

const TLSN: any = Comlink.wrap(
  new Worker(new URL('./worker.ts', import.meta.url)),
);

let tlsn: TLSN | null = null;

async function getTLSN(): Promise<TLSN> {
  if (tlsn) return tlsn;
  tlsn = await new TLSN();
  return tlsn;
}

const Offscreen = () => {
  useEffect(() => {
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

          getTLSN()
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
        case BackgroundActiontype.verify_prove_request: {
          getTLSN()
              .then(async tlsn => {
                await tlsn.verify(
                  request.data.proof,
                  `-----BEGIN PUBLIC KEY-----MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEBv36FI4ZFszJa0DQFJ3wWCXvVLFrcRzMG5kaTeHGoSzDu6cFqx3uEWYpFGo6C0EOUgf+mEgbktLrXocv5yHzKg==-----END PUBLIC KEY-----`
                );
              });

          break;
        }
        default:
          break;
      }
    });
  }, []);

  return <div className="App" />;
};

export default Offscreen;
