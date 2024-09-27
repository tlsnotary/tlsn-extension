import React, { useEffect } from 'react';
import * as Comlink from 'comlink';
import { OffscreenActionTypes } from './types';
import {
  NotaryServer,
  Prover as _Prover,
  RemoteAttestation,
} from '@eternis/tlsn-js';

import { urlify } from '../../utils/misc';
import { BackgroundActiontype } from '../Background/rpc';
import browser from 'webextension-polyfill';
import { Proof, AttrAttestation } from '../../utils/types';
import { Method } from '@eternis/tlsn-js/wasm/pkg';

const { init, verify_attestation, Prover, NotarizedSession, TlsProof }: any =
  Comlink.wrap(new Worker(new URL('./worker.ts', import.meta.url)));

const Offscreen = () => {
  useEffect(() => {
    (async () => {
      const loggingLevel = await browser.runtime.sendMessage({
        type: BackgroundActiontype.get_logging_level,
      });

      // @ts-ignore
      chrome.runtime.onMessage.addListener(
        async (request, sender, sendResponse) => {
          console.log('request', request);
          switch (request.type) {
            case OffscreenActionTypes.remote_attestation_verification: {
              console.log(
                'OffscreenActionTypes.remote_attestation_verification',
              );
              const remoteAttestation: RemoteAttestation =
                request.data.remoteAttestation;
              const nonce = request.data.nonce;
              const pcrs = request.data.pcrs;
              console.log(
                'OffscreenActionTypes.remote_attestation_verification',
                remoteAttestation,
                pcrs,
              );

              try {
                await init({ loggingLevel });
              } catch (error) {
                console.error('wasm aready init');
              }
              const result = await verify_attestation(
                remoteAttestation,
                nonce,
                pcrs,
              );

              console.log('remoteAttestation', remoteAttestation);

              chrome.runtime.sendMessage({
                type: OffscreenActionTypes.remote_attestation_verification_response,
                data: result,
              });
              break;
            }
            case OffscreenActionTypes.notarization_request: {
              const { id } = request.data;

              (async () => {
                try {
                  const proof = await createProof(request.data);
                  browser.runtime.sendMessage({
                    type: BackgroundActiontype.finish_prove_request,
                    data: {
                      id,
                      proof,
                    },
                  });

                  browser.runtime.sendMessage({
                    type: OffscreenActionTypes.notarization_response,
                    data: {
                      id,
                      proof,
                    },
                  });
                } catch (error) {
                  console.error(error);
                  browser.runtime.sendMessage({
                    type: BackgroundActiontype.finish_prove_request,
                    data: {
                      id,
                      error,
                    },
                  });

                  browser.runtime.sendMessage({
                    type: OffscreenActionTypes.notarization_response,
                    data: {
                      id,
                      error,
                    },
                  });
                }
              })();

              break;
            }
            case BackgroundActiontype.process_prove_request: {
              const { id } = request.data;

              (async () => {
                try {
                  const proof = await createProof(request.data);
                  console.log('BackgroundActiontype ', proof);
                  browser.runtime.sendMessage({
                    type: BackgroundActiontype.finish_prove_request,
                    data: {
                      id,
                      proof: proof,
                    },
                  });
                } catch (error) {
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
                const result = await verifyProof(request.data);
                sendResponse(result);
              })();

              return true;
            }
            case BackgroundActiontype.verify_prove_request: {
              (async () => {
                const proof: Proof = request.data.proof;
                // const result: { sent: string; recv: string } =
                //   await verifyProof(proof);

                chrome.runtime.sendMessage<any, string>({
                  type: BackgroundActiontype.finish_prove_request,
                  data: {
                    id: request.data.id,
                    verification: {
                      proof,
                    },
                  },
                });
              })();
              break;
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

function subtractRanges(
  ranges: { start: number; end: number },
  negatives: { start: number; end: number }[],
): { start: number; end: number }[] {
  const returnVal: { start: number; end: number }[] = [ranges];

  negatives
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .forEach(({ start, end }) => {
      const last = returnVal.pop()!;

      if (start < last.start || end > last.end) {
        console.error('invalid ranges');
        return;
      }

      if (start === last.start && end === last.end) {
        return;
      }

      if (start === last.start && end < last.end) {
        returnVal.push({ start: end, end: last.end });
        return;
      }

      if (start > last.start && end < last.end) {
        returnVal.push({ start: last.start, end: start });
        returnVal.push({ start: end, end: last.end });
        return;
      }

      if (start > last.start && end === last.end) {
        returnVal.push({ start: last.start, end: start });
        return;
      }
    });

  return returnVal;
}

async function createProof(options: {
  url: string;
  notaryUrl: string;
  websocketProxyUrl: string;
  method?: Method;
  headers?: {
    [name: string]: string;
  };
  body?: any;
  maxSentData?: number;
  maxRecvData?: number;
  id: string;
  secretHeaders: string[];
  secretResps: string[];
}): Promise<AttrAttestation> {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    maxSentData,
    maxRecvData,
    notaryUrl,
    websocketProxyUrl,
    id,
    secretHeaders,
    secretResps,
  } = options;

  const hostname = urlify(url)?.hostname || '';
  const notary = NotaryServer.from(notaryUrl);
  const prover: _Prover = await new Prover({
    id,
    serverDns: hostname,
    maxSentData,
    maxRecvData,
  });

  await prover.setup(await notary.sessionUrl(maxSentData, maxRecvData));

  await prover.sendRequest(websocketProxyUrl + `?token=${hostname}`, {
    url,
    method,
    headers,
    body,
  });

  const result = await prover.notarize();

  const proof: AttrAttestation = {
    version: '1.0',
    meta: {
      notaryUrl,
      websocketProxyUrl,
    },
    signature: result.signature,
    signedSession: result.signedSession,
    applicationData: result.applicationData,
    attestations: result.attestation,
  };
  return proof;
}

async function verifyProof(
  proof: Proof,
): Promise<{ sent: string; recv: string }> {
  return { sent: '', recv: '' };

  // switch (proof.version) {
  //   case undefined: {
  //     result = await verify(proof);
  //     break;
  //   }
  //   case '1.0': {
  //     const tlsProof: _TlsProof = await new TlsProof(proof.data);
  //     result = await tlsProof.verify({
  //       typ: 'P256',
  //       key: await NotaryServer.from(proof.meta.notaryUrl).publicKey(),
  //     });
  //     break;
  //   }
  // }
}
