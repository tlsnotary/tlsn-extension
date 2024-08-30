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
  setOutgoingPairingRequest,
  setOutgoingProofRequest,
  setP2PError,
  setPairing,
} from '../../reducers/p2p';
import { pushToRedux } from '../utils';
import { getPluginByHash } from './db';
import browser from 'webextension-polyfill';
import { OffscreenActionTypes } from '../Offscreen/types';
import { getMaxRecv, getMaxSent, getRendezvousApi } from '../../utils/storage';

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
};

export const getP2PState = async () => {
  pushToRedux(setPairing(state.pairing));
  pushToRedux(setConnected(state.connected));
  pushToRedux(setClientId(state.clientId));
  pushToRedux(setIncomingPairingRequest(state.incomingPairingRequests));
  pushToRedux(setOutgoingPairingRequest(state.outgoingPairingRequests));
  pushToRedux(setIncomingProofRequest(state.incomingProofRequests));
  pushToRedux(setOutgoingProofRequest(state.outgoingProofRequests));
};

export const connectSession = async () => {
  if (state.socket) return;

  const socket = new WebSocket('ws://localhost:3001');

  socket.onopen = () => {
    devlog('Connected to websocket');
    state.connected = true;
    state.socket = socket;
    pushToRedux(setConnected(true));
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
        const { plugin, pluginHash } = message.params;
        state.incomingProofRequests = [
          ...new Set(state.incomingProofRequests.concat(plugin)),
        ];
        pushToRedux(appendIncomingProofRequests(plugin));
        handleProofRequestReceived(pluginHash);
        break;
      }
      case 'request_proof_by_hash': {
        const { pluginHash } = message.params;
        const plugin = await getPluginByHash(pluginHash);
        if (plugin) {
          state.incomingProofRequests = [
            ...new Set(state.incomingProofRequests.concat(plugin)),
          ];
          pushToRedux(appendIncomingProofRequests(plugin));
          handleProofRequestReceived(pluginHash);
        } else {
          handleNoPluginHash(pluginHash);
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
      case 'proof_request_reject':
        await handleRemoveOutgoingProofRequest(message);
        break;
      case 'proof_request_cancel':
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
        break;
      }
      case 'proof_request_start': {
        const { pluginHash, from } = message.params;
        const maxSentData = await getMaxSent();
        const maxRecvData = await getMaxRecv();
        const rendezvousApi = await getRendezvousApi();
        // browser.runtime.sendMessage({
        //   type: OffscreenActionTypes.start_p2p_prover,
        //   data: {
        //     pluginHash,
        //     maxSentData,
        //     maxRecvData,
        //     proverUrl: rendezvousApi + '?clientId=' + state.clientId + ':proof',
        //     peerId: state.pairing,
        //   },
        // });
        break;
      }
      default:
        console.warn(`Unknown message type "${message.method}"`);
        break;
    }
  };
  socket.onerror = () => {
    console.error('Error connecting to websocket');
    pushToRedux(setConnected(false));
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
  const plugin = await getPluginByHash(pluginHash);
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
  await state.socket.close();
  state.socket = null;
  state.clientId = '';
  state.pairing = '';
  state.connected = false;
  state.incomingPairingRequests = [];
  state.outgoingPairingRequests = [];
  state.incomingProofRequests = [];
  state.outgoingProofRequests = [];
  pushToRedux(setPairing(''));
  pushToRedux(setConnected(false));
  pushToRedux(setClientId(''));
  pushToRedux(setIncomingPairingRequest([]));
  pushToRedux(setOutgoingPairingRequest([]));
  pushToRedux(setIncomingProofRequest([]));
  pushToRedux(setOutgoingProofRequest([]));
};

export const sendPairRequest = async (target: string) => {
  const { socket, clientId } = state;

  if (clientId === target) return;

  if (socket && clientId) {
    socket.send(
      bufferify({
        method: 'pair_request',
        params: {
          from: clientId,
          to: target,
          id: state.reqId++,
        },
      }),
    );
  }
};

export const cancelPairRequest = async (target: string) => {
  const { socket, clientId } = state;

  if (clientId === target) return;

  if (socket && clientId) {
    socket.send(
      bufferify({
        method: 'pair_request_cancel',
        params: {
          from: clientId,
          to: target,
          id: state.reqId++,
        },
      }),
    );
  }
};

export const acceptPairRequest = async (target: string) => {
  const { socket, clientId } = state;

  if (clientId === target) return;

  if (socket && clientId) {
    socket.send(
      bufferify({
        method: 'pair_request_accept',
        params: {
          from: clientId,
          to: target,
          id: state.reqId++,
        },
      }),
    );
  }
};

export const rejectPairRequest = async (target: string) => {
  const { socket, clientId } = state;

  if (clientId === target) return;

  if (socket && clientId) {
    socket.send(
      bufferify({
        method: 'pair_request_reject',
        params: {
          from: clientId,
          to: target,
          id: state.reqId++,
        },
      }),
    );
  }
};

export const requestProof = async (pluginHash: string) => {
  const { socket, clientId, pairing } = state;
  const pluginHex = await getPluginByHash(pluginHash);
  if (socket && clientId && pairing) {
    socket.send(
      bufferify({
        method: 'request_proof',
        params: {
          from: clientId,
          to: pairing,
          plugin: pluginHex,
          pluginHash,
          id: state.reqId++,
        },
      }),
    );
  }
};

export const requestProofByHash = async (pluginHash: string) => {
  const { socket, clientId, pairing } = state;
  if (socket && clientId && pairing) {
    socket.send(
      bufferify({
        method: 'request_proof_by_hash',
        params: {
          from: clientId,
          to: pairing,
          pluginHash,
          id: state.reqId++,
        },
      }),
    );
  }
};

export const cancelProofRequest = async (pluginHash: string) => {
  const { socket, clientId, pairing } = state;
  if (socket && clientId && pairing) {
    socket.send(
      bufferify({
        method: 'proof_request_cancel',
        params: {
          from: clientId,
          to: pairing,
          pluginHash,
          id: state.reqId++,
        },
      }),
    );
  }
};

export const acceptProofRequest = async (pluginHash: string) => {
  const { socket, clientId, pairing } = state;
  if (socket && clientId && pairing) {
    socket.send(
      bufferify({
        method: 'proof_request_accept',
        params: {
          from: clientId,
          to: pairing,
          pluginHash,
          id: state.reqId++,
        },
      }),
    );
  }
};

export const startProofRequest = async (pluginHash: string) => {
  const { socket, clientId, pairing } = state;
  if (socket && clientId && pairing) {
    socket.send(
      bufferify({
        method: 'proof_request_start',
        params: {
          from: clientId,
          to: pairing,
          pluginHash,
          id: state.reqId++,
        },
      }),
    );
  }
};

export const rejectProofRequest = async (pluginHash: string) => {
  const { socket, clientId, pairing } = state;
  if (socket && clientId && pairing) {
    socket.send(
      bufferify({
        method: 'proof_request_reject',
        params: {
          from: clientId,
          to: pairing,
          pluginHash,
          id: state.reqId++,
        },
      }),
    );
  }
};

export const handleNoPluginHash = async (pluginHash: string) => {
  const { socket, clientId, pairing } = state;
  if (socket && clientId && pairing) {
    socket.send(
      bufferify({
        method: 'request_proof_by_hash_failed',
        params: {
          from: clientId,
          to: pairing,
          pluginHash,
          id: state.reqId++,
        },
      }),
    );
  }
};

export const handleProofRequestReceived = async (pluginHash: string) => {
  const { socket, clientId, pairing } = state;
  if (socket && clientId && pairing) {
    socket.send(
      bufferify({
        method: 'proof_request_received',
        params: {
          from: clientId,
          to: pairing,
          pluginHash,
          id: state.reqId++,
        },
      }),
    );
  }
};

function bufferify(data: any): Buffer {
  return Buffer.from(JSON.stringify(data));
}
