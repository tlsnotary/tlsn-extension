import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import Popup from './Popup';
import './index.scss';
import store from '../../utils/store';

const container = document.getElementById('app-container');
if (container) {
  const root = createRoot(container);
  root.render(
    <Provider store={store}>
      <Popup />
    </Provider>,
  );
}
