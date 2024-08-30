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
  '/p2p/appendIncomingProofRequest' = '/p2p/appendIncomingProofRequest',
  '/p2p/appendOutgoingProofRequest' = '/p2p/appendOutgoingProofRequest',
  '/p2p/setIncomingProofRequest' = '/p2p/setIncomingProofRequest',
  '/p2p/setOutgoingProofRequest' = '/p2p/setOutgoingProofRequest',
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
  incomingProofRequests: string[];
  outgoingProofRequests: string[];
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
  incomingProofRequests: [],
  outgoingProofRequests: [],
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

export const appendIncomingProofRequests = (peerId: string) => ({
  type: ActionType['/p2p/appendIncomingProofRequest'],
  payload: peerId,
});

export const appendOutgoingPairingRequests = (peerId: string) => ({
  type: ActionType['/p2p/appendOutgoingPairingRequest'],
  payload: peerId,
});

export const appendOutgoingProofRequest = (peerId: string) => ({
  type: ActionType['/p2p/appendOutgoingProofRequest'],
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

export const setIncomingProofRequest = (peerIds: string[]) => ({
  type: ActionType['/p2p/setIncomingProofRequest'],
  payload: peerIds,
});

export const setOutgoingProofRequest = (peerIds: string[]) => ({
  type: ActionType['/p2p/setOutgoingProofRequest'],
  payload: peerIds,
});

export const setP2PError = (error: string) => ({
  type: ActionType['/p2p/setError'],
  payload: error,
});

export const requestProof = (pluginHash: string) => {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.request_p2p_proof,
    data: pluginHash,
  });
};

export const requestProofByHash = (pluginHash: string) => {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.request_p2p_proof_by_hash,
    data: pluginHash,
  });
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

export const cancelProofRequest = async (plughinHash: string) => {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.cancel_proof_request,
    data: plughinHash,
  });
};

export const acceptProofRequest = async (plughinHash: string) => {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.accept_proof_request,
    data: plughinHash,
  });
};

export const rejectProofRequest = async (plughinHash: string) => {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.reject_proof_request,
    data: plughinHash,
  });
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
    case ActionType['/p2p/appendIncomingProofRequest']:
      return {
        ...state,
        incomingProofRequests: [
          ...new Set(state.incomingProofRequests.concat(action.payload)),
        ],
      };
    case ActionType['/p2p/appendOutgoingProofRequest']:
      return {
        ...state,
        outgoingProofRequests: [
          ...new Set(state.outgoingProofRequests.concat(action.payload)),
        ],
      };
    case ActionType['/p2p/setIncomingProofRequest']:
      return {
        ...state,
        incomingProofRequests: action.payload,
      };
    case ActionType['/p2p/setOutgoingProofRequest']:
      return {
        ...state,
        outgoingProofRequests: action.payload,
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

export function useIncomingProofRequests(): string[] {
  return useSelector((state: AppRootState) => {
    return state.p2p.incomingProofRequests;
  }, deepEqual);
}

export function useOutgoingProofRequests(): string[] {
  return useSelector((state: AppRootState) => {
    return state.p2p.outgoingProofRequests;
  }, deepEqual);
}

export function useP2PError(): string {
  return useSelector((state: AppRootState) => {
    return state.p2p.error;
  }, deepEqual);
}
