import { combineReducers } from 'redux';

// Basic app reducer
interface AppState {
  message: string;
  count: number;
}

const initialAppState: AppState = {
  message: 'Welcome to the extension!',
  count: 0,
};

// Action types
const SET_MESSAGE = 'SET_MESSAGE';
const INCREMENT_COUNT = 'INCREMENT_COUNT';

// Action creators
export const setMessage = (message: string) => ({
  type: SET_MESSAGE,
  payload: message,
});

export const incrementCount = () => ({
  type: INCREMENT_COUNT,
});

// App reducer
const appReducer = (
  state = initialAppState,
  action: { type: string; payload?: unknown },
): AppState => {
  switch (action.type) {
    case SET_MESSAGE:
      return { ...state, message: action.payload as string };
    case INCREMENT_COUNT:
      return { ...state, count: state.count + 1 };
    default:
      return state;
  }
};

// Root reducer
const rootReducer = combineReducers({
  app: appReducer,
});

export type RootState = ReturnType<typeof rootReducer>;
export type AppRootState = RootState; // For backward compatibility
export default rootReducer;
