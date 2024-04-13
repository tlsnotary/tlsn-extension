import { useSelector } from 'react-redux';
import { AppRootState } from './index';
import deepEqual from 'fast-deep-equal';
import { safeParseJSON } from '../utils/misc';
import { Dispatch } from 'redux';

enum ActionType {
  '/p2p/createSession' = '/p2p/createSession',
  '/p2p/setConnected' = '/p2p/setConnected',
  '/p2p/setClientId' = '/p2p/setClientId',
  '/p2p/setSocket' = '/p2p/setSocket',
}

type Action<payload> = {
  type: ActionType;
  payload?: payload;
  error?: boolean;
  meta?: any;
};

type State = {
  clientId: string;
  socket: WebSocket | null;
  connected: boolean;
};

const initialState: State = {
  clientId: '',
  socket: null,
  connected: false,
};

export const connectSession =
  () => async (dispatch: Dispatch, getState: () => AppRootState) => {
    const { p2p } = getState();

    if (p2p.socket) return;

    const socket = new WebSocket('ws://0.tcp.ngrok.io:14339');

    socket.onopen = () => {
      console.log('Connected to websocket');
      dispatch(setConnected(true));
      dispatch(setSocket(socket));
    };

    socket.onmessage = async (event) => {
      const message: any = safeParseJSON(await event.data.text());

      console.log(message);

      switch (message.method) {
        case 'client_connect': {
          const { clientId } = message.params;
          dispatch(setClientId(clientId));
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
