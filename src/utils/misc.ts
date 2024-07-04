import {
  BackgroundActiontype,
  handleExecPluginProver,
  RequestLog,
} from '../entries/Background/rpc';
import { EXPLORER_API } from './constants';
import createPlugin, {
  CallContext,
  ExtismPluginOptions,
  Plugin,
} from '@extism/extism';
import browser from 'webextension-polyfill';
import NodeCache from 'node-cache';
import { getNotaryApi, getProxyApi } from './storage';
import { minimatch } from 'minimatch';
import { getCookiesByHost, getHeadersByHost } from '../entries/Background/db';

const charwise = require('charwise');

export function urlify(
  text: string,
  params?: [string, string, boolean?][],
): URL | null {
  try {
    const url = new URL(text);

    if (params) {
      params.forEach(([k, v]) => {
        url.searchParams.append(k, v);
      });
    }

    return url;
  } catch (e) {
    return null;
  }
}

export function devlog(...args: any[]) {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
}

export function download(filename: string, content: string) {
  const element = document.createElement('a');
  element.setAttribute(
    'href',
    'data:text/plain;charset=utf-8,' + encodeURIComponent(content),
  );
  element.setAttribute('download', filename);

  element.style.display = 'none';
  document.body.appendChild(element);

  element.click();

  document.body.removeChild(element);
}

export async function upload(filename: string, content: string) {
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([content], { type: 'application/json' }),
    filename,
  );
  const response = await fetch(`${EXPLORER_API}/api/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw new Error('Failed to upload');
  }
  const data = await response.json();
  return data;
}

export const copyText = async (text: string): Promise<void> => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    console.error(e);
  }
};

export async function replayRequest(req: RequestLog): Promise<string> {
  const options = {
    method: req.method,
    headers: req.requestHeaders.reduce(
      // @ts-ignore
      (acc: { [key: string]: string }, h: chrome.webRequest.HttpHeader) => {
        if (typeof h.name !== 'undefined' && typeof h.value !== 'undefined') {
          acc[h.name] = h.value;
        }
        return acc;
      },
      {},
    ),
    body: req.requestBody,
  };

  if (req?.formData) {
    const formData = new URLSearchParams();
    Object.entries(req.formData).forEach(([key, values]) => {
      values.forEach((v) => formData.append(key, v));
    });
    options.body = formData.toString();
  }

  // @ts-ignore
  const resp = await fetch(req.url, options);
  return extractBodyFromResponse(resp);
}

export const extractBodyFromResponse = async (
  resp: Response,
): Promise<string> => {
  const contentType =
    resp.headers.get('content-type') || resp.headers.get('Content-Type');

  if (contentType?.includes('application/json')) {
    return resp.text();
  } else if (contentType?.includes('text')) {
    return resp.text();
  } else if (contentType?.includes('image')) {
    return resp.blob().then((blob) => blob.text());
  } else {
    return resp.blob().then((blob) => blob.text());
  }
};

export const sha256 = async (data: string) => {
  const encoder = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((bytes) => bytes.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
};

const VALID_HOST_FUNCS: { [name: string]: string } = {
  redirect: 'redirect',
  notarize: 'notarize',
};

export const makePlugin = async (
  arrayBuffer: ArrayBuffer,
  config?: PluginConfig,
) => {
  const module = await WebAssembly.compile(arrayBuffer);
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  const injectedConfig = {
    tabUrl: tab?.url || 'x://x',
    tabId: tab?.id,
  };

  const approvedRequests = config?.requests || [];
  const approvedNotary = [await getNotaryApi()].concat(config?.notaryUrls);
  const approvedProxy = [await getProxyApi()].concat(config?.proxyUrls);

  const HostFunctions: {
    [key: string]: (callContext: CallContext, ...args: any[]) => any;
  } = {
    redirect: function (context: CallContext, off: bigint) {
      const r = context.read(off);
      const url = r.text();
      browser.tabs.update(tab.id, { url });
    },
    notarize: function (context: CallContext, off: bigint) {
      const r = context.read(off);
      const params = JSON.parse(r.text());
      const now = Date.now();
      const id = charwise.encode(now).toString('hex');

      if (
        !approvedRequests.find(
          ({ method, url }) =>
            method === params.method && minimatch(params.url, url),
        )
      ) {
        throw new Error(`Unapproved request - ${params.method}: ${params.url}`);
      }

      if (
        params.notaryUrl &&
        !approvedNotary.find((n) => n === params.notaryUrl)
      ) {
        throw new Error(`Unapproved notary: ${params.notaryUrl}`);
      }

      if (
        params.websocketProxyUrl &&
        !approvedProxy.find((w) => w === params.websocketProxyUrl)
      ) {
        throw new Error(`Unapproved proxy: ${params.websocketProxyUrl}`);
      }

      (async () => {
        const {
          url,
          method,
          headers,
          getSecretResponse,
          body: reqBody,
        } = params;
        let secretResps;
        const resp = await fetch(url, {
          method,
          headers,
        });
        const body = await extractBodyFromResponse(resp);

        if (getSecretResponse) {
          const out = await plugin.call(getSecretResponse, body);
          secretResps = JSON.parse(out.string());
        }

        handleExecPluginProver({
          type: BackgroundActiontype.execute_plugin_prover,
          data: {
            ...params,
            body: reqBody,
            secretResps,
            now,
          },
        });
      })();

      return context.store(`${id}`);
    },
  };

  const funcs: {
    [key: string]: (callContext: CallContext, ...args: any[]) => any;
  } = {};

  for (const fn of Object.keys(VALID_HOST_FUNCS)) {
    funcs[fn] = function (context: CallContext) {
      throw new Error(`no permission for ${fn}`);
    };
  }

  if (config?.hostFunctions) {
    for (const fn of config.hostFunctions) {
      funcs[fn] = HostFunctions[fn];
    }
  }

  if (config?.cookies) {
    const cookies: { [hostname: string]: { [key: string]: string } } = {};
    for (const host of config.cookies) {
      const cache = await getCookiesByHost(host);
      cookies[host] = cache;
    }
    // @ts-ignore
    injectedConfig.cookies = JSON.stringify(cookies);
  }

  if (config?.headers) {
    const headers: { [hostname: string]: { [key: string]: string } } = {};
    for (const host of config.headers) {
      const cache = await getHeadersByHost(host);
      headers[host] = cache;
    }
    // @ts-ignore
    injectedConfig.headers = JSON.stringify(headers);
  }

  const pluginConfig: ExtismPluginOptions = {
    useWasi: true,
    config: injectedConfig,
    // allowedHosts: approvedRequests.map((r) => urlify(r.url)?.origin),
    functions: {
      'extism:host/user': funcs,
    },
  };

  const plugin = await createPlugin(module, pluginConfig);
  return plugin;
};

export type StepConfig = {
  title: string;
  description?: string;
  cta: string;
  action: string;
  prover?: boolean;
};

export type PluginConfig = {
  title: string;
  description: string;
  icon?: string;
  steps?: StepConfig[];
  hostFunctions?: string[];
  cookies?: string[];
  headers?: string[];
  requests: { method: string; url: string }[];
  notaryUrls?: string[];
  proxyUrls?: string[];
};

export type PluginMetadata = {
  origin: string;
  filePath: string;
} & { [k: string]: string };

export const getPluginConfig = async (
  data: Plugin | ArrayBuffer,
): Promise<PluginConfig> => {
  const plugin = data instanceof ArrayBuffer ? await makePlugin(data) : data;
  const out = await plugin.call('config');
  const config: PluginConfig = JSON.parse(out.string());

  assert(typeof config.title === 'string' && config.title.length);
  assert(typeof config.description === 'string' && config.description.length);
  assert(!config.icon || typeof config.icon === 'string');

  for (const req of config.requests) {
    assert(typeof req.method === 'string' && req.method);
    assert(typeof req.url === 'string' && req.url);
  }

  if (config.hostFunctions) {
    for (const func of config.hostFunctions) {
      assert(typeof func === 'string' && !!VALID_HOST_FUNCS[func]);
    }
  }

  if (config.notaryUrls) {
    for (const notaryUrl of config.notaryUrls) {
      assert(typeof notaryUrl === 'string' && notaryUrl);
    }
  }

  if (config.proxyUrls) {
    for (const proxyUrl of config.proxyUrls) {
      assert(typeof proxyUrl === 'string' && proxyUrl);
    }
  }

  if (config.cookies) {
    for (const name of config.cookies) {
      assert(typeof name === 'string' && name.length);
    }
  }

  if (config.headers) {
    for (const name of config.headers) {
      assert(typeof name === 'string' && name.length);
    }
  }

  if (config.steps) {
    for (const step of config.steps) {
      assert(typeof step.title === 'string' && step.title.length);
      assert(!step.description || typeof step.description);
      assert(typeof step.cta === 'string' && step.cta.length);
      assert(typeof step.action === 'string' && step.action.length);
      assert(!step.prover || typeof step.prover === 'boolean');
    }
  }

  return config;
};

export const assert = (expr: any, msg = 'unknown error') => {
  if (!expr) throw new Error(msg);
};

export const hexToArrayBuffer = (hex: string) =>
  new Uint8Array(Buffer.from(hex, 'hex')).buffer;

export const cacheToMap = (cache: NodeCache) => {
  const keys = cache.keys();
  return keys.reduce((acc: { [k: string]: string }, key) => {
    acc[key] = cache.get(key) || '';
    return acc;
  }, {});
};

export function safeParseJSON(data?: string | null) {
  try {
    return JSON.parse(data!);
  } catch (e) {
    return null;
  }
}
