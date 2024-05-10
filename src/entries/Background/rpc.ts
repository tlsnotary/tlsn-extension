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
} from './db';
import { addOnePlugin } from '../../reducers/plugins';

export enum BackgroundActiontype {
  get_requests = 'get_requests',
  clear_requests = 'clear_requests',
  push_action = 'push_action',
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
  get_plugin_by_hash = 'get_plugin_by_hash',
  get_plugin_hashes = 'get_plugin_hashes',
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
          return handleGetProveRequests(request, sendResponse);
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
        case BackgroundActiontype.get_plugin_hashes:
          return handleGetPluginHashes(request, sendResponse);
        case BackgroundActiontype.get_plugin_by_hash:
          return handleGetPluginByHash(request, sendResponse);
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

async function handleGetProveRequests(
  request: BackgroundAction,
  sendResponse: (data?: any) => void,
) {
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
  return sendResponse();
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
  console.log(request.data);
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
    },
  });

  return sendResponse();
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
  const hash = await addPlugin(request.data);

  if (hash) {
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
