import React, { useEffect } from 'react';
import * as Comlink from 'comlink';
import { OffscreenActionTypes } from './types';
import {
  NotaryServer,
  Prover as TProver,
  Verifier as TVerifier,
  Presentation as TPresentation,
  Transcript,
} from 'tlsn-js';
import { verify } from 'tlsn-js-v5';

import { urlify } from '../../utils/misc';
import { BackgroundActiontype } from '../Background/rpc';
import browser from 'webextension-polyfill';
import { PresentationJSON } from '../../utils/types';
import { PresentationJSON as PresentationJSONa7 } from 'tlsn-js/build/types';
import { Method } from 'tlsn-wasm';
import { subtractRanges } from './utils';
import { mapSecretsToRange } from '../Background/plugins/utils';
import { waitForEvent } from '../utils';
import type { ParsedTranscriptData } from 'tlsn-js/src/types';

const { init, Prover, Presentation, Verifier }: any = Comlink.wrap(
  new Worker(new URL('./worker.ts', import.meta.url)),
);

const provers: { [id: string]: TProver } = {};

const Offscreen = () => {
  useEffect(() => {
    const P2PProvers: Map<
      string,
      {
        prover: TProver;
        params: {
          pluginHash: string;
          url: string;
          method: Method;
          headers: { [name: string]: string };
          body?: any;
          proverUrl: string;
          websocketProxyUrl: string;
          maxRecvData: number;
          maxSentData: number;
          secretHeaders: string[];
          secretResps: string[];
        };
      }
    > = new Map();
    const P2PVerifier: Map<string, TVerifier> = new Map();

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
          case OffscreenActionTypes.create_prover_request: {
            const { id } = request.data;

            (async () => {
              try {
                const prover = await createProver(request.data);

                provers[id] = prover;

                browser.runtime.sendMessage({
                  type: OffscreenActionTypes.create_prover_response,
                  data: {
                    id,
                    transcript: await prover.transcript(),
                  },
                });
              } catch (error) {
                console.error(error);
                browser.runtime.sendMessage({
                  type: OffscreenActionTypes.create_prover_response,
                  data: {
                    id,
                    error,
                  },
                });
              }
            })();
            break;
          }
          case OffscreenActionTypes.create_presentation_request: {
            const { id, commit } = request.data;
            (async () => {
              const prover = provers[id];

              try {
                if (!prover) throw new Error(`Cannot find prover ${id}.`);

                const notarizationOutputs = await prover.notarize(commit);

                const presentation = (await new Presentation({
                  attestationHex: notarizationOutputs.attestation,
                  secretsHex: notarizationOutputs.secrets,
                  notaryUrl: notarizationOutputs.notaryUrl,
                  websocketProxyUrl: notarizationOutputs.websocketProxyUrl,
                  reveal: commit,
                })) as TPresentation;
                const presentationJSON = await presentation.json();

                browser.runtime.sendMessage({
                  type: BackgroundActiontype.finish_prove_request,
                  data: {
                    id,
                    proof: presentationJSON,
                  },
                });

                delete provers[id];
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
              const proof: PresentationJSON = request.data.proof;
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
              const {
                pluginHash,
                maxSentData,
                maxRecvData,
                verifierUrl,
                peerId,
              } = request.data;
              const verifier: TVerifier = await new Verifier({
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
              const prover: TProver = await new Prover({
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
}): Promise<PresentationJSONa7> {
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
  const prover: TProver = await new Prover({
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
      mapSecretsToRange(secretHeaders, transcript.sent),
    ),
    recv: subtractRanges(
      transcript.ranges.recv.all,
      mapSecretsToRange(secretResps, transcript.recv),
    ),
  };

  const notarizationOutputs = await prover.notarize(commit);

  const presentation = (await new Presentation({
    attestationHex: notarizationOutputs.attestation,
    secretsHex: notarizationOutputs.secrets,
    notaryUrl: notarizationOutputs.notaryUrl,
    websocketProxyUrl: notarizationOutputs.websocketProxyUrl,
    reveal: commit,
  })) as TPresentation;

  return presentation.json();
}

async function createProver(options: {
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
}): Promise<TProver> {
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
  } = options;

  const hostname = urlify(url)?.hostname || '';
  const notary = NotaryServer.from(notaryUrl);
  const prover: TProver = await new Prover({
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

  return prover;
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
  proof: PresentationJSON,
): Promise<{ sent: string; recv: string }> {
  let result: { sent: string; recv: string };

  switch (proof.version) {
    case undefined: {
      result = await verify(proof);
      break;
    }
    case '0.1.0-alpha.7': {
      const presentation: TPresentation = await new Presentation(proof.data);
      const verifierOutput = await presentation.verify();
      const transcript = new Transcript({
        sent: verifierOutput.transcript.sent,
        recv: verifierOutput.transcript.recv,
      });
      result = {
        sent: transcript.sent(),
        recv: transcript.recv(),
      };
      break;
    }
  }

  return result;
}
