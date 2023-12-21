import {
  BackgroundActiontype,
  RequestHistory,
} from '../entries/Background/rpc';
import { useSelector } from 'react-redux';
import { AppRootState } from './index';
import deepEqual from 'fast-deep-equal';

enum ActionType {
  '/history/addRequest' = '/history/addRequest',
  '/history/deleteRequest' = '/history/deleteRequest',
}

type Action<payload> = {
  type: ActionType;
  payload?: payload;
  error?: boolean;
  meta?: any;
};

type State = {
  map: {
    [requestId: string]: RequestHistory;
  };
  order: string[];
};

const initialState: State = {
  map: {},
  order: [],
};

export const addRequestHistory = (request?: RequestHistory | null) => {
  return {
    type: ActionType['/history/addRequest'],
    payload: request,
  };
};

export const deleteRequestHistory = (id: string) => {
  chrome.runtime.sendMessage<any, string>({
    type: BackgroundActiontype.delete_prove_request,
    data: id,
  });

  return {
    type: ActionType['/history/deleteRequest'],
    payload: id,
  };
};

export default function history(
  state = initialState,
  action: Action<any>,
): State {
  switch (action.type) {
    case ActionType['/history/addRequest']: {
      const payload: RequestHistory = action.payload;

      if (!payload) return state;

      const existing = state.map[payload.id];
      const newMap = {
        ...state.map,
        [payload.id]: payload,
      };
      const newOrder = existing ? state.order : state.order.concat(payload.id);

      return {
        ...state,
        map: newMap,
        order: newOrder,
      };
    }
    case ActionType['/history/deleteRequest']: {
      const reqId: string = action.payload;
      const newMap = { ...state.map };
      delete newMap[reqId];
      const newOrder = state.order.filter((id) => id !== reqId);
      return {
        ...state,
        map: newMap,
        order: newOrder,
      };
    }
    default:
      return state;
  }
}

export const useHistoryOrder = (): string[] => {
  return useSelector((state: AppRootState) => {
    return state.history.order;
  }, deepEqual);
};

export const useRequestHistory = (id?: string): RequestHistory | undefined => {
  return useSelector((state: AppRootState) => {
    if (!id) return undefined;
    return state.history.map[id];
  }, deepEqual);
};
