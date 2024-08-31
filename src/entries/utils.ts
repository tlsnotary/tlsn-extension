import browser from 'webextension-polyfill';
import { BackgroundActiontype } from './Background/rpc';
import { SidePanelActionTypes } from './SidePanel/types';
import { deferredPromise } from '../utils/promise';

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

export const openSidePanel = async () => {
  const { promise, resolve, reject } = deferredPromise();

  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    const listener = async (request: any) => {
      if (request.type === SidePanelActionTypes.panel_opened) {
        browser.runtime.onMessage.removeListener(listener);
        resolve();
      }
    };

    browser.runtime.onMessage.addListener(listener);
    // @ts-ignore
    if (chrome.sidePanel) await chrome.sidePanel.open({ tabId: tab.id });
  } catch (e) {
    reject(e);
  }

  return promise;
};
