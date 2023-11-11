import React, { useEffect } from 'react';
import * as Comlink from 'comlink';
import { BackgroundActiontype } from '../Background/actionTypes';

const TLSN: any = Comlink.wrap(
  new Worker(new URL('./worker.ts', import.meta.url)),
);

let tlsn: any | null = null;

async function getTLSN(): Promise<any | null> {
  if (tlsn) return tlsn;
  tlsn = await new TLSN();
  return tlsn;
}

const Offscreen = () => {
  useEffect(() => {
    chrome.runtime.onMessage.addListener(
      async (request, sender, sendResponse) => {
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
              secrets,
              reveals,
            } = request.data;

            const tlsn = await getTLSN();

            try {
              const proof = await tlsn.prover(url, {
                method,
                headers,
                body,
                maxTranscriptSize,
                notaryUrl,
                websocketProxyUrl,
                secrets,
                reveals,
              });

              chrome.runtime.sendMessage<any, string>({
                type: BackgroundActiontype.finish_prove_request,
                data: {
                  id,
                  proof,
                },
              });
            } catch (error) {
              chrome.runtime.sendMessage<any, string>({
                type: BackgroundActiontype.finish_prove_request,
                data: {
                  id,
                  error,
                },
              });
            }

            break;
          }
          case BackgroundActiontype.verify_prove_request: {
            const tlsn = await getTLSN();

            const result = await tlsn.verify(
              request.data.proof,
              `-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEBv36FI4ZFszJa0DQFJ3wWCXvVLFr\ncRzMG5kaTeHGoSzDu6cFqx3uEWYpFGo6C0EOUgf+mEgbktLrXocv5yHzKg==\n-----END PUBLIC KEY-----`,
            );

            if (result) {
              chrome.runtime.sendMessage<any, string>({
                type: BackgroundActiontype.finish_prove_request,
                data: {
                  id: request.data.id,
                  verification: {
                    sent: result.sent,
                    recv: result.recv,
                  },
                },
              });
            }
            break;
          }
          default:
            break;
        }
      },
    );
  }, []);

  return <div className="App" />;
};

export default Offscreen;
