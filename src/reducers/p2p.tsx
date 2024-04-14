import { useSelector } from 'react-redux';
import { AppRootState } from './index';
import deepEqual from 'fast-deep-equal';
import { safeParseJSON } from '../utils/misc';
import { Dispatch } from 'redux';
import { RENDEZVOUS_API } from '../utils/constants';
import { PluginParams } from '../components/PluginDisplayBox';

enum ActionType {
  '/p2p/createSession' = '/p2p/createSession',
  '/p2p/setConnected' = '/p2p/setConnected',
  '/p2p/setClientId' = '/p2p/setClientId',
  '/p2p/setSocket' = '/p2p/setSocket',
  '/p2p/appendMessage' = '/p2p/appendMessage',
  '/p2p/setMessages' = '/p2p/setMessages',
  '/p2p/setPairing' = '/p2p/setPairing',
}

type Action<payload> = {
  type: ActionType;
  payload?: payload;
  error?: boolean;
  meta?: any;
};

type State = {
  clientId: string;
  pairing: string;
  socket: WebSocket | null;
  connected: boolean;
  messages: (Chat | RequestProofMessage)[];
};

export type Chat = {
  to: string;
  from: string;
  text: string;
  id: number;
  plugin?: undefined;
};

export type RequestProofMessage = {
  to: string;
  from: string;
  plugin: PluginParams;
  id: number;
  text?: undefined;
};

const initialState: State = {
  clientId: '',
  pairing: '',
  socket: null,
  connected: false,
  messages: [],
};

export const connectSession =
  () => async (dispatch: Dispatch, getState: () => AppRootState) => {
    const { p2p } = getState();

    if (p2p.socket) return;

    const socket = new WebSocket(RENDEZVOUS_API);

    socket.onopen = () => {
      console.log('Connected to websocket');
      dispatch(setConnected(true));
      dispatch(setSocket(socket));
    };

    socket.onmessage = async (event) => {
      const message: any = safeParseJSON(await event.data.text());

      switch (message.method) {
        case 'client_connect': {
          const { clientId } = message.params;
          dispatch(setClientId(clientId));
          break;
        }
        case 'chat': {
          const { to, from, text, id } = message.params;
          dispatch(
            appendMessage({
              to,
              from,
              text,
              id,
            }),
          );
          break;
        }
        case 'request_proof': {
          const { to, from, plugin, id } = message.params;
          dispatch(
            appendMessage({
              to,
              from,
              plugin,
              id,
            }),
          );
          break;
        }
        case 'pair_request': {
          const { from } = message.params;
          dispatch(confirmPairRequest(from));
          break;
        }
        case 'pair_request_success': {
          const { from } = message.params;
          dispatch(setPairing(from));
          break;
        }
        default:
          console.warn(`Unknown message type "${message.method}"`);
          break;
      }
    };
    socket.onerror = () => {
      console.error('Error connecting to websocket');
      dispatch(setConnected(false));
    };
  };

export const setConnected = (connected = false) => ({
  type: ActionType['/p2p/setConnected'],
  payload: connected,
});

export const setClientId = (clientId: string) => ({
  type: ActionType['/p2p/setClientId'],
  payload: clientId,
});

export const setSocket = (socket: WebSocket) => ({
  type: ActionType['/p2p/setSocket'],
  payload: socket,
});

export const setMessages = (messages: Chat[]) => ({
  type: ActionType['/p2p/setMessages'],
  payload: messages,
});

export const appendMessage = (message: Chat | RequestProofMessage) => ({
  type: ActionType['/p2p/appendMessage'],
  payload: message,
});

export const setPairing = (clientId: string) => ({
  type: ActionType['/p2p/setPairing'],
  payload: clientId,
});

let id = 1;
export const sendChat =
  (message: Omit<Chat, 'id'>) =>
  async (dispatch: Dispatch, getState: () => AppRootState) => {
    const {
      p2p: { socket },
    } = getState();
    const reqId = id++;
    const params = {
      ...message,
      id: reqId,
    };

    if (socket) {
      socket.send(
        bufferify({
          method: 'chat',
          params,
        }),
      );
      dispatch(appendMessage(params));
    }
  };

export const requestProof =
  (message: Omit<RequestProofMessage, 'id'>) =>
  async (dispatch: Dispatch, getState: () => AppRootState) => {
    const {
      p2p: { socket },
    } = getState();
    const reqId = id++;
    const params = {
      ...message,
      id: reqId,
    };

    if (socket) {
      socket.send(
        bufferify({
          method: 'request_proof',
          params,
        }),
      );
      dispatch(appendMessage(params));
    }
  };

export const sendPairRequest =
  (target: string) =>
  async (dispatch: Dispatch, getState: () => AppRootState) => {
    const {
      p2p: { socket, clientId },
    } = getState();
    const reqId = id++;

    if (socket && clientId) {
      socket.send(
        bufferify({
          method: 'pair_request',
          params: {
            from: clientId,
            to: target,
            id: reqId,
          },
        }),
      );
    }
  };
export const confirmPairRequest =
  (target: string) => (dispatch: Dispatch, getState: () => AppRootState) => {
    const {
      p2p: { socket, clientId },
    } = getState();

    const reqId = id++;

    if (socket && clientId) {
      socket.send(
        bufferify({
          method: 'pair_request_success',
          params: {
            from: clientId,
            to: target,
            id: reqId,
          },
        }),
      );
      dispatch(setPairing(target));
    }
  };

export default function p2p(state = initialState, action: Action<any>) {
  switch (action.type) {
    case ActionType['/p2p/setConnected']:
      return {
        ...state,
        connected: action.payload,
      };
    case ActionType['/p2p/setClientId']:
      return {
        ...state,
        clientId: action.payload,
      };
    case ActionType['/p2p/setSocket']:
      return {
        ...state,
        socket: action.payload,
      };
    case ActionType['/p2p/setMessages']:
      return {
        ...state,
        messages: action.payload,
      };
    case ActionType['/p2p/setPairing']:
      return {
        ...state,
        pairing: action.payload,
      };
    case ActionType['/p2p/appendMessage']:
      return {
        ...state,
        messages: state.messages.concat(action.payload),
      };
    default:
      return state;
  }
}

export function useClientId() {
  return useSelector((state: AppRootState) => {
    return state.p2p.clientId;
  }, deepEqual);
}

export function useSocket() {
  return useSelector((state: AppRootState) => {
    return state.p2p.socket;
  }, deepEqual);
}

export function useConnected() {
  return useSelector((state: AppRootState) => {
    return state.p2p.connected;
  }, deepEqual);
}

export function useChatMessages(): (Chat | RequestProofMessage)[] {
  return useSelector((state: AppRootState) => {
    return state.p2p.messages;
  }, deepEqual);
}

export function usePairId(): string {
  return useSelector((state: AppRootState) => {
    return state.p2p.pairing;
  }, deepEqual);
}

function bufferify(data: any): Buffer {
  return Buffer.from(JSON.stringify(data));
}
