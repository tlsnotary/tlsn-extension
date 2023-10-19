import { RequestHistory } from '../pages/Background/actionTypes';
import { useSelector } from 'react-redux';
import { AppRootState } from './index';
import deepEqual from 'fast-deep-equal';

enum ActionType {
  '/history/addRequest' = '/history/addRequest',
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

export const addRequestHistory = (request: RequestHistory) => {
  return {
    type: ActionType['/history/addRequest'],
    payload: request,
  };
}

export default function history(
  state = initialState,
  action: Action<any>,
): State {
  switch (action.type) {
    case ActionType['/history/addRequest']: {
      const payload: RequestHistory = action.payload;
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
    default:
      return state;
  }
}

export const useHistory = (): RequestHistory[] => {
  return useSelector((state: AppRootState) => {
    return state.history.order.map(id => state.history.map[id]);
  }, deepEqual);
};