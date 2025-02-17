import browser from 'webextension-polyfill';
import {
  BackgroundActiontype,
  progressText,
  RequestProgress,
} from '../Background/rpc';
import { Method } from 'tlsn-wasm';
import {
  NotaryServer,
  Presentation as TPresentation,
  Prover as TProver,
  Transcript,
  Verifier as TVerifier,
} from 'tlsn-js';
import { devlog, urlify } from '../../utils/misc';
import * as Comlink from 'comlink';
import { PresentationJSON as PresentationJSONa7 } from 'tlsn-js/build/types';
import { subtractRanges } from './utils';
import { mapSecretsToRange } from '../Background/plugins/utils';
import { OffscreenActionTypes } from './types';
import { PresentationJSON } from '../../utils/types';
import { verify } from 'tlsn-js-v5';
import { waitForEvent } from '../utils';

const { init, Prover, Presentation, Verifier }: any = Comlink.wrap(
  new Worker(new URL('./worker.ts', import.meta.url)),
);

const provers: { [id: string]: TProver } = {};

export const initThreads = async () => {
  const loggingLevel = await browser.runtime.sendMessage({
    type: BackgroundActiontype.get_logging_level,
    hardwareConcurrency: navigator.hardwareConcurrency,
  });
  await init({ loggingLevel });
};
export const onNotarizationRequest = async (request: any) => {
  const { id } = request.data;

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
  } catch (error: any) {
    console.error(error);
    browser.runtime.sendMessage({
      type: BackgroundActiontype.finish_prove_request,
      data: {
        id,
        error: error?.message || 'Unknown error',
      },
    });

    browser.runtime.sendMessage({
      type: OffscreenActionTypes.notarization_response,
      data: {
        id,
        error: error?.message || 'Unknown error',
      },
    });
  }
};

export const onCreateProverRequest = async (request: any) => {
  const { id } = request.data;

  try {
    const prover = await createProver(request.data);

    provers[id] = prover;

    updateRequestProgress(id, RequestProgress.ReadingTranscript);
    browser.runtime.sendMessage({
      type: OffscreenActionTypes.create_prover_response,
      data: {
        id,
        transcript: await prover.transcript(),
      },
    });
  } catch (error: any) {
    console.error(error);
    browser.runtime.sendMessage({
      type: OffscreenActionTypes.create_prover_response,
      data: {
        id,
        error: error?.message || 'Unknown error',
      },
    });
  }
};

export const onCreatePresentationRequest = async (request: any) => {
  const { id, commit } = request.data;
  const prover = provers[id];

  try {
    if (!prover) throw new Error(`Cannot find prover ${id}.`);

    updateRequestProgress(id, RequestProgress.FinalizingOutputs);
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
  } catch (error: any) {
    console.error(error);
    browser.runtime.sendMessage({
      type: BackgroundActiontype.finish_prove_request,
      data: {
        id,
        error: error?.message || 'Unknown error',
      },
    });
  }
};

export const onProcessProveRequest = async (request: any) => {
  const { id } = request.data;

  try {
    const proof = await createProof(request.data);

    browser.runtime.sendMessage({
      type: BackgroundActiontype.finish_prove_request,
      data: {
        id,
        proof: proof,
      },
    });
  } catch (error: any) {
    console.error(error);
    browser.runtime.sendMessage({
      type: BackgroundActiontype.finish_prove_request,
      data: {
        id,
        error: error?.message || 'Unknown error',
      },
    });
  }
};

export const onVerifyProof = async (request: any, sendResponse: any) => {
  const result = await verifyProof(request.data);
  sendResponse(result);
};

export const onVerifyProofRequest = async (request: any) => {
  const proof: PresentationJSON = request.data.proof;
  const result: { sent: string; recv: string } = await verifyProof(proof);

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
};

export const startP2PVerifier = async (request: any) => {
  const { pluginHash, maxSentData, maxRecvData, verifierUrl } = request.data;
  const verifier: TVerifier = await new Verifier({
    id: pluginHash,
    maxSentData: maxSentData,
    maxRecvData: maxRecvData,
  });

  await verifier.connect(verifierUrl);
  const proverStarted = waitForEvent(OffscreenActionTypes.prover_started);

  browser.runtime.sendMessage({
    type: BackgroundActiontype.verifier_started,
    data: {
      pluginHash,
    },
  });

  await waitForEvent(OffscreenActionTypes.prover_setup);

  verifier.verify().then((res) => {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.proof_request_end,
      data: {
        pluginHash,
        proof: res,
      },
    });
  });

  await proverStarted;

  browser.runtime.sendMessage({
    type: BackgroundActiontype.start_proof_request,
    data: {
      pluginHash,
    },
  });
};

export const startP2PProver = async (request: any) => {
  const {
    pluginHash,
    pluginHex,
    url,
    method,
    headers,
    body,
    proverUrl,
    websocketProxyUrl,
    maxRecvData,
    maxSentData,
    secretHeaders,
    getSecretResponse,
  } = request.data;

  const hostname = urlify(url)?.hostname || '';

  const prover: TProver = await new Prover({
    id: pluginHash,
    serverDns: hostname,
    maxSentData,
    maxRecvData,
  });

  browser.runtime.sendMessage({
    type: BackgroundActiontype.prover_instantiated,
    data: {
      pluginHash,
    },
  });

  const proofRequestStart = waitForEvent(
    OffscreenActionTypes.start_p2p_proof_request,
  );

  const proverSetup = prover.setup(proverUrl);
  await new Promise((r) => setTimeout(r, 5000));
  browser.runtime.sendMessage({
    type: BackgroundActiontype.prover_setup,
    data: {
      pluginHash,
    },
  });

  await proverSetup;
  browser.runtime.sendMessage({
    type: BackgroundActiontype.prover_started,
    data: {
      pluginHash,
    },
  });
  await proofRequestStart;
  await prover.sendRequest(websocketProxyUrl + `?token=${hostname}`, {
    url,
    method,
    headers,
    body,
  });

  const transcript = await prover.transcript();

  let secretResps: string[] = [];

  if (getSecretResponse) {
    browser.runtime.sendMessage({
      type: BackgroundActiontype.get_secrets_from_transcript,
      data: {
        pluginHash,
        pluginHex,
        method: getSecretResponse,
        transcript,
        p2p: true,
      },
    });

    const msg: any = await waitForEvent(
      OffscreenActionTypes.get_secrets_from_transcript_success,
    );

    secretResps = msg.data.secretResps;
  }

  const commit = {
    sent: subtractRanges(
      transcript.ranges.sent.all,
      mapSecretsToRange(secretHeaders, transcript.sent),
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

  const endRequest = waitForEvent(OffscreenActionTypes.end_p2p_proof_request);
  await prover.reveal(commit);
  await endRequest;
};

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

  updateRequestProgress(id, RequestProgress.CreatingProver);
  const prover: TProver = await new Prover({
    id,
    serverDns: hostname,
    maxSentData,
    maxRecvData,
  });

  updateRequestProgress(id, RequestProgress.GettingSession);
  const sessionUrl = await notary.sessionUrl(maxSentData, maxRecvData);

  updateRequestProgress(id, RequestProgress.SettingUpProver);
  await prover.setup(sessionUrl);

  updateRequestProgress(id, RequestProgress.SendingRequest);
  await prover.sendRequest(websocketProxyUrl + `?token=${hostname}`, {
    url,
    method,
    headers,
    body,
  });

  updateRequestProgress(id, RequestProgress.ReadingTranscript);
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

  updateRequestProgress(id, RequestProgress.FinalizingOutputs);
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
  try {
    updateRequestProgress(id, RequestProgress.CreatingProver);
    const prover: TProver = await new Prover({
      id,
      serverDns: hostname,
      maxSentData,
      maxRecvData,
    });

    updateRequestProgress(id, RequestProgress.GettingSession);
    const sessionUrl = await notary.sessionUrl(maxSentData, maxRecvData);

    updateRequestProgress(id, RequestProgress.SettingUpProver);
    await prover.setup(sessionUrl);

    updateRequestProgress(id, RequestProgress.SendingRequest);
    await prover.sendRequest(websocketProxyUrl + `?token=${hostname}`, {
      url,
      method,
      headers,
      body,
    });

    return prover;
  } catch (error: any) {
    updateRequestProgress(id, RequestProgress.Error);
    throw error;
  }
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

function updateRequestProgress(id: string, progress: RequestProgress) {
  devlog(`Request ${id}: ${progressText(progress)}`);
  browser.runtime.sendMessage({
    type: BackgroundActiontype.update_request_progress,
    data: {
      id,
      progress: progress,
    },
  });
}
