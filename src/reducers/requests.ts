import {RequestLog} from "../pages/Background/actionTypes";
import {useSelector} from "react-redux";
import {AppRootState} from "./index";
import deepEqual from "fast-deep-equal";

enum ActionType {
  '/requests/setRequests'= '/requests/setRequests',
}

type Action<payload> = {
  type: ActionType;
  payload?: payload;
  error?: boolean;
  meta?: any;
}

type State = {
  map: {
    [requestId: string]: RequestLog;
  };
}

const initialState: State = {
  map: {},
};

export const setRequests = (requests: RequestLog[]): Action<RequestLog[]> => ({
  type: ActionType["/requests/setRequests"],
  payload: requests,
})

export default function requests(state = initialState, action: Action<any>): State {
  switch (action.type) {
    case ActionType["/requests/setRequests"]:
      return {
        ...state,
        map: {
          ...state.map,
          ...action.payload.reduce((acc: {[requestId: string]: RequestLog}, req: RequestLog) => {
            acc[req.requestId] = req;
            return acc;
          }, {}),
        }
      };
    default:
      return state;
  }
}

export const useRequests = (): RequestLog[] => {
  return useSelector((state: AppRootState) => {
    return Object.values(state.requests.map);
  }, deepEqual)
}

export const useRequest = (requestId?: string): RequestLog | null => {
  return useSelector((state: AppRootState) => {
    return requestId ? state.requests.map[requestId] : null;
  }, deepEqual)
}