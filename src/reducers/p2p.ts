import { useSelector } from 'react-redux';
import { AppRootState } from './index';
import deepEqual from 'fast-deep-equal';
import { Dispatch } from 'redux';
import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../entries/Background/rpc';

enum ActionType {
  '/p2p/setConnected' = '/p2p/setConnected',
  '/p2p/setClientId' = '/p2p/setClientId',
  '/p2p/setSocket' = '/p2p/setSocket',
  '/p2p/setPairing' = '/p2p/setPairing',
  '/p2p/appendPairingRequest' = '/p2p/appendPairingRequest',
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
  connected: boolean;
  incomingPairingRequests: string[];
};

export type RequestProofMessage = {
  to: string;
  from: string;
  id: number;
  text?: undefined;
};

const initialState: State = {
  clientId: '',
  pairing: '',
  connected: false,
  incomingPairingRequests: [],
};

export const fetchP2PState = async () => {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.get_p2p_state,
  });
};

export const connectRendezvous = () => {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.connect_rendezvous,
  });
};

export const disconnectRendezvous = () => {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.disconnect_rendezvous,
  });
};

export const setConnected = (connected = false) => ({
  type: ActionType['/p2p/setConnected'],
  payload: connected,
});

export const setClientId = (clientId: string) => ({
  type: ActionType['/p2p/setClientId'],
  payload: clientId,
});

export const setPairing = (clientId: string) => ({
  type: ActionType['/p2p/setPairing'],
  payload: clientId,
});

export const appendPairingRequests = (peerId: string) => ({
  type: ActionType['/p2p/appendPairingRequest'],
  payload: peerId,
});

export const requestProof =
  (message: Omit<RequestProofMessage, 'id'>) =>
  async (dispatch: Dispatch, getState: () => AppRootState) => {
    // const {
    //   p2p: { socket },
    // } = getState();
    // const reqId = id++;
    // const params = {
    //   ...message,
    //   id: reqId,
    // };
    //
    // if (socket) {
    //   socket.send(
    //     bufferify({
    //       method: 'request_proof',
    //       params,
    //     }),
    //   );
    //   dispatch(appendMessage(params));
    // }
  };

export const sendPairRequest = async (targetId: string) => {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.send_pair_request,
    data: targetId,
  });
};
export const confirmPairRequest =
  (target: string) => (dispatch: Dispatch, getState: () => AppRootState) => {
    // const {
    //   p2p: { socket, clientId },
    // } = getState();
    //
    // const reqId = id++;
    //
    // if (socket && clientId) {
    //   socket.send(
    //     bufferify({
    //       method: 'pair_request_success',
    //       params: {
    //         from: clientId,
    //         to: target,
    //         id: reqId,
    //       },
    //     }),
    //   );
    //   dispatch(setPairing(target));
    // }
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
    case ActionType['/p2p/setPairing']:
      return {
        ...state,
        pairing: action.payload,
      };
    case ActionType['/p2p/appendPairingRequest']:
      return {
        ...state,
        incomingPairingRequests: [
          ...new Set(state.incomingPairingRequests.concat(action.payload)),
        ],
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

export function useConnected() {
  return useSelector((state: AppRootState) => {
    return state.p2p.connected;
  }, deepEqual);
}

// export function useChatMessages(): (Chat | RequestProofMessage)[] {
//   return useSelector((state: AppRootState) => {
//     return state.p2p.messages;
//   }, deepEqual);
// }

export function usePairId(): string {
  return useSelector((state: AppRootState) => {
    return state.p2p.pairing;
  }, deepEqual);
}

export function useIncomingPairingRequests(): string[] {
  return useSelector((state: AppRootState) => {
    return state.p2p.incomingPairingRequests;
  }, deepEqual);
}

function bufferify(data: any): Buffer {
  return Buffer.from(JSON.stringify(data));
}
