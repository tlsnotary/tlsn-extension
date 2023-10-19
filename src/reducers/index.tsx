import { combineReducers } from 'redux';
import requests from './requests';
import history from './history';

const rootReducer = combineReducers({
  requests,
  history,
});

export type AppRootState = ReturnType<typeof rootReducer>;
export default rootReducer;
