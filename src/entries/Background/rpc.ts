import browser from 'webextension-polyfill';
import {
  clearCache,
  getCacheByTabId,
  getCookieStoreByHost,
  getHeaderStoreByHost,
} from './cache';
import { addRequestHistory } from '../../reducers/history';
import {
  addNotaryRequest,
  addNotaryRequestProofs,
  getNotaryRequest,
  getNotaryRequests,
  removeNotaryRequest,
  setNotaryRequestError,
  setNotaryRequestStatus,
  setNotaryRequestVerification,
  addPlugin,
  getPluginHashes,
  getPluginByHash,
  removePlugin,
  addPluginConfig,
  getPluginConfigByHash,
  removePluginConfig,
  getConnection,
  setConnection,
  deleteConnection,
} from './db';
import { addOnePlugin, removeOnePlugin } from '../../reducers/plugins';
import {
  devlog,
  getPluginConfig,
  hexToArrayBuffer,
  makePlugin,
} from '../../utils/misc';
import {
  getLoggingFilter,
  getMaxRecv,
  getMaxSent,
  getNotaryApi,
  getProxyApi,
} from '../../utils/storage';
import { deferredPromise } from '../../utils/promise';
import { minimatch } from 'minimatch';

const charwise = require('charwise');

export enum BackgroundActiontype {
  get_requests = 'get_requests',
  clear_requests = 'clear_requests',
  push_action = 'push_action',
  execute_plugin_prover = 'execute_plugin_prover',
  get_prove_requests = 'get_prove_requests',
  prove_request_start = 'prove_request_start',
  process_prove_request = 'process_prove_request',
  finish_prove_request = 'finish_prove_request',
  verify_prove_request = 'verify_prove_request',
  verify_proof = 'verify_proof',
  delete_prove_request = 'delete_prove_request',
  retry_prove_request = 'retry_prove_request',
  get_cookies_by_hostname = 'get_cookies_by_hostname',
  get_headers_by_hostname = 'get_headers_by_hostname',
  add_plugin = 'add_plugin',
  remove_plugin = 'remove_plugin',
  get_plugin_by_hash = 'get_plugin_by_hash',
  get_plugin_config_by_hash = 'get_plugin_config_by_hash',
  run_plugin = 'run_plugin',
  get_plugin_hashes = 'get_plugin_hashes',
  open_popup = 'open_popup',
  change_route = 'change_route',
  connect_request = 'connect_request',
  connect_response = 'connect_response',
  get_history_request = 'get_history_request',
  get_history_response = 'get_history_response',
}

export type BackgroundAction = {
  type: BackgroundActiontype;
  data?: any;
  meta?: any;
  error?: boolean;
};

export type RequestLog = {
  requestId: string;
  tabId: number;
  method: string;
  type: string;
  url: string;
  initiator: string | null;
  requestHeaders: browser.WebRequest.HttpHeaders;
  requestBody?: string;
  formData?: {
    [k: string]: string[];
  };
  responseHeaders?: browser.WebRequest.HttpHeaders;
};

export type RequestHistory = {
  id: string;
  url: string;
  method: string;
  headers: { [key: string]: string };
  body?: string;
  maxTranscriptSize: number;
  maxSentData: number;
  maxRecvData: number;
  notaryUrl: string;
  websocketProxyUrl: string;
  status: '' | 'pending' | 'success' | 'error';
  error?: any;
  proof?: { session: any; substrings: any };
  requestBody?: any;
  verification?: {
    sent: string;
    recv: string;
  };
  secretHeaders?: string[];
  secretResps?: string[];
  cid?: string;
};

export const initRPC = () => {
  browser.runtime.onMessage.addListener(
    async (request, sender, sendResponse) => {
      switch (request.type) {
        case BackgroundActiontype.get_requests:
          return handleGetRequests(request, sendResponse);
        case BackgroundActiontype.clear_requests:
          clearCache();
          return sendResponse();
        case BackgroundActiontype.get_prove_requests:
          return handleGetProveRequests();
        case BackgroundActiontype.finish_prove_request:
          return handleFinishProveRequest(request, sendResponse);
        case BackgroundActiontype.delete_prove_request:
          await removeNotaryRequest(request.data);
          return sendResponse();
        case BackgroundActiontype.retry_prove_request:
          return handleRetryProveReqest(request, sendResponse);
        case BackgroundActiontype.prove_request_start:
          return handleProveRequestStart(request, sendResponse);
        case BackgroundActiontype.get_cookies_by_hostname:
          return handleGetCookiesByHostname(request, sendResponse);
        case BackgroundActiontype.get_headers_by_hostname:
          return handleGetHeadersByHostname(request, sendResponse);
        case BackgroundActiontype.add_plugin:
          return handleAddPlugin(request, sendResponse);
        case BackgroundActiontype.remove_plugin:
          return handleRemovePlugin(request, sendResponse);
        case BackgroundActiontype.get_plugin_hashes:
          return handleGetPluginHashes(request, sendResponse);
        case BackgroundActiontype.get_plugin_by_hash:
          return handleGetPluginByHash(request, sendResponse);
        case BackgroundActiontype.get_plugin_config_by_hash:
          return handleGetPluginConfigByHash(request, sendResponse);
        case BackgroundActiontype.run_plugin:
          return handleRunPlugin(request, sendResponse);
        case BackgroundActiontype.execute_plugin_prover:
          return handleExecPluginProver(request);
        case BackgroundActiontype.open_popup:
          return handleOpenPopup(request);
        case BackgroundActiontype.connect_request:
          return handleConnect(request);
        case BackgroundActiontype.get_history_request:
          return handleGetHistory(request);
        default:
          break;
      }
    },
  );
};

function handleGetRequests(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
) {
  const cache = getCacheByTabId(request.data);
  const keys = cache.keys() || [];
  const data = keys.map((key) => cache.get(key));
  return data;
}

async function handleGetProveRequests() {
  const reqs = await getNotaryRequests();
  for (const req of reqs) {
    await browser.runtime.sendMessage({
      type: BackgroundActiontype.push_action,
      data: {
        tabId: 'background',
      },
      action: addRequestHistory(req),
    });
  }
  return reqs;
}

async function handleFinishProveRequest(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
) {
  const { id, proof, error, verification } = request.data;

  if (proof) {
    const newReq = await addNotaryRequestProofs(id, proof);
    if (!newReq) return;

    await browser.runtime.sendMessage({
      type: BackgroundActiontype.push_action,
      data: {
        tabId: 'background',
      },
      action: addRequestHistory(await getNotaryRequest(id)),
    });
  }

  if (error) {
    const newReq = await setNotaryRequestError(id, error);
    if (!newReq) return;

    await browser.runtime.sendMessage({
      type: BackgroundActiontype.push_action,
      data: {
        tabId: 'background',
      },
      action: addRequestHistory(await getNotaryRequest(id)),
    });
  }

  if (verification) {
    const newReq = await setNotaryRequestVerification(id, verification);
    if (!newReq) return;

    await browser.runtime.sendMessage({
      type: BackgroundActiontype.push_action,
      data: {
        tabId: 'background',
      },
      action: addRequestHistory(await getNotaryRequest(id)),
    });
  }

  return sendResponse();
}

async function handleRetryProveReqest(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
) {
  const { id, notaryUrl, websocketProxyUrl } = request.data;

  await setNotaryRequestError(id, null);
  await setNotaryRequestStatus(id, 'pending');

  const req = await getNotaryRequest(id);

  await browser.runtime.sendMessage({
    type: BackgroundActiontype.push_action,
    data: {
      tabId: 'background',
    },
    action: addRequestHistory(req),
  });

  await browser.runtime.sendMessage({
    type: BackgroundActiontype.process_prove_request,
    data: {
      ...req,
      notaryUrl,
      websocketProxyUrl,
      loggingFilter: await getLoggingFilter(),
    },
  });

  return sendResponse();
}

async function handleProveRequestStart(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
) {
  const {
    url,
    method,
    headers,
    body,
    maxTranscriptSize,
    maxSentData,
    maxRecvData,
    notaryUrl,
    websocketProxyUrl,
    secretHeaders,
    secretResps,
  } = request.data;

  const { id } = await addNotaryRequest(Date.now(), {
    url,
    method,
    headers,
    body,
    maxSentData,
    maxRecvData,
    maxTranscriptSize,
    notaryUrl,
    websocketProxyUrl,
    secretHeaders,
    secretResps,
  });

  await setNotaryRequestStatus(id, 'pending');

  await browser.runtime.sendMessage({
    type: BackgroundActiontype.push_action,
    data: {
      tabId: 'background',
    },
    action: addRequestHistory(await getNotaryRequest(id)),
  });

  await browser.runtime.sendMessage({
    type: BackgroundActiontype.process_prove_request,
    data: {
      id,
      url,
      method,
      headers,
      body,
      maxTranscriptSize,
      maxSentData,
      maxRecvData,
      notaryUrl,
      websocketProxyUrl,
      secretHeaders,
      secretResps,
      loggingFilter: await getLoggingFilter(),
    },
  });

  return sendResponse();
}

async function runPluginProver(request: BackgroundAction, now = Date.now()) {
  const {
    url,
    method,
    headers,
    body,
    secretHeaders,
    secretResps,
    notaryUrl: _notaryUrl,
    websocketProxyUrl: _websocketProxyUrl,
    maxSentData: _maxSentData,
    maxRecvData: _maxRecvData,
  } = request.data;
  const notaryUrl = _notaryUrl || (await getNotaryApi());
  const websocketProxyUrl = _websocketProxyUrl || (await getProxyApi());
  const maxSentData = _maxSentData || (await getMaxSent());
  const maxRecvData = _maxRecvData || (await getMaxRecv());
  const maxTranscriptSize = 16384;

  const { id } = await addNotaryRequest(now, {
    url,
    method,
    headers,
    body,
    maxTranscriptSize,
    notaryUrl,
    websocketProxyUrl,
    maxRecvData,
    maxSentData,
    secretHeaders,
    secretResps,
  });

  await setNotaryRequestStatus(id, 'pending');

  await browser.runtime.sendMessage({
    type: BackgroundActiontype.push_action,
    data: {
      tabId: 'background',
    },
    action: addRequestHistory(await getNotaryRequest(id)),
  });

  await browser.runtime.sendMessage({
    type: BackgroundActiontype.process_prove_request,
    data: {
      id,
      url,
      method,
      headers,
      body,
      maxTranscriptSize,
      notaryUrl,
      websocketProxyUrl,
      maxRecvData,
      maxSentData,
      secretHeaders,
      secretResps,
      loggingFilter: await getLoggingFilter(),
    },
  });
}

export async function handleExecPluginProver(request: BackgroundAction) {
  const now = request.data.now;
  const id = charwise.encode(now).toString('hex');
  runPluginProver(request, now);
  return id;
}

function handleGetCookiesByHostname(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
) {
  const cache = getCookieStoreByHost(request.data);
  const keys = cache.keys() || [];
  const data = keys.reduce((acc: { [k: string]: string }, key) => {
    acc[key] = cache.get(key) || '';
    return acc;
  }, {});
  return data;
}

function handleGetHeadersByHostname(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
) {
  const cache = getHeaderStoreByHost(request.data);
  const keys = cache.keys() || [];
  const data = keys.reduce((acc: { [k: string]: string }, key) => {
    acc[key] = cache.get(key) || '';
    return acc;
  }, {});
  return data;
}

async function handleAddPlugin(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
) {
  try {
    const config = await getPluginConfig(hexToArrayBuffer(request.data));

    if (config) {
      const hash = await addPlugin(request.data);

      if (hash) {
        await addPluginConfig(hash, config);

        await browser.runtime.sendMessage({
          type: BackgroundActiontype.push_action,
          data: {
            tabId: 'background',
          },
          action: addOnePlugin(hash),
        });
      }
    }
  } finally {
    return sendResponse();
  }
}

async function handleRemovePlugin(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
) {
  await removePlugin(request.data);
  await removePluginConfig(request.data);
  await browser.runtime.sendMessage({
    type: BackgroundActiontype.push_action,
    data: {
      tabId: 'background',
    },
    action: removeOnePlugin(request.data),
  });

  return sendResponse();
}

async function handleGetPluginHashes(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
) {
  const hashes = await getPluginHashes();
  for (const hash of hashes) {
    await browser.runtime.sendMessage({
      type: BackgroundActiontype.push_action,
      data: {
        tabId: 'background',
      },
      action: addOnePlugin(hash),
    });
  }
  return sendResponse();
}

async function handleGetPluginByHash(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
) {
  const hash = request.data;
  const hex = await getPluginByHash(hash);
  return hex;
}

async function handleGetPluginConfigByHash(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
) {
  const hash = request.data;
  const config = await getPluginConfigByHash(hash);
  return config;
}

async function handleRunPlugin(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
) {
  const { hash, method, params } = request.data;
  const hex = await getPluginByHash(hash);
  const arrayBuffer = hexToArrayBuffer(hex!);
  const config = await getPluginConfig(arrayBuffer);
  const plugin = await makePlugin(arrayBuffer, config);
  devlog(`plugin::${method}`, params);
  const out = await plugin.call(method, params);
  devlog(`plugin response: `, out.string());
  return JSON.parse(out.string());
}

let cachePopup: browser.Windows.Window | null = null;

async function openPopup(route: string, left?: number, top?: number) {
  const tab = await browser.tabs.create({
    url: browser.runtime.getURL('popup.html') + '#' + route,
    active: false,
  });

  const popup = await browser.windows.create({
    tabId: tab.id,
    type: 'popup',
    focused: true,
    width: 480,
    height: 640,
    left: Math.round(left || 0),
    top: Math.round(top || 0),
  });

  return { popup, tab };
}

async function handleOpenPopup(request: BackgroundAction) {
  if (cachePopup) {
    browser.windows.update(cachePopup.id!, {
      focused: true,
    });
    browser.tabs.update(cachePopup.id!, {
      url: browser.runtime.getURL('popup.html') + '#' + request.data.route,
    });
  } else {
    const { popup } = await openPopup(
      request.data.route,
      request.data.position.left,
      request.data.position.top,
    );

    cachePopup = popup;

    const onPopUpClose = (windowId: number) => {
      if (windowId === popup.id) {
        cachePopup = null;
        browser.windows.onRemoved.removeListener(onPopUpClose);
      }
    };

    browser.windows.onRemoved.addListener(onPopUpClose);
  }
}

async function handleConnect(request: BackgroundAction) {
  const connection = await getConnection(request.data.origin);
  const [currentTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!connection) {
    const defer = deferredPromise();

    const { popup, tab } = await openPopup(
      `connection-approval?origin=${encodeURIComponent(request.data.origin)}&favIconUrl=${encodeURIComponent(currentTab?.favIconUrl || '')}`,
      request.data.position.left,
      request.data.position.top,
    );

    const onMessage = async (req: BackgroundAction) => {
      if (req.type === BackgroundActiontype.connect_response) {
        defer.resolve(req.data);
        if (req.data) {
          await setConnection(request.data.origin);
        } else {
          await deleteConnection(request.data.origin);
        }
        browser.runtime.onMessage.removeListener(onMessage);
        browser.tabs.remove(tab.id!);
      }
    };

    const onPopUpClose = (windowId: number) => {
      if (windowId === popup.id) {
        defer.resolve(false);
        browser.windows.onRemoved.removeListener(onPopUpClose);
      }
    };

    browser.runtime.onMessage.addListener(onMessage);
    browser.windows.onRemoved.addListener(onPopUpClose);

    return defer.promise;
  }

  return true;
}

async function handleGetHistory(request: BackgroundAction) {
  const [currentTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  const defer = deferredPromise();
  const {
    origin,
    position,
    method: filterMethod,
    url: filterUrl,
  } = request.data;

  const { popup, tab } = await openPopup(
    `get-history-approval?method=${filterMethod}&url=${filterUrl}&origin=${encodeURIComponent(origin)}&favIconUrl=${encodeURIComponent(currentTab?.favIconUrl || '')}`,
    position.left,
    position.top,
  );

  const onMessage = async (req: BackgroundAction) => {
    if (req.type === BackgroundActiontype.get_history_response) {
      if (req.data) {
        const response: RequestHistory[] = await handleGetProveRequests();

        const result = response
          .map(({ id, method, url, notaryUrl, websocketProxyUrl }) => ({
            id,
            time: new Date(charwise.decode(id)),
            method,
            url,
            notaryUrl,
            websocketProxyUrl,
          }))
          .filter(({ method, url }) => {
            return (
              minimatch(method, filterMethod, { nocase: true }) &&
              minimatch(url, filterUrl)
            );
          });

        defer.resolve(result);
      } else {
        defer.reject(new Error('user rejected.'));
      }

      browser.runtime.onMessage.removeListener(onMessage);
      browser.tabs.remove(tab.id!);
    }
  };

  const onPopUpClose = (windowId: number) => {
    if (windowId === popup.id) {
      defer.reject(new Error('user rejected.'));
      browser.windows.onRemoved.removeListener(onPopUpClose);
    }
  };

  browser.runtime.onMessage.addListener(onMessage);
  browser.windows.onRemoved.addListener(onPopUpClose);

  return defer.promise;
}
