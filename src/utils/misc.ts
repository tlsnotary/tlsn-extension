import { RequestLog } from '../entries/Background/rpc';
import { EXPLORER_API } from './constants';
import createPlugin, { CallContext, Plugin } from '@extism/extism';
import browser from 'webextension-polyfill';

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
  const contentType =
    resp?.headers.get('content-type') || resp?.headers.get('Content-Type');

  if (contentType?.includes('application/json')) {
    return resp.text();
  } else if (contentType?.includes('text')) {
    return resp.text();
  } else if (contentType?.includes('image')) {
    return resp.blob().then((blob) => blob.text());
  } else {
    return resp.blob().then((blob) => blob.text());
  }
}

export const sha256 = async (data: string) => {
  const encoder = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((bytes) => bytes.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
};

export const makePlugin = async (arrayBuffer: ArrayBuffer) => {
  const module = await WebAssembly.compile(arrayBuffer);
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const pluginConfig = {
    useWasi: true,
    config: {
      tabUrl: tab.url,
      tabId: tab.id,
    },
    functions: {
      'extism:host/user': {
        get_response: (context: CallContext, off: bigint) => {
          // const r = context.read(off);
          // const param = r.text();
          // const proverConfig = JSON.parse(param);
          // console.log('proving...', proverConfig);
          // dispatch(
          //   // @ts-ignore
          //   notarizeRequest(proverConfig),
          // );
          return context.store('yo');
        },
        has_request_uri: (context: CallContext, off: bigint) => {
          // const r = context.read(off);
          // const requestUri = r.text();
          // const req = requests.filter((req) =>
          //   req.url.includes(requestUri),
          // )[0];
          // return context.store(req ? JSON.stringify(req) : 'undefined');
          return context.store('yo');
        },
      },
    },
  };
  const plugin = await createPlugin(module, pluginConfig);
  return plugin;
};

export type PluginConfig = {
  title: string;
  description: string;
  icon?: string;
  action: string;
  steps?: {
    title: string;
    description?: string;
    cta: string;
    action: string;
  }[];
};

export const getPluginConfig = async (
  data: Plugin | ArrayBuffer,
): Promise<PluginConfig> => {
  const plugin = data instanceof ArrayBuffer ? await makePlugin(data) : data;
  const out = await plugin.call('config');
  const config = JSON.parse(out.string());
  assert(typeof config.title === 'string' && config.title.length);
  assert(typeof config.description === 'string' && config.description.length);
  assert(typeof config.action === 'string' && config.action.length);
  assert(!config.icon || typeof config.icon === 'string');

  if (config.steps) {
    for (const step of config.steps) {
      assert(typeof step.title === 'string' && step.title.length);
      assert(!step.description || typeof step.description);
      assert(typeof step.cta === 'string' && step.cta.length);
      assert(typeof step.action === 'string' && step.action.length);
    }
  }

  return config;
};

export const assert = (expr: any, msg = 'unknown error') => {
  if (!expr) throw new Error(msg);
};
