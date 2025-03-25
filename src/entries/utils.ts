import browser from 'webextension-polyfill';
import { BackgroundActiontype } from './Background/rpc';
import { SidePanelActionTypes } from './SidePanel/types';
import { deferredPromise } from '../utils/promise';
import { devlog } from '../utils/misc';

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
    const response = await browser.runtime.sendMessage({
      type: SidePanelActionTypes.is_panel_open,
    });

    if (response?.isOpen) {
      await browser.runtime.sendMessage({
        type: SidePanelActionTypes.reset_panel,
      });
      resolve();
      return promise;
    }

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

export const waitForEvent = async (event: string) => {
  const { promise, resolve } = deferredPromise();

  const listener = async (request: any) => {
    if (request.type === event) {
      devlog('received event:', event);
      browser.runtime.onMessage.removeListener(listener);
      resolve(request);
    }
  };

  browser.runtime.onMessage.addListener(listener);

  return promise;
};
