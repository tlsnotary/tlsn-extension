import { useSelector } from 'react-redux';
import { AppRootState } from './index';
import deepEqual from 'fast-deep-equal';
import { Dispatch } from 'redux';
import browser from 'webextension-polyfill';
import { BackgroundActiontype } from '../entries/Background/rpc';

enum ActionType {
  '/p2p/setConnected' = '/p2p/setConnected',
  '/p2p/setClientId' = '/p2p/setClientId',
  '/p2p/setPairing' = '/p2p/setPairing',
  '/p2p/setError' = '/p2p/setError',
  '/p2p/appendIncomingPairingRequest' = '/p2p/appendIncomingPairingRequest',
  '/p2p/appendOutgoingPairingRequest' = '/p2p/appendOutgoingPairingRequest',
  '/p2p/setIncomingPairingRequest' = '/p2p/setIncomingPairingRequest',
  '/p2p/setOutgoingPairingRequest' = '/p2p/setOutgoingPairingRequest',
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
  error: string;
  incomingPairingRequests: string[];
  outgoingPairingRequests: string[];
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
  error: '',
  connected: false,
  incomingPairingRequests: [],
  outgoingPairingRequests: [],
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

export const appendIncomingPairingRequests = (peerId: string) => ({
  type: ActionType['/p2p/appendIncomingPairingRequest'],
  payload: peerId,
});

export const appendOutgoingPairingRequests = (peerId: string) => ({
  type: ActionType['/p2p/appendOutgoingPairingRequest'],
  payload: peerId,
});

export const setIncomingPairingRequest = (peerIds: string[]) => ({
  type: ActionType['/p2p/setIncomingPairingRequest'],
  payload: peerIds,
});

export const setOutgoingPairingRequest = (peerIds: string[]) => ({
  type: ActionType['/p2p/setOutgoingPairingRequest'],
  payload: peerIds,
});

export const setP2PError = (error: string) => ({
  type: ActionType['/p2p/setError'],
  payload: error,
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

export const cancelPairRequest = async (targetId: string) => {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.cancel_pair_request,
    data: targetId,
  });
};

export const acceptPairRequest = async (targetId: string) => {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.accept_pair_request,
    data: targetId,
  });
};

export const rejectPairRequest = async (targetId: string) => {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.reject_pair_request,
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

export default function p2p(state = initialState, action: Action<any>): State {
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
    case ActionType['/p2p/appendIncomingPairingRequest']:
      return {
        ...state,
        incomingPairingRequests: [
          ...new Set(state.incomingPairingRequests.concat(action.payload)),
        ],
      };
    case ActionType['/p2p/appendOutgoingPairingRequest']:
      return {
        ...state,
        outgoingPairingRequests: [
          ...new Set(state.outgoingPairingRequests.concat(action.payload)),
        ],
      };
    case ActionType['/p2p/setIncomingPairingRequest']:
      return {
        ...state,
        incomingPairingRequests: action.payload,
      };
    case ActionType['/p2p/setOutgoingPairingRequest']:
      return {
        ...state,
        outgoingPairingRequests: action.payload,
      };
    case ActionType['/p2p/setError']:
      return {
        ...state,
        error: action.payload,
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

export function useOutgoingPairingRequests(): string[] {
  return useSelector((state: AppRootState) => {
    return state.p2p.outgoingPairingRequests;
  }, deepEqual);
}

export function useP2PError(): string {
  return useSelector((state: AppRootState) => {
    return state.p2p.error;
  }, deepEqual);
}
