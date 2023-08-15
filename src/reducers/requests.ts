import {RequestLog} from "../pages/Background/actionTypes";
import {useSelector} from "react-redux";
import {AppRootState} from "./index";
import deepEqual from "fast-deep-equal";

enum ActionType {
  '/requests/setRequests'= '/requests/setRequests',
  '/requests/addRequest'= '/requests/addRequest',
  '/requests/setActiveTab'= '/requests/setActiveTab',
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
  activeTab: chrome.tabs.Tab | null;
}

const initialState: State = {
  map: {},
  activeTab: null,
};

export const setRequests = (requests: RequestLog[]): Action<RequestLog[]> => ({
  type: ActionType["/requests/setRequests"],
  payload: requests,
});

export const setActiveTab = (activeTab: chrome.tabs.Tab | null): Action<chrome.tabs.Tab | null> => ({
  type: ActionType["/requests/setActiveTab"],
  payload: activeTab,
});

export const addRequest = (request: RequestLog): Action<RequestLog> => ({
  type: ActionType["/requests/addRequest"],
  payload: request,
});

export default function requests(state = initialState, action: Action<any>): State {
  switch (action.type) {
    case ActionType["/requests/setRequests"]:
      return {
        ...state,
        map: {
          ...action.payload.reduce((acc: {[requestId: string]: RequestLog}, req: RequestLog) => {
            acc[req.requestId] = req;
            return acc;
          }, {}),
        }
      };
    case ActionType["/requests/setActiveTab"]:
      return {
        ...state,
        activeTab: action.payload,
      };
    case ActionType["/requests/addRequest"]:
      return {
        ...state,
        map: {
          ...state.map,
          [action.payload.requestId]: action.payload,
        },
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

export const useActiveTab = (): chrome.tabs.Tab | null => {
  return useSelector((state: AppRootState) => {
    return state.requests.activeTab;
  }, deepEqual)
}

export const useActiveTabUrl = (): URL | null => {
  return useSelector((state: AppRootState) => {
    const activeTab = state.requests.activeTab;
    return activeTab?.url ? new URL(activeTab.url) : null;
  }, deepEqual)
}