import { devlog, safeParseJSON, sha256 } from '../../utils/misc';
import {
  appendIncomingPairingRequests,
  appendIncomingProofRequests,
  appendOutgoingPairingRequests,
  appendOutgoingProofRequest,
  setClientId,
  setConnected,
  setIncomingPairingRequest,
  setIncomingProofRequest,
  setIsProving,
  setIsVerifying,
  setOutgoingPairingRequest,
  setOutgoingProofRequest,
  setP2PError,
  setP2PPresentation,
  setPairing,
} from '../../reducers/p2p';
import { pushToRedux } from '../utils';
import { getPluginByUrl } from './db';
import browser from 'webextension-polyfill';
import { OffscreenActionTypes } from '../Offscreen/types';
import { getMaxRecv, getMaxSent, getRendezvousApi } from '../../utils/storage';
import { SidePanelActionTypes } from '../SidePanel/types';
import { Transcript, VerifierOutput } from 'tlsn-js';

const state: {
  clientId: string;
  pairing: string;
  socket: WebSocket | null;
  connected: boolean;
  reqId: number;
  incomingPairingRequests: string[];
  outgoingPairingRequests: string[];
  incomingProofRequests: string[];
  outgoingProofRequests: string[];
  isProving: boolean;
  isVerifying: boolean;
  presentation: null | { sent: string; recv: string };
} = {
  clientId: '',
  pairing: '',
  socket: null,
  connected: false,
  reqId: 0,
  incomingPairingRequests: [],
  outgoingPairingRequests: [],
  incomingProofRequests: [],
  outgoingProofRequests: [],
  isProving: false,
  isVerifying: false,
  presentation: null,
};

export const getP2PState = async () => {
  pushToRedux(setPairing(state.pairing));
  pushToRedux(setConnected(state.connected));
  pushToRedux(setClientId(state.clientId));
  pushToRedux(setIncomingPairingRequest(state.incomingPairingRequests));
  pushToRedux(setOutgoingPairingRequest(state.outgoingPairingRequests));
  pushToRedux(setIncomingProofRequest(state.incomingProofRequests));
  pushToRedux(setOutgoingProofRequest(state.outgoingProofRequests));
  pushToRedux(setIsProving(state.isProving));
  pushToRedux(setIsVerifying(state.isVerifying));
  pushToRedux(setP2PPresentation(state.presentation));
};

export const connectSession = async () => {
  if (state.socket) return;

  const rendezvousAPI = await getRendezvousApi();

  try {
    const url = new URL(rendezvousAPI);
    if (!url.protocol.startsWith('ws')) {
      throw new Error(
        'Invalid websocket URL: must use ws:// or wss:// protocol',
      );
    }
  } catch (error) {
    console.error('Invalid rendezvous API URL:', error);
    pushToRedux(setP2PError(`Invalid rendezvous server URL: ${rendezvousAPI}`));
    return;
  }

  let socket: WebSocket;
  try {
    socket = new WebSocket(rendezvousAPI);
  } catch (error) {
    console.error('Failed to create WebSocket:', error);
    pushToRedux(
      setP2PError(`Failed to connect to rendezvous server: ${error}`),
    );
    return;
  }

  socket.onopen = () => {
    devlog('Connected to websocket');
    state.connected = true;
    state.socket = socket;
    pushToRedux(setConnected(true));
    const heartbeatInterval = setInterval(() => {
      if (socket.readyState === 1) {
        // Check if connection is open
        socket.send(bufferify({ method: 'ping' }));
      } else {
        disconnectSession();
        clearInterval(heartbeatInterval); // Stop heartbeat if connection is closed
      }
    }, 55000);
  };

  socket.onmessage = async (event) => {
    const message: any = safeParseJSON(await event.data.text());

    if (message.error) {
      pushToRedux(setP2PError(message.error.message));
      return;
    }

    switch (message.method) {
      case 'client_connect': {
        const { clientId } = message.params;
        state.clientId = clientId;
        pushToRedux(setClientId(clientId));
        break;
      }
      case 'pair_request': {
        const { from } = message.params;
        state.incomingPairingRequests = [
          ...new Set(state.incomingPairingRequests.concat(from)),
        ];
        pushToRedux(appendIncomingPairingRequests(from));
        sendMessage(from, 'pair_request_sent', { pairId: state.clientId });
        break;
      }
      case 'pair_request_sent': {
        const { pairId } = message.params;
        state.outgoingPairingRequests = [
          ...new Set(state.outgoingPairingRequests.concat(pairId)),
        ];
        pushToRedux(appendOutgoingPairingRequests(pairId));
        break;
      }
      case 'pair_request_cancel': {
        const { from } = message.params;
        state.incomingPairingRequests = state.incomingPairingRequests.filter(
          (id) => id !== from,
        );
        pushToRedux(setIncomingPairingRequest(state.incomingPairingRequests));
        sendMessage(from, 'pair_request_cancelled', { pairId: state.clientId });
        break;
      }
      case 'pair_request_cancelled': {
        const { pairId } = message.params;
        state.outgoingPairingRequests = state.outgoingPairingRequests.filter(
          (id) => id !== pairId,
        );
        pushToRedux(setOutgoingPairingRequest(state.outgoingPairingRequests));
        break;
      }
      case 'pair_request_reject': {
        const { from } = message.params;
        state.outgoingPairingRequests = state.outgoingPairingRequests.filter(
          (id) => id !== from,
        );
        pushToRedux(setOutgoingPairingRequest(state.outgoingPairingRequests));
        sendMessage(from, 'pair_request_rejected', { pairId: state.clientId });
        break;
      }
      case 'pair_request_accept': {
        const { from } = message.params;
        state.pairing = from;
        state.outgoingPairingRequests = state.outgoingPairingRequests.filter(
          (id) => id !== from,
        );
        pushToRedux(setOutgoingPairingRequest(state.outgoingPairingRequests));
        pushToRedux(setPairing(from));
        sendMessage(from, 'pair_request_success', { pairId: state.clientId });
        break;
      }
      case 'pair_request_success': {
        const { pairId } = message.params;
        state.pairing = pairId;
        pushToRedux(setPairing(pairId));
        state.incomingPairingRequests = state.incomingPairingRequests.filter(
          (id) => id !== pairId,
        );
        pushToRedux(setIncomingPairingRequest(state.incomingPairingRequests));
        break;
      }
      case 'pair_request_rejected': {
        const { pairId } = message.params;
        state.incomingPairingRequests = state.incomingPairingRequests.filter(
          (id) => id !== pairId,
        );
        pushToRedux(setIncomingPairingRequest(state.incomingPairingRequests));
        break;
      }
      case 'request_proof': {
        const { plugin, pluginHash, from } = message.params;
        state.incomingProofRequests = [
          ...new Set(state.incomingProofRequests.concat(plugin)),
        ];
        pushToRedux(appendIncomingProofRequests(plugin));
        sendMessage(from, 'proof_request_received', { pluginHash });
        break;
      }
      case 'request_proof_by_hash': {
        const { pluginHash, from } = message.params;
        const plugin = await getPluginByUrl(pluginHash);
        if (plugin) {
          state.incomingProofRequests = [
            ...new Set(state.incomingProofRequests.concat(plugin)),
          ];
          pushToRedux(appendIncomingProofRequests(plugin));
          sendMessage(from, 'proof_request_received', { pluginHash });
        } else {
          sendMessage(from, 'request_proof_by_hash_failed', { pluginHash });
        }
        break;
      }
      case 'request_proof_by_hash_failed': {
        const { pluginHash } = message.params;
        requestProof(pluginHash);
        break;
      }
      case 'proof_request_received': {
        const { pluginHash } = message.params;
        state.outgoingProofRequests = [
          ...new Set(state.outgoingProofRequests.concat(pluginHash)),
        ];
        pushToRedux(appendOutgoingProofRequest(pluginHash));
        break;
      }
      case 'proof_request_cancelled':
        await handleRemoveOutgoingProofRequest(message);
        break;
      case 'proof_request_reject': {
        const { pluginHash, from } = message.params;
        await handleRemoveOutgoingProofRequest(message);
        sendMessage(from, 'proof_request_rejected', { pluginHash });
        break;
      }
      case 'proof_request_cancel': {
        const { pluginHash, from } = message.params;
        await handleRemoveIncomingProofRequest(message);
        sendMessage(from, 'proof_request_cancelled', { pluginHash });
        break;
      }
      case 'proof_request_rejected':
        await handleRemoveIncomingProofRequest(message);
        break;
      case 'proof_request_accept': {
        const { pluginHash, from } = message.params;
        const maxSentData = await getMaxSent();
        const maxRecvData = await getMaxRecv();
        const rendezvousApi = await getRendezvousApi();
        browser.runtime.sendMessage({
          type: OffscreenActionTypes.start_p2p_verifier,
          data: {
            pluginHash,
            maxSentData,
            maxRecvData,
            verifierUrl:
              rendezvousApi + '?clientId=' + state.clientId + ':proof',
            peerId: state.pairing,
          },
        });
        state.isVerifying = true;
        pushToRedux(setIsVerifying(true));
        break;
      }
      case 'verifier_started': {
        const { pluginHash } = message.params;
        browser.runtime.sendMessage({
          type: SidePanelActionTypes.start_p2p_plugin,
          data: {
            pluginHash: pluginHash,
          },
        });
        break;
      }
      case 'prover_setup': {
        const { pluginHash } = message.params;
        browser.runtime.sendMessage({
          type: OffscreenActionTypes.prover_setup,
          data: {
            pluginHash: pluginHash,
          },
        });
        break;
      }
      case 'prover_started': {
        const { pluginHash } = message.params;
        browser.runtime.sendMessage({
          type: OffscreenActionTypes.prover_started,
          data: {
            pluginHash: pluginHash,
          },
        });
        break;
      }
      case 'proof_request_start': {
        const { pluginHash, from } = message.params;
        browser.runtime.sendMessage({
          type: OffscreenActionTypes.start_p2p_proof_request,
          data: {
            pluginHash: pluginHash,
          },
        });
        break;
      }
      case 'proof_request_end': {
        const { pluginHash, proof } = message.params;
        const transcript = new Transcript({
          sent: proof.transcript.sent,
          recv: proof.transcript.recv,
        });

        state.presentation = {
          sent: transcript.sent(),
          recv: transcript.recv(),
        };

        pushToRedux(setP2PPresentation(state.presentation));

        browser.runtime.sendMessage({
          type: OffscreenActionTypes.end_p2p_proof_request,
          data: {
            pluginHash: pluginHash,
            proof: proof,
          },
        });
        break;
      }
      default:
        console.warn(`Unknown message type "${message.method}"`);
        break;
    }
  };
  socket.onerror = (error) => {
    console.error('Error connecting to websocket:', error);
    pushToRedux(setConnected(false));
    pushToRedux(
      setP2PError(
        'Failed to connect to rendezvous server. Please check your connection and server URL.',
      ),
    );
  };

  socket.onclose = (event) => {
    console.log('WebSocket connection closed:', event.code, event.reason);
    pushToRedux(setConnected(false));
    if (event.code !== 1000 && event.code !== 1001) {
      pushToRedux(
        setP2PError(
          `WebSocket connection lost: ${event.reason || 'Unknown error'}`,
        ),
      );
    }
  };
};

async function handleRemoveOutgoingProofRequest(message: {
  params: { pluginHash: string };
}) {
  const { pluginHash } = message.params;
  state.outgoingProofRequests = state.outgoingProofRequests.filter(
    (hash) => hash !== pluginHash,
  );
  pushToRedux(setOutgoingProofRequest(state.outgoingProofRequests));
}

async function handleRemoveIncomingProofRequest(message: {
  params: { pluginHash: string };
}) {
  const { pluginHash } = message.params;
  const plugin = await getPluginByUrl(pluginHash);
  const incomingProofRequest = [];
  for (const hex of state.incomingProofRequests) {
    if (plugin) {
      if (plugin !== hex) incomingProofRequest.push(hex);
    } else {
      if ((await sha256(hex)) !== pluginHash) incomingProofRequest.push(hex);
    }
  }

  state.incomingProofRequests = incomingProofRequest;
  pushToRedux(setIncomingProofRequest(state.incomingProofRequests));
}

export const disconnectSession = async () => {
  if (!state.socket) return;
  const socket = state.socket;
  state.socket = null;
  state.clientId = '';
  state.pairing = '';
  state.connected = false;
  state.incomingPairingRequests = [];
  state.outgoingPairingRequests = [];
  state.incomingProofRequests = [];
  state.outgoingProofRequests = [];
  state.isProving = false;
  state.isVerifying = false;
  state.presentation = null;
  pushToRedux(setPairing(''));
  pushToRedux(setConnected(false));
  pushToRedux(setClientId(''));
  pushToRedux(setIncomingPairingRequest([]));
  pushToRedux(setOutgoingPairingRequest([]));
  pushToRedux(setIncomingProofRequest([]));
  pushToRedux(setOutgoingProofRequest([]));
  pushToRedux(setIsProving(false));
  pushToRedux(setIsVerifying(false));
  pushToRedux(setP2PPresentation(null));
  await socket.close();
};

export async function sendMessage(
  target: string,
  method: string,
  params?: any,
) {
  const { socket, clientId } = state;

  if (clientId === target) {
    console.error('client cannot send message to itself.');
    return;
  }

  if (!socket) {
    console.error('socket connection not found.');
    return;
  }

  if (!clientId) {
    console.error('clientId not found.');
    return;
  }

  socket.send(
    bufferify({
      method,
      params: {
        from: clientId,
        to: target,
        id: state.reqId++,
        ...params,
      },
    }),
  );
}

export async function sendPairedMessage(method: string, params?: any) {
  const { pairing } = state;

  if (!pairing) {
    console.error('not paired to a peer.');
    return;
  }

  sendMessage(pairing, method, params);
}

export const requestProof = async (pluginHash: string) => {
  const pluginHex = await getPluginByUrl(pluginHash);
  sendPairedMessage('request_proof', {
    plugin: pluginHex,
    pluginHash,
  });
};

export const endProofRequest = async (data: {
  pluginHash: string;
  proof: VerifierOutput;
}) => {
  const transcript = new Transcript({
    sent: data.proof.transcript?.sent || [],
    recv: data.proof.transcript?.recv || [],
  });

  state.presentation = {
    sent: transcript.sent(),
    recv: transcript.recv(),
  };

  pushToRedux(setP2PPresentation(state.presentation));

  sendPairedMessage('proof_request_end', {
    pluginHash: data.pluginHash,
    proof: data.proof,
  });
};

export const onProverInstantiated = async () => {
  state.isProving = true;
  pushToRedux(setIsProving(true));
};

function bufferify(data: any): Buffer {
  return Buffer.from(JSON.stringify(data));
}
