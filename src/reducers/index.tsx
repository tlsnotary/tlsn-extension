import { combineReducers } from 'redux';
import requests from './requests';
import history from './history';
import p2p from './p2p';

const rootReducer = combineReducers({
  requests,
  history,
  p2p,
});

export type AppRootState = ReturnType<typeof rootReducer>;
export default rootReducer;
