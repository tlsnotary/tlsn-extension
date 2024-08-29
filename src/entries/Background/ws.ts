import { devlog, safeParseJSON } from '../../utils/misc';
import {
  appendIncomingPairingRequests,
  appendOutgoingPairingRequests,
  setClientId,
  setConnected,
  setIncomingPairingRequest,
  setOutgoingPairingRequest,
  setP2PError,
  setPairing,
} from '../../reducers/p2p';
import { pushToRedux } from '../utils';

const state: {
  clientId: string;
  pairing: string;
  socket: WebSocket | null;
  connected: boolean;
  reqId: number;
  incomingPairingRequests: string[];
  outgoingPairingRequests: string[];
} = {
  clientId: '',
  pairing: '',
  socket: null,
  connected: false,
  reqId: 0,
  incomingPairingRequests: [],
  outgoingPairingRequests: [],
};

export const getP2PState = async () => {
  pushToRedux(setPairing(state.pairing));
  pushToRedux(setConnected(state.connected));
  pushToRedux(setClientId(state.clientId));
  pushToRedux(setIncomingPairingRequest(state.incomingPairingRequests));
  pushToRedux(setOutgoingPairingRequest(state.outgoingPairingRequests));
  return {
    clientId: state.clientId,
    pairing: state.pairing,
    connected: state.connected,
    incomingPairingRequests: state.incomingPairingRequests.concat(),
    outgoingPairingRequests: state.outgoingPairingRequests.concat(),
  };
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

export const disconnectSession = async () => {
  if (!state.socket) return;
  await state.socket.close();
  state.socket = null;
  state.clientId = '';
  state.pairing = '';
  state.connected = false;
  state.incomingPairingRequests = [];
  state.outgoingPairingRequests = [];
  pushToRedux(setPairing(''));
  pushToRedux(setConnected(false));
  pushToRedux(setClientId(''));
  pushToRedux(setIncomingPairingRequest([]));
  pushToRedux(setOutgoingPairingRequest([]));
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

function bufferify(data: any): Buffer {
  return Buffer.from(JSON.stringify(data));
}
