import React, { useEffect } from 'react';
import { BackgroundActiontype } from '../Background/rpc';
import { prove, verify } from 'tlsn-js';
import { extractBodyFromResponse, urlify } from '../../utils/misc';
import browser from 'webextension-polyfill';

const Offscreen = () => {
  useEffect(() => {
    // @ts-ignore
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.type) {
        case BackgroundActiontype.process_prove_request: {
          const {
            url,
            method,
            headers,
            body = '',
            maxSentData,
            maxRecvData,
            maxTranscriptSize,
            notaryUrl,
            websocketProxyUrl,
            id,
            secretHeaders,
            secretResps,
          } = request.data;

          (async () => {
            try {
              const token = urlify(url)?.hostname || '';
              const proof = await prove(url, {
                method,
                headers,
                body,
                maxSentData,
                maxRecvData,
                maxTranscriptSize,
                notaryUrl,
                websocketProxyUrl: websocketProxyUrl + `?token=${token}`,
                secretHeaders,
                secretResps,
              });

              browser.runtime.sendMessage({
                type: BackgroundActiontype.finish_prove_request,
                data: {
                  id,
                  proof,
                },
              });
            } catch (error) {
              console.log('i caught an error');
              console.error(error);
              browser.runtime.sendMessage({
                type: BackgroundActiontype.finish_prove_request,
                data: {
                  id,
                  error,
                },
              });
            }
          })();

          break;
        }
        case BackgroundActiontype.verify_proof: {
          (async () => {
            const result = await verify(request.data);
            sendResponse(result);
          })();

          return true;
        }
        case BackgroundActiontype.fetch_request: {
          (async () => {
            const resp = await fetch(request.data.url, request.data.params);
            const data = await extractBodyFromResponse(resp);
            sendResponse(data);
          })();

          return true;
        }
        case BackgroundActiontype.verify_prove_request: {
          (async () => {
            const result = await verify(request.data.proof);

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
          })();
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
