import thunk from 'redux-thunk';
import { createLogger } from 'redux-logger';
import { applyMiddleware, combineReducers, createStore } from 'redux';
import requests from "./requests";

const rootReducer = combineReducers({
  requests,
});

export type AppRootState = ReturnType<typeof rootReducer>;
export default rootReducer;