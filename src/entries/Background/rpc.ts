import browser from 'webextension-polyfill';
import { clearCache, getCacheByTabId } from './cache';
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
  addPluginMetadata,
  getPlugins,
  getCookiesByHost,
  getHeadersByHost,
} from './db';
import { addOnePlugin, removeOnePlugin } from '../../reducers/plugins';
import {
  devlog,
  getPluginConfig,
  hexToArrayBuffer,
  makePlugin,
  PluginConfig,
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
import { OffscreenActionTypes } from '../Offscreen/types';
import { SidePanelActionTypes } from '../SidePanel/types';

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
  get_proof_request = 'get_proof_request',
  get_proof_response = 'get_proof_response',
  notarize_request = 'notarize_request',
  notarize_response = 'notarize_response',
  install_plugin_request = 'install_plugin_request',
  install_plugin_response = 'install_plugin_response',
  get_plugins_request = 'get_plugins_request',
  get_plugins_response = 'get_plugins_response',
  run_plugin_request = 'run_plugin_request',
  run_plugin_response = 'run_plugin_response',
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
  metadata?: {
    [k: string]: string;
  };
};

export const initRPC = () => {
  browser.runtime.onMessage.addListener(
    (request, sender, sendResponse): any => {
      switch (request.type) {
        case BackgroundActiontype.get_requests:
          return handleGetRequests(request, sendResponse);
        case BackgroundActiontype.clear_requests:
          clearCache();
          return sendResponse();
        case BackgroundActiontype.get_prove_requests:
          return handleGetProveRequests(request, sendResponse);
        case BackgroundActiontype.finish_prove_request:
          return handleFinishProveRequest(request, sendResponse);
        case BackgroundActiontype.delete_prove_request:
          return removeNotaryRequest(request.data);
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
        case BackgroundActiontype.get_proof_request:
          return handleGetProof(request);
        case BackgroundActiontype.notarize_request:
          return handleNotarizeRequest(request);
        case BackgroundActiontype.install_plugin_request:
          return handleInstallPluginRequest(request);
        case BackgroundActiontype.get_plugins_request:
          return handleGetPluginsRequest(request);
        case BackgroundActiontype.run_plugin_request:
          return handleRunPluginCSRequest(request);
        default:
          break;
      }
    },
  );
};

function handleGetRequests(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
): boolean {
  const cache = getCacheByTabId(request.data);
  const keys = cache.keys() || [];
  const data = keys.map((key) => cache.get(key));
  sendResponse(data);
  return true;
}

function handleGetProveRequests(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
): boolean {
  getNotaryRequests().then(async (reqs) => {
    for (const req of reqs) {
      await browser.runtime.sendMessage({
        type: BackgroundActiontype.push_action,
        data: {
          tabId: 'background',
        },
        action: addRequestHistory(req),
      });
    }
    sendResponse(reqs);
  });

  return true;
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

  browser.runtime.sendMessage({
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
): boolean {
  (async () => {
    const store = await getCookiesByHost(request.data);
    sendResponse(store);
  })();
  return true;
}

function handleGetHeadersByHostname(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
): boolean {
  (async () => {
    const cache = await getHeadersByHost(request.data);
    sendResponse(cache);
  })();
  return true;
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

function handleRunPlugin(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
) {
  (async () => {
    const { hash, method, params } = request.data;
    const hex = await getPluginByHash(hash);
    const arrayBuffer = hexToArrayBuffer(hex!);
    const config = await getPluginConfig(arrayBuffer);
    const plugin = await makePlugin(arrayBuffer, config);
    devlog(`plugin::${method}`, params);
    const out = await plugin.call(method, params);
    devlog(`plugin response: `, out.string());
    sendResponse(JSON.parse(out.string()));
  })();

  return true;
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
    metadata: filterMetadata,
  } = request.data;

  const { popup, tab } = await openPopup(
    `get-history-approval?${filterMetadata ? `metadata=${JSON.stringify(filterMetadata)}&` : ''}method=${filterMethod}&url=${filterUrl}&origin=${encodeURIComponent(origin)}&favIconUrl=${encodeURIComponent(currentTab?.favIconUrl || '')}`,
    position.left,
    position.top,
  );

  const onMessage = async (req: BackgroundAction) => {
    if (req.type === BackgroundActiontype.get_history_response) {
      if (req.data) {
        const response = await getNotaryRequests();

        const result = response
          .map(
            ({ id, method, url, notaryUrl, websocketProxyUrl, metadata }) => ({
              id,
              time: new Date(charwise.decode(id)),
              method,
              url,
              notaryUrl,
              websocketProxyUrl,
              metadata,
            }),
          )
          .filter(({ method, url, metadata }) => {
            let matchedMetadata = true;
            if (filterMetadata) {
              matchedMetadata = Object.entries(
                filterMetadata as { [k: string]: string },
              ).reduce((bool, [k, v]) => {
                try {
                  return bool && minimatch(metadata![k], v);
                } catch (e) {
                  return false;
                }
              }, matchedMetadata);
            }
            return (
              minimatch(method, filterMethod, { nocase: true }) &&
              minimatch(url, filterUrl) &&
              matchedMetadata
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

async function handleGetProof(request: BackgroundAction) {
  const [currentTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  const defer = deferredPromise();
  const { origin, position, id } = request.data;

  const response = await getNotaryRequest(id);

  if (!response) {
    defer.reject(new Error('proof id not found.'));
    return defer.promise;
  }

  const { popup, tab } = await openPopup(
    `get-proof-approval?id=${id}&origin=${encodeURIComponent(origin)}&favIconUrl=${encodeURIComponent(currentTab?.favIconUrl || '')}`,
    position.left,
    position.top,
  );

  const onMessage = async (req: BackgroundAction) => {
    if (req.type === BackgroundActiontype.get_proof_response) {
      if (req.data) {
        defer.resolve(response?.proof || null);
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

async function handleNotarizeRequest(request: BackgroundAction) {
  const [currentTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  const defer = deferredPromise();
  const {
    url,
    method = 'GET',
    headers,
    body,
    maxSentData = await getMaxSent(),
    maxRecvData = await getMaxRecv(),
    maxTranscriptSize,
    notaryUrl = await getNotaryApi(),
    websocketProxyUrl = await getProxyApi(),
    origin,
    position,
    metadata,
  } = request.data;

  const config = JSON.stringify({
    url,
    method,
    headers,
    body,
    maxSentData,
    maxRecvData,
    maxTranscriptSize,
    notaryUrl,
    websocketProxyUrl,
    metadata,
  });

  const { popup, tab } = await openPopup(
    `notarize-approval?config=${encodeURIComponent(config)}&origin=${encodeURIComponent(origin)}&favIconUrl=${encodeURIComponent(currentTab?.favIconUrl || '')}`,
    position.left,
    position.top,
  );

  const now = Date.now();
  const id = charwise.encode(now).toString('hex');
  let isUserClose = true;

  const onNotarizationResponse = async (req: any) => {
    if (req.type !== OffscreenActionTypes.notarization_response) return;
    if (req.data.id !== id) return;

    if (req.data.error) defer.reject(req.data.error);
    if (req.data.proof) defer.resolve(req.data.proof);

    browser.runtime.onMessage.removeListener(onNotarizationResponse);
  };

  const onMessage = async (req: BackgroundAction) => {
    if (req.type === BackgroundActiontype.notarize_response) {
      if (req.data) {
        try {
          const { secretHeaders, secretResps } = req.data;
          await addNotaryRequest(now, req.data);
          await setNotaryRequestStatus(id, 'pending');

          browser.runtime.onMessage.addListener(onNotarizationResponse);
          browser.runtime.sendMessage({
            type: OffscreenActionTypes.notarization_request,
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
        } catch (e) {
          defer.reject(e);
        }
      } else {
        defer.reject(new Error('user rejected.'));
      }

      browser.runtime.onMessage.removeListener(onMessage);
      isUserClose = false;
      browser.tabs.remove(tab.id!);
    }
  };

  const onPopUpClose = (windowId: number) => {
    if (isUserClose && windowId === popup.id) {
      defer.reject(new Error('user rejected.'));
      browser.windows.onRemoved.removeListener(onPopUpClose);
    }
  };

  browser.runtime.onMessage.addListener(onMessage);
  browser.windows.onRemoved.addListener(onPopUpClose);

  return defer.promise;
}

async function handleInstallPluginRequest(request: BackgroundAction) {
  const [currentTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  const defer = deferredPromise();
  const { origin, position, url, metadata } = request.data;

  let arrayBuffer: ArrayBuffer, config: PluginConfig;

  try {
    const resp = await fetch(url);
    arrayBuffer = await resp.arrayBuffer();
    config = await getPluginConfig(arrayBuffer);
  } catch (e) {
    defer.reject(e);
    return defer.promise;
  }

  const { popup, tab } = await openPopup(
    `install-plugin-approval?${metadata ? `metadata=${JSON.stringify(metadata)}&` : ''}url=${url}&origin=${encodeURIComponent(origin)}&favIconUrl=${encodeURIComponent(currentTab?.favIconUrl || '')}`,
    position.left,
    position.top,
  );

  const onMessage = async (req: BackgroundAction) => {
    if (req.type === BackgroundActiontype.install_plugin_response) {
      if (req.data) {
        try {
          const hex = Buffer.from(arrayBuffer).toString('hex');
          const hash = await addPlugin(hex);
          await addPluginConfig(hash!, config);
          await addPluginMetadata(hash!, {
            ...metadata,
            origin,
            filePath: url,
          });
          defer.resolve(hash);
        } catch (e) {
          defer.reject(e);
        }
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

async function handleGetPluginsRequest(request: BackgroundAction) {
  const [currentTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  const defer = deferredPromise();
  const {
    origin,
    position,
    origin: filterOrigin,
    url: filterUrl,
    metadata: filterMetadata,
  } = request.data;

  const { popup, tab } = await openPopup(
    `get-plugins-approval?${filterMetadata ? `metadata=${JSON.stringify(filterMetadata)}&` : ''}&filterOrigin=${filterOrigin}&url=${filterUrl}&origin=${encodeURIComponent(origin)}&favIconUrl=${encodeURIComponent(currentTab?.favIconUrl || '')}`,
    position.left,
    position.top,
  );

  const onMessage = async (req: BackgroundAction) => {
    if (req.type === BackgroundActiontype.get_plugins_response) {
      if (req.data) {
        const response = await getPlugins();

        const result = response.filter(({ metadata }) => {
          let matchedMetadata = true;
          if (filterMetadata) {
            matchedMetadata = Object.entries(
              filterMetadata as { [k: string]: string },
            ).reduce((bool, [k, v]) => {
              try {
                return bool && minimatch(metadata![k], v);
              } catch (e) {
                return false;
              }
            }, matchedMetadata);
          }
          return (
            minimatch(metadata.filePath, filterUrl) &&
            minimatch(metadata.origin, filterOrigin || '**') &&
            matchedMetadata
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

async function handleRunPluginCSRequest(request: BackgroundAction) {
  const [currentTab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });

  const defer = deferredPromise();
  const { origin, position, hash } = request.data;

  const plugin = await getPluginByHash(hash);
  const config = await getPluginConfigByHash(hash);
  let isUserClose = true;

  if (!plugin || !config) {
    defer.reject(new Error('plugin not found.'));
    return defer.promise;
  }

  const { popup, tab } = await openPopup(
    `run-plugin-approval?hash=${hash}&origin=${encodeURIComponent(origin)}&favIconUrl=${encodeURIComponent(currentTab?.favIconUrl || '')}`,
    position.left,
    position.top,
  );

  const onPluginRequest = async (req: any) => {
    console.log(req);
    if (req.type !== SidePanelActionTypes.execute_plugin_response) return;
    if (req.data.hash !== hash) return;

    if (req.data.error) defer.reject(req.data.error);
    if (req.data.proof) defer.resolve(req.data.proof);

    browser.runtime.onMessage.removeListener(onPluginRequest);
  };

  const onMessage = async (req: BackgroundAction) => {
    if (req.type === BackgroundActiontype.run_plugin_response) {
      if (req.data) {
        browser.runtime.onMessage.addListener(onPluginRequest);
      } else {
        defer.reject(new Error('user rejected.'));
      }

      browser.runtime.onMessage.removeListener(onMessage);
      isUserClose = false;
      browser.tabs.remove(tab.id!);
    }
  };

  const onPopUpClose = (windowId: number) => {
    if (isUserClose && windowId === popup.id) {
      defer.reject(new Error('user rejected.'));
      browser.windows.onRemoved.removeListener(onPopUpClose);
    }
  };

  browser.runtime.onMessage.addListener(onMessage);
  browser.windows.onRemoved.addListener(onPopUpClose);

  return defer.promise;
}
