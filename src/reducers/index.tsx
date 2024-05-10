import { combineReducers } from 'redux';
import requests from './requests';
import history from './history';
import plugins from './plugins';

const rootReducer = combineReducers({
  requests,
  history,
  plugins,
});

export type AppRootState = ReturnType<typeof rootReducer>;
export default rootReducer;
