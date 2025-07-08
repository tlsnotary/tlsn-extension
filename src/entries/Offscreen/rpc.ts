import browser from 'webextension-polyfill';
import {
  BackgroundActiontype,
  progressText,
  RequestProgress,
} from '../Background/rpc';
import {
  mapStringToRange,
  NotaryServer,
  Method,
  Presentation as TPresentation,
  Prover as TProver,
  subtractRanges,
  Transcript,
  Verifier as TVerifier,
} from 'tlsn-js';
import { convertNotaryWsToHttp, devlog, urlify } from '../../utils/misc';
import * as Comlink from 'comlink';
import { OffscreenActionTypes } from './types';
import { PresentationJSON } from 'tlsn-js/build/types';
import { waitForEvent } from '../utils';
import {
  setNotaryRequestError,
  setNotaryRequestStatus,
} from '../Background/db';

const { init, Prover, Presentation, Verifier }: any = Comlink.wrap(
  new Worker(new URL('./worker.ts', import.meta.url)),
);

const provers: { [id: string]: TProver } = {};

export const initThreads = async () => {
  const loggingLevel = await browser.runtime.sendMessage({
    type: BackgroundActiontype.get_logging_level,
    hardwareConcurrency: navigator.hardwareConcurrency,
  });
  await init({
    loggingLevel,
    hardwareConcurrency: navigator.hardwareConcurrency,
  });
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
  const { id, commit, notaryUrl, websocketProxyUrl } = request.data;
  const prover = provers[id];

  try {
    if (!prover) throw new Error(`Cannot find prover ${id}.`);

    updateRequestProgress(id, RequestProgress.FinalizingOutputs);
    const notarizationOutputs = await prover.reveal({
      ...commit,
      server_identity: true,
    });

    console.log('notarizationOutputs', notarizationOutputs);
    // const presentation = (await new Presentation({
    //   attestationHex: notarizationOutputs.attestation,
    //   secretsHex: notarizationOutputs.secrets,
    //   notaryUrl: notarizationOutputs.notaryUrl,
    //   websocketProxyUrl: notarizationOutputs.websocketProxyUrl,
    //   reveal: { ...commit, server_identity: false },
    // })) as TPresentation;
    // const json = await presentation.json();
    // browser.runtime.sendMessage({
    //   type: BackgroundActiontype.finish_prove_request,
    //   data: {
    //     id,
    //     proof: {
    //       ...json,
    //     },
    //   },
    // });

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
  const result: {
    sent: string;
    recv: string;
    verifierKey?: string;
    notaryKey?: string;
  } = await verifyProof(proof);

  chrome.runtime.sendMessage<any, string>({
    type: BackgroundActiontype.finish_prove_request,
    data: {
      id: request.data.id,
      verification: {
        sent: result.sent,
        recv: result.recv,
        verifierKey: result.verifierKey,
        notaryKey: result.notaryKey,
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
    pluginUrl,
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
    id: pluginUrl,
    serverDns: hostname,
    maxSentData,
    maxRecvData,
  });

  browser.runtime.sendMessage({
    type: BackgroundActiontype.prover_instantiated,
    data: {
      pluginUrl,
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
      pluginUrl,
    },
  });

  await proverSetup;
  browser.runtime.sendMessage({
    type: BackgroundActiontype.prover_started,
    data: {
      pluginUrl,
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
        pluginUrl,
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
      { start: 0, end: transcript.sent.length },
      mapStringToRange(
        secretHeaders,
        Buffer.from(transcript.sent).toString('utf-8'),
      ),
    ),
    recv: subtractRanges(
      { start: 0, end: transcript.recv.length },
      mapStringToRange(
        secretResps,
        Buffer.from(transcript.recv).toString('utf-8'),
      ),
    ),
  };

  const endRequest = waitForEvent(OffscreenActionTypes.end_p2p_proof_request);
  await prover.reveal({ ...commit, server_identity: false });
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
}): Promise<PresentationJSON> {
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
  const resp = await fetch(`${notaryUrl}/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientType: 'Websocket',
      maxRecvData,
      maxSentData,
      plugin: 'plugin_rs',
    }),
  });
  const { sessionId } = await resp.json();
  const sessionUrl = `${notaryUrl}/notarize?sessionId=${sessionId}`;
  console.log('sessionUrl', sessionUrl);
  // const sessionUrl = await notary.sessionUrl(maxSentData, maxRecvData);

  updateRequestProgress(id, RequestProgress.SettingUpProver);
  await prover.setup(sessionUrl);

  await handleProgress(
    id,
    RequestProgress.SendingRequest,
    () =>
      prover.sendRequest(websocketProxyUrl + `?token=${hostname}`, {
        url,
        method,
        headers,
        body,
      }),
    `Error connecting to websocket proxy: ${websocketProxyUrl}. Please check the proxy URL and ensure it's accessible.`,
  );

  updateRequestProgress(id, RequestProgress.ReadingTranscript);
  const transcript = await prover.transcript();

  const commit = {
    sent: subtractRanges(
      { start: 0, end: transcript.sent.length },
      mapStringToRange(
        secretHeaders,
        Buffer.from(transcript.sent).toString('utf-8'),
      ),
    ),
    recv: subtractRanges(
      { start: 0, end: transcript.recv.length },
      mapStringToRange(
        secretResps,
        Buffer.from(transcript.recv).toString('utf-8'),
      ),
    ),
  };

  updateRequestProgress(id, RequestProgress.FinalizingOutputs);
  const notarizationOutputs = await prover.notarize(commit);

  const presentation = (await new Presentation({
    attestationHex: notarizationOutputs.attestation,
    secretsHex: notarizationOutputs.secrets,
    notaryUrl: notarizationOutputs.notaryUrl,
    websocketProxyUrl: notarizationOutputs.websocketProxyUrl,
    reveal: { ...commit, server_identity: false },
  })) as TPresentation;

  const json = await presentation.json();
  return {
    ...json,
  };
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
    const prover: TProver = await handleProgress(
      id,
      RequestProgress.CreatingProver,
      () =>
        new Prover({
          id,
          serverDns: hostname,
          maxSentData,
          maxRecvData,
          serverIdentity: false,
        }),
      'Error creating prover',
    );

    const sessionUrl = await handleProgress(
      id,
      RequestProgress.GettingSession,
      async () => {
        const resp = await fetch(`${notaryUrl}/session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            clientType: 'Websocket',
            maxRecvData,
            maxSentData,
            plugin: 'plugin_rs',
          }),
        });
        const { sessionId } = await resp.json();

        const url = new URL(notaryUrl);
        const protocol = url.protocol === 'https:' ? 'wss' : 'ws';
        const pathname = url.pathname;
        console.log(
          'sessionId',
          `${protocol}://${url.host}${pathname === '/' ? '' : pathname}/notarize?sessionId=${sessionId!}`,
        );
        return `${protocol}://${url.host}${pathname === '/' ? '' : pathname}/notarize?sessionId=${sessionId!}`;
      },
      'Error getting session from Notary',
    );

    await handleProgress(
      id,
      RequestProgress.SettingUpProver,
      () => prover.setup(sessionUrl),
      'Error setting up prover',
    );

    await handleProgress(
      id,
      RequestProgress.SendingRequest,
      () =>
        prover.sendRequest(websocketProxyUrl + `?token=${hostname}`, {
          url,
          method,
          headers,
          body,
        }),
      `Error connecting to websocket proxy: ${websocketProxyUrl}. Please check the proxy URL and ensure it's accessible.`,
    );

    return prover;
  } catch (error) {
    throw error;
  }
}

async function verifyProof(proof: PresentationJSON): Promise<{
  sent: string;
  recv: string;
  verifierKey?: string;
  notaryKey?: string;
}> {
  let result: {
    sent: string;
    recv: string;
    verifierKey?: string;
    notaryKey?: string;
  };

  switch (proof.version) {
    case '0.1.0-alpha.12':
      result = await verify(proof);
      break;
    default:
      result = {
        sent: 'version not supported',
        recv: 'version not supported',
      };
      break;
  }

  return result!;
}

async function verify(proof: PresentationJSON) {
  if (proof.version !== '0.1.0-alpha.12') {
    throw new Error('wrong version');
  }
  const presentation: TPresentation = await new Presentation(proof.data);
  const verifierOutput = await presentation.verify();
  const transcript = new Transcript({
    sent: verifierOutput.transcript?.sent || [],
    recv: verifierOutput.transcript?.recv || [],
  });
  const vk = await presentation.verifyingKey();
  const verifyingKey = Buffer.from(vk.data).toString('hex');
  const notaryUrl = proof.meta.notaryUrl
    ? convertNotaryWsToHttp(proof.meta.notaryUrl)
    : '';
  const publicKey = await new NotaryServer(notaryUrl)
    .publicKey()
    .catch(() => '');
  return {
    sent: transcript.sent(),
    recv: transcript.recv(),
    verifierKey: verifyingKey,
    notaryKey: publicKey,
  };
}

function updateRequestProgress(
  id: string,
  progress: RequestProgress,
  errorMessage?: string,
) {
  const progressMessage =
    progress === RequestProgress.Error
      ? `${errorMessage || 'Notarization Failed'}`
      : progressText(progress);
  devlog(`Request ${id}: ${progressMessage}`);

  browser.runtime.sendMessage({
    type: BackgroundActiontype.update_request_progress,
    data: {
      id,
      progress,
      errorMessage,
    },
  });
}

function getWebsocketErrorMessage(
  lowerError: string,
  fallbackMessage: string,
): string {
  const isWebsocketError =
    lowerError.includes('websocket') ||
    lowerError.includes('proxy') ||
    lowerError.includes('connection') ||
    lowerError.includes('network') ||
    lowerError.includes('prover error') ||
    lowerError.includes('io error') ||
    lowerError.includes('certificate') ||
    lowerError.includes('cert') ||
    lowerError.includes('ssl') ||
    lowerError.includes('tls');

  if (!isWebsocketError) {
    return fallbackMessage;
  }

  const errorPatterns = [
    {
      patterns: ['protocol', 'must use ws://', 'must use wss://'],
      message:
        'Invalid websocket proxy URL protocol. Please use ws:// or wss:// protocol in your websocket proxy URL settings.',
    },
    {
      patterns: [
        'not allowed',
        'not whitelisted',
        'forbidden',
        'unauthorized',
        'permission denied',
        'access denied',
      ],
      message:
        'Target domain not allowed by websocket proxy. Please check if the website domain is supported by your proxy service.',
    },
    {
      patterns: ['dns', 'resolve'],
      message:
        'Cannot resolve websocket proxy domain. Please check your websocket proxy URL in settings.',
    },
    {
      patterns: ['timeout'],
      message:
        'Websocket proxy connection timeout. Please check your websocket proxy URL in settings and ensure the server is accessible.',
    },
    {
      patterns: ['refused', 'unreachable'],
      message:
        'Cannot reach websocket proxy server. Please check your websocket proxy URL in settings and ensure the server is accessible.',
    },
    {
      patterns: ['cert', 'certificate', 'certnotvalidforname'],
      message:
        'Cannot connect to websocket proxy server. Please check your websocket proxy URL in settings and ensure it points to a valid websocket proxy service.',
    },
  ];

  for (const { patterns, message } of errorPatterns) {
    if (patterns.some((pattern) => lowerError.includes(pattern))) {
      return message;
    }
  }

  return 'Websocket proxy connection failed. Please check your websocket proxy URL in settings and ensure the server is accessible.';
}

async function handleProgress<T>(
  id: string,
  progress: RequestProgress,
  action: () => Promise<T>,
  errorMessage: string,
): Promise<T> {
  try {
    updateRequestProgress(id, progress);
    return await action();
  } catch (error: any) {
    const specificError = error?.message || '';
    const lowerError = specificError.toLowerCase();

    const finalErrorMessage = getWebsocketErrorMessage(
      lowerError,
      errorMessage,
    );

    updateRequestProgress(id, RequestProgress.Error, finalErrorMessage);
    await setNotaryRequestStatus(id, 'error');
    await setNotaryRequestError(id, finalErrorMessage);
    throw error;
  }
}
