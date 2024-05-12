import React from 'react';
import { createRoot } from 'react-dom/client';
import SidePanel from './SidePanel';
import store from '../../utils/store';
import { Provider } from 'react-redux';
import { BackgroundActiontype } from '../Background/rpc';

const container = document.getElementById('app-container');
const root = createRoot(container!); // createRoot(container!) if you use TypeScript

chrome.runtime.onMessage.addListener((request) => {
  switch (request.type) {
    case BackgroundActiontype.push_action: {
      if (
        request.data.tabId === store.getState().requests.activeTab?.id ||
        request.data.tabId === 'background'
      ) {
        store.dispatch(request.action);
      }
      break;
    }
  }
});

root.render(
  <Provider store={store}>
    <SidePanel />
  </Provider>,
);
