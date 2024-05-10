import { useSelector } from 'react-redux';
import { AppRootState } from './index';
import deepEqual from 'fast-deep-equal';

enum ActionType {
  '/plugin/addPlugin' = '/plugin/addPlugin',
  '/plugin/removePlugin' = '/plugin/removePlugin',
}

type Action<payload> = {
  type: ActionType;
  payload?: payload;
  error?: boolean;
  meta?: any;
};

type State = {
  order: string[];
};

const initState: State = {
  order: [],
};

export const addOnePlugin = (hash: string): Action<string> => ({
  type: ActionType['/plugin/addPlugin'],
  payload: hash,
});

export const removeOnePlugin = (hash: string): Action<string> => ({
  type: ActionType['/plugin/removePlugin'],
  payload: hash,
});

export default function plugins(state = initState, action: Action<any>): State {
  switch (action.type) {
    case ActionType['/plugin/addPlugin']:
      return {
        order: [...new Set(state.order.concat(action.payload))],
      };
    case ActionType['/plugin/removePlugin']:
      return {
        order: state.order.filter((h) => h !== action.payload),
      };
    default:
      return state;
  }
}

export const usePluginHashes = (): string[] => {
  return useSelector((state: AppRootState) => {
    return state.plugins.order;
  }, deepEqual);
};
