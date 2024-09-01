import React, { useEffect, useState } from 'react';
import * as Comlink from 'comlink';
import { OffscreenActionTypes } from './types';
import {
  NotaryServer,
  Prover as _Prover,
  Verifier as _Verifier,
  NotarizedSession as _NotarizedSession,
  TlsProof as _TlsProof,
} from 'tlsn-js';
import { verify } from 'tlsn-js-v5';

import { urlify } from '../../utils/misc';
import { BackgroundActiontype } from '../Background/rpc';
import browser from 'webextension-polyfill';
import { Proof, ProofV1 } from '../../utils/types';
import { Method } from 'tlsn-js/wasm/pkg';
import { waitForEvent } from '../utils';
import type { ParsedTranscriptData } from '../../../../tlsn-js/src/types';

const { init, Prover, NotarizedSession, TlsProof, Verifier }: any =
  Comlink.wrap(new Worker(new URL('./worker.ts', import.meta.url)));

const Offscreen = () => {
  useEffect(() => {
    (async () => {
      const loggingLevel = await browser.runtime.sendMessage({
        type: BackgroundActiontype.get_logging_level,
        hardwareConcurrency: 1,
      });
      await init({ loggingLevel });
      // @ts-ignore
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch (request.type) {
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
              const result: { sent: string; recv: string } =
                await verifyProof(proof);

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
            })();
            break;
          }
          case OffscreenActionTypes.start_p2p_verifier: {
            (async () => {
              const { pluginHash, maxSentData, maxRecvData, verifierUrl } =
                request.data;

              const verifier: _Verifier = await new Verifier({
                id: pluginHash,
                max_sent_data: maxSentData,
                max_recv_data: maxRecvData,
              });

              await verifier.connect(verifierUrl);
              // await new Promise((r) => setTimeout(r, 10000));
              const proverStarted = waitForEvent(
                OffscreenActionTypes.prover_started,
              );

              verifier.verify().then((res) => {
                console.log(res);

                browser.runtime.sendMessage({
                  type: BackgroundActiontype.proof_request_end,
                  data: {
                    pluginHash,
                    proof: res,
                  },
                });
              });

              browser.runtime.sendMessage({
                type: BackgroundActiontype.verifier_started,
                data: {
                  pluginHash,
                },
              });

              await proverStarted;

              browser.runtime.sendMessage({
                type: BackgroundActiontype.start_proof_request,
                data: {
                  pluginHash,
                },
              });
            })();
            break;
          }
          case OffscreenActionTypes.start_p2p_prover: {
            (async () => {
              const {
                pluginHash,
                url,
                method,
                headers,
                body,
                proverUrl,
                websocketProxyUrl,
                maxRecvData,
                maxSentData,
                secretHeaders,
                secretResps,
              } = request.data;

              const hostname = urlify(url)?.hostname || '';
              const prover: _Prover = await new Prover({
                id: pluginHash,
                serverDns: hostname,
                maxSentData,
                maxRecvData,
              });

              const proofRequestStart = waitForEvent(
                OffscreenActionTypes.start_p2p_proof_request,
              );

              const proverSetup = prover.setup(proverUrl);
              // await new Promise((r) => setTimeout(r, 10000));

              await proverSetup;
              browser.runtime.sendMessage({
                type: BackgroundActiontype.prover_started,
                data: {
                  pluginHash,
                },
              });
              await proofRequestStart;

              await prover.sendRequest(
                websocketProxyUrl + `?token=${hostname}`,
                {
                  url,
                  method,
                  headers,
                  body,
                },
              );

              const transcript = await prover.transcript();

              const commit = {
                sent: subtractRanges(
                  transcript.ranges.sent.all,
                  secretHeaders
                    .map((secret: string) => {
                      const index = transcript.sent.indexOf(secret);
                      return index > -1
                        ? {
                            start: index,
                            end: index + secret.length,
                          }
                        : null;
                    })
                    .filter((data: any) => !!data) as {
                    start: number;
                    end: number;
                  }[],
                ),
                recv: subtractRanges(
                  transcript.ranges.recv.all,
                  secretResps
                    .map((secret: string) => {
                      const index = transcript.recv.indexOf(secret);
                      return index > -1
                        ? {
                            start: index,
                            end: index + secret.length,
                          }
                        : null;
                    })
                    .filter((data: any) => !!data) as {
                    start: number;
                    end: number;
                  }[],
                ),
              };

              const endRequest = waitForEvent(
                OffscreenActionTypes.end_p2p_proof_request,
              );
              await prover.reveal(commit);
              console.log(await endRequest);
            })();
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
}): Promise<ProofV1> {
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
    secretHeaders = [],
    secretResps = [],
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

  const transcript = await prover.transcript();

  const commit = {
    sent: subtractRanges(
      transcript.ranges.sent.all,
      secretHeaders
        .map((secret: string) => {
          const index = transcript.sent.indexOf(secret);
          return index > -1
            ? {
                start: index,
                end: index + secret.length,
              }
            : null;
        })
        .filter((data: any) => !!data) as { start: number; end: number }[],
    ),
    recv: subtractRanges(
      transcript.ranges.recv.all,
      secretResps
        .map((secret: string) => {
          const index = transcript.recv.indexOf(secret);
          return index > -1
            ? {
                start: index,
                end: index + secret.length,
              }
            : null;
        })
        .filter((data: any) => !!data) as { start: number; end: number }[],
    ),
  };

  const session: _NotarizedSession = await new NotarizedSession(
    await prover.notarize(commit),
  );

  const proofHex = await session.proof(commit);
  const proof: ProofV1 = {
    version: '1.0',
    meta: {
      notaryUrl,
      websocketProxyUrl,
    },
    data: proofHex,
  };
  return proof;
}

function getCommitFromTranscript(
  transcript: {
    sent: string;
    recv: string;
    ranges: { recv: ParsedTranscriptData; sent: ParsedTranscriptData };
  },
  secretHeaders: string[],
  secretResps: string[],
) {
  const commit = {
    sent: subtractRanges(
      transcript.ranges.sent.all,
      secretHeaders
        .map((secret: string) => {
          const index = transcript.sent.indexOf(secret);
          return index > -1
            ? {
                start: index,
                end: index + secret.length,
              }
            : null;
        })
        .filter((data: any) => !!data) as {
        start: number;
        end: number;
      }[],
    ),
    recv: subtractRanges(
      transcript.ranges.recv.all,
      secretResps
        .map((secret: string) => {
          const index = transcript.recv.indexOf(secret);
          return index > -1
            ? {
                start: index,
                end: index + secret.length,
              }
            : null;
        })
        .filter((data: any) => !!data) as {
        start: number;
        end: number;
      }[],
    ),
  };

  return commit;
}

async function verifyProof(
  proof: Proof,
): Promise<{ sent: string; recv: string }> {
  let result: { sent: string; recv: string };

  switch (proof.version) {
    case undefined: {
      result = await verify(proof);
      break;
    }
    case '1.0': {
      const tlsProof: _TlsProof = await new TlsProof(proof.data);
      result = await tlsProof.verify({
        typ: 'P256',
        key: await NotaryServer.from(proof.meta.notaryUrl).publicKey(),
      });
      break;
    }
  }

  return result;
}
