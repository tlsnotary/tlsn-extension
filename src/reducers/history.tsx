import {
  BackgroundActiontype,
  RequestHistory,
  RequestProgress,
} from '../entries/Background/rpc';
import { useSelector } from 'react-redux';
import { AppRootState } from './index';
import deepEqual from 'fast-deep-equal';

enum ActionType {
  '/history/addRequest' = '/history/addRequest',
  '/history/setRequests' = '/history/setRequests',
  '/history/deleteRequest' = '/history/deleteRequest',
  '/history/addRequestCid' = '/history/addRequestCid',
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

export const setRequests = (requests: RequestHistory[]) => {
  return {
    type: ActionType['/history/setRequests'],
    payload: requests,
  };
};

export const addRequestCid = (requestId: string, cid: string) => {
  return {
    type: ActionType['/history/addRequestCid'],
    payload: { requestId, cid },
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
      if (existing?.progress === RequestProgress.Error) {
        return state;
      }
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
    case ActionType['/history/setRequests']: {
      const payload: RequestHistory[] = action.payload;
      const newMap = payload.reduce((map: { [id: string]: RequestHistory }, req) => {
        if (state.map[req.id]?.progress === RequestProgress.Error) {
          map[req.id] = state.map[req.id];
        } else {
          map[req.id] = req;
        }
        return map;
      }, {});
      return {
        ...state,
        map: newMap,
        order: payload.map(({ id }) => id),
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
    case ActionType['/history/addRequestCid']: {
      const { requestId, cid } = action.payload;
      if (!state.map[requestId]) return state;
      return {
        ...state,
        map: {
          ...state.map,
          [requestId]: {
            ...state.map[requestId],
            cid,
          },
        },
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

export const useAllProofHistory = (): RequestHistory[] => {
  return useSelector((state: AppRootState) => {
    return state.history.order.map((id) => state.history.map[id]);
  }, deepEqual);
};

export const useRequestHistory = (id?: string): RequestHistory | undefined => {
  return useSelector((state: AppRootState) => {
    if (!id) return undefined;
    return state.history.map[id];
  }, deepEqual);
};
