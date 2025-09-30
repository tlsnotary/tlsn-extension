import type {} from 'redux-thunk/extend-redux';
import { applyMiddleware, createStore } from 'redux';
import thunk from 'redux-thunk';
import { createLogger } from 'redux-logger';
import rootReducer from '../reducers';

const createStoreWithMiddleware =
  process.env.NODE_ENV === 'development'
    ? applyMiddleware(
        thunk,
        createLogger({
          collapsed: true,
        }),
      )(createStore)
    : applyMiddleware(thunk)(createStore);

function configureAppStore() {
  return createStoreWithMiddleware(rootReducer);
}

const store = configureAppStore();

export default store;
