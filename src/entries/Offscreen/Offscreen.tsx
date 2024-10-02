import React, { useEffect } from 'react';
import * as Comlink from 'comlink';
import { OffscreenActionTypes } from './types';
import {
  NotaryServer,
  Prover as TProver,
  Presentation as TPresentation,
  Transcript,
} from 'tlsn-js';
import { verify } from 'tlsn-js-v5';

import { urlify } from '../../utils/misc';
import { BackgroundActiontype } from '../Background/rpc';
import browser from 'webextension-polyfill';
import { Proof, ProofV1 } from '../../utils/types';
import { Method } from 'tlsn-js/wasm/pkg';

const { init, Prover, Presentation }: any = Comlink.wrap(
  new Worker(new URL('./worker.ts', import.meta.url)),
);

const Offscreen = () => {
  useEffect(() => {
    (async () => {
      const loggingLevel = await browser.runtime.sendMessage({
        type: BackgroundActiontype.get_logging_level,
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

  const notarizationOutputs = await prover.notarize(commit);

  const presentation = (await new Presentation({
    attestationHex: notarizationOutputs.attestation,
    secretsHex: notarizationOutputs.secrets,
    reveal: commit,
  })) as TPresentation;
  const presentationHex = await presentation.serialize();

  const proof: ProofV1 = {
    version: '1.0',
    meta: {
      notaryUrl,
      websocketProxyUrl,
    },
    data: presentationHex,
  };
  return proof;
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
