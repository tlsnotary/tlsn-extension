import { devlog, safeParseJSON } from '../../utils/misc';
import {
  appendPairingRequests,
  setClientId,
  setConnected,
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
} = {
  clientId: '',
  pairing: '',
  socket: null,
  connected: false,
  reqId: 0,
  incomingPairingRequests: [],
};

export const getP2PState = async () => {
  pushToRedux(setPairing(state.pairing));
  pushToRedux(setConnected(state.connected));
  pushToRedux(setClientId(state.clientId));
  return {
    clientId: state.clientId,
    pairing: state.pairing,
    connected: state.connected,
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
        pushToRedux(appendPairingRequests(from));
        // if (socket && clientId) {
        //   socket.send(
        //     bufferify({
        //       method: 'pair_request_success',
        //       params: {
        //         from: clientId,
        //         to: from,
        //         id: state.reqId++,
        //       },
        //     }),
        //   );
        //   pushToRedux(setPairing(from));
        // }
        break;
      }
      case 'pair_request_success': {
        const { from } = message.params;
        state.pairing = from;
        pushToRedux(setPairing(from));
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
  pushToRedux(setPairing(''));
  pushToRedux(setConnected(false));
  pushToRedux(setClientId(''));
};

export const sendPairRequest = async (target: string) => {
  const { socket, clientId } = state;

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

function bufferify(data: any): Buffer {
  return Buffer.from(JSON.stringify(data));
}
