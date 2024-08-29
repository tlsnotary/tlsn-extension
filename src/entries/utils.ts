import browser from 'webextension-polyfill';
import { BackgroundActiontype } from './Background/rpc';

export const pushToRedux = async (action: {
  type: string;
  payload?: any;
  error?: boolean;
  meta?: any;
}) => {
  return browser.runtime.sendMessage({
    type: BackgroundActiontype.push_action,
    data: {
      tabId: 'background',
    },
    action,
  });
};
