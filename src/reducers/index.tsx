import { combineReducers } from 'redux';
import requests from './requests';
import history from './history';
import plugins from './plugins';
import p2p from './p2p';

const rootReducer = combineReducers({
  requests,
  history,
  plugins,
  p2p,
});

export type AppRootState = ReturnType<typeof rootReducer>;
export default rootReducer;
