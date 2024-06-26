import React, { useEffect } from 'react';
import { BackgroundActiontype } from '../Background/rpc';
import { prove, set_logging_filter, verify } from 'tlsn-js';
import { urlify } from '../../utils/misc';
import browser from 'webextension-polyfill';
import { getLoggingFilter } from '../../utils/storage';
import { LOGGING_LEVEL_INFO } from '../../utils/constants';

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
            loggingFilter = LOGGING_LEVEL_INFO,
          } = request.data;

          (async () => {
            try {
              const token = urlify(url)?.hostname || '';
              await set_logging_filter(loggingFilter);
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

              sendResponse({
                id,
                proof,
              });
            } catch (error) {
              browser.runtime.sendMessage({
                type: BackgroundActiontype.finish_prove_request,
                data: {
                  id,
                  error,
                },
              });
              throw error;
            }
          })();

          return true;
        }
        case BackgroundActiontype.verify_proof: {
          (async () => {
            const result = await verify(request.data);
            sendResponse(result);
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
