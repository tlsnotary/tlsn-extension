import { Level } from 'level';
import { AbstractSublevel } from 'abstract-level';
import { PluginConfig, PluginMetadata, sha256, urlify } from '../../utils/misc';
import {
  RequestHistory,
  RequestLog,
  RequestProgress,
  UpsertRequestLog,
} from './rpc';
import mutex from './mutex';
import { minimatch } from 'minimatch';
const charwise = require('charwise');

export const db = new Level('./ext-db', {
  valueEncoding: 'json',
});
const historyDb = db.sublevel<string, RequestHistory>('history', {
  valueEncoding: 'json',
});
const pluginDb = db.sublevel<string, string>('plugin', {
  valueEncoding: 'hex',
});
const pluginConfigDb = db.sublevel<string, PluginConfig>('pluginConfig', {
  valueEncoding: 'json',
});
const pluginMetadataDb = db.sublevel<string, PluginMetadata>('pluginMetadata', {
  valueEncoding: 'json',
});
const connectionDb = db.sublevel<string, boolean>('connections', {
  valueEncoding: 'json',
});
const localStorageDb = db.sublevel<string, any>('sessionStorage', {
  valueEncoding: 'json',
});
const sessionStorageDb = db.sublevel<string, any>('localStorage', {
  valueEncoding: 'json',
});
const appDb = db.sublevel<string, any>('app', {
  valueEncoding: 'json',
});
const requestDb = db.sublevel<string, any>('requests', {
  valueEncoding: 'json',
});

enum AppDatabaseKey {
  DefaultPluginsInstalled = 'DefaultPluginsInstalled',
}

export async function upsertRequestLog(request: UpsertRequestLog) {
  const existing = await getRequestLog(request.requestId);

  if (existing) {
    await requestDb.put(request.requestId, {
      ...existing,
      ...request,
    });
  } else if (request.url) {
    const host = urlify(request.url)?.host;
    if (host) {
      await requestDb.put(request.requestId, request);
      await requestDb
        .sublevel(request.tabId.toString())
        .put(request.requestId, '');
      await requestDb.sublevel(host).put(request.requestId, '');
    }
  }
}

export async function getRequestLog(
  requestId: string,
): Promise<RequestLog | null> {
  return requestDb.get(requestId).catch(() => null);
}

export async function removeRequestLog(requestId: string) {
  const existing = await getRequestLog(requestId);
  if (existing) {
    await requestDb.del(requestId);
    await requestDb.sublevel(existing.tabId.toString()).del(requestId);
    const host = urlify(existing.url)?.host;
    if (host) {
      await requestDb.sublevel(host).del(requestId);
    }
  }
}

export async function removeRequestLogsByTabId(tabId: number) {
  const requests = requestDb.sublevel(tabId.toString());
  for await (const [requestId] of requests.iterator()) {
    await removeRequestLog(requestId);
  }
}

export async function getRequestLogsByTabId(tabId: number) {
  const requests = requestDb.sublevel(tabId.toString());
  const ret: RequestLog[] = [];
  for await (const [requestId] of requests.iterator()) {
    ret.push(await requestDb.get(requestId));
  }
  return ret;
}

export async function getRequestLogsByHost(host: string) {
  const requests = requestDb.sublevel(host);
  const ret: RequestLog[] = [];
  for await (const [requestId] of requests.iterator()) {
    ret.push(await requestDb.get(requestId));
  }
  return ret;
}

export async function clearAllRequestLogs() {
  await requestDb.clear();
}

export async function addNotaryRequest(
  now = Date.now(),
  request: Omit<RequestHistory, 'status' | 'id'>,
): Promise<RequestHistory> {
  const id = charwise.encode(now).toString('hex');
  const newReq: RequestHistory = {
    ...request,
    id,
    status: '',
  };
  await historyDb.put(id, newReq);
  return newReq;
}

export async function addNotaryRequestProofs(
  id: string,
  proof: { session: any; substrings: any },
): Promise<RequestHistory | null> {
  const existing = await historyDb.get(id);

  if (!existing) return null;

  const newReq: RequestHistory = {
    ...existing,
    proof,
    status: 'success',
  };

  await historyDb.put(id, newReq);

  return newReq;
}

export async function setNotaryRequestStatus(
  id: string,
  status: '' | 'pending' | 'success' | 'error',
): Promise<RequestHistory | null> {
  const existing = await historyDb.get(id);

  if (!existing) return null;

  const newReq = {
    ...existing,
    status,
  };

  await historyDb.put(id, newReq);

  return newReq;
}

export async function setNotaryRequestError(
  id: string,
  error: any,
): Promise<RequestHistory | null> {
  const existing = await historyDb.get(id);

  if (!existing) return null;

  const newReq: RequestHistory = {
    ...existing,
    error,
    status: 'error',
  };

  await historyDb.put(id, newReq);

  return newReq;
}

export async function setNotaryRequestProgress(
  id: string,
  progress: RequestProgress,
  errorMessage?: string,
): Promise<RequestHistory | null> {
  const existing = await historyDb.get(id);
  if (!existing) return null;

  const newReq: RequestHistory = {
    ...existing,
    progress,
    errorMessage,
  };

  await historyDb.put(id, newReq);

  return newReq;
}

export async function setNotaryRequestVerification(
  id: string,
  verification: {
    sent: string;
    recv: string;
    verifierKey: string;
    notaryKey?: string;
  },
): Promise<RequestHistory | null> {
  const existing = await historyDb.get(id);

  if (!existing) return null;

  const newReq = {
    ...existing,
    verification,
  };

  await historyDb.put(id, newReq);

  return newReq;
}

export async function removeNotaryRequest(
  id: string,
): Promise<RequestHistory | null> {
  const existing = await historyDb.get(id);

  if (!existing) return null;

  await historyDb.del(id);

  return existing;
}

export async function getNotaryRequests(): Promise<RequestHistory[]> {
  const retVal = [];
  for await (const [key, value] of historyDb.iterator()) {
    retVal.push(value);
  }
  return retVal;
}

export async function getNotaryRequest(
  id: string,
): Promise<RequestHistory | null> {
  return historyDb.get(id).catch(() => null);
}

export async function getPluginHashes(): Promise<string[]> {
  const retVal: string[] = [];
  for await (const [key] of pluginDb.iterator()) {
    retVal.push(key);
  }
  return retVal;
}

export async function getPluginByUrl(url: string): Promise<string | null> {
  try {
    const plugin = await pluginDb.get(url);
    return plugin;
  } catch (e) {
    return null;
  }
}

export async function addPlugin(
  hex: string,
  url: string,
): Promise<string | null> {
  const hash = await sha256(hex);

  if (await getPluginByUrl(url)) {
    return url;
  }

  await pluginDb.put(url, hex);
  return hash;
}

export async function removePlugin(url: string): Promise<string | null> {
  const existing = await pluginDb.get(url);

  if (!existing) return null;

  await pluginDb.del(url);

  return url;
}

export async function getPluginConfigByUrl(
  url: string,
): Promise<PluginConfig | null> {
  try {
    const config = await pluginConfigDb.get(url);
    return config;
  } catch (e) {
    return null;
  }
}

export async function addPluginConfig(
  url: string,
  config: PluginConfig,
): Promise<PluginConfig | null> {
  if (await getPluginConfigByUrl(url)) {
    return null;
  }

  await pluginConfigDb.put(url, config);
  return config;
}

export async function removePluginConfig(
  url: string,
): Promise<PluginConfig | null> {
  const existing = await pluginConfigDb.get(url);

  if (!existing) return null;

  await pluginConfigDb.del(url);

  return existing;
}

export async function getPlugins(): Promise<
  (PluginConfig & { hash: string; metadata: PluginMetadata })[]
> {
  const hashes = await getPluginHashes();
  const ret: (PluginConfig & { hash: string; metadata: PluginMetadata })[] = [];
  for (const hash of hashes) {
    const config = await getPluginConfigByUrl(hash);
    const metadata = await getPluginMetadataByUrl(hash);
    if (config) {
      ret.push({
        ...config,
        hash,
        metadata: metadata
          ? {
              ...metadata,
              hash,
            }
          : {
              filePath: '',
              origin: '',
              hash,
            },
      });
    }
  }
  return ret;
}

export async function getPluginMetadataByUrl(
  url: string,
): Promise<PluginMetadata | null> {
  try {
    const metadata = await pluginMetadataDb.get(url);
    return metadata;
  } catch (e) {
    return null;
  }
}

export async function addPluginMetadata(
  url: string,
  metadata: PluginMetadata,
): Promise<PluginMetadata | null> {
  await pluginMetadataDb.put(url, metadata);
  return metadata;
}

export async function removePluginMetadata(
  url: string,
): Promise<PluginMetadata | null> {
  const existing = await pluginMetadataDb.get(url);

  if (!existing) return null;

  await pluginMetadataDb.del(url);

  return existing;
}

export async function setNotaryRequestCid(
  id: string,
  cid: string,
): Promise<RequestHistory | null> {
  const existing = await historyDb.get(id);

  if (!existing) return null;

  const newReq = {
    ...existing,
    cid,
  };

  await historyDb.put(id, newReq);

  return newReq;
}

export async function setConnection(origin: string) {
  if (await getConnection(origin)) return null;
  await connectionDb.put(origin, true);
  return true;
}

export async function getCookiesByHost(linkOrHost: string) {
  const ret: { [key: string]: string } = {};
  const links: { [k: string]: boolean } = {};
  const url = urlify(linkOrHost);
  const isHost = !url;
  const host = isHost ? linkOrHost : url.host;
  const requests = await getRequestLogsByHost(host);

  let filteredRequest: RequestLog | null = null;

  for (const request of requests) {
    if (isHost) {
      if (!filteredRequest || filteredRequest.updatedAt > request.updatedAt) {
        filteredRequest = request;
      }
    } else {
      if (
        !filteredRequest ||
        (filteredRequest.updatedAt > request.updatedAt &&
          minimatch(request.url, linkOrHost))
      ) {
        filteredRequest = request;
      }
    }
  }

  if (!filteredRequest) return ret;

  for (const header of filteredRequest.requestHeaders) {
    if (header.name.toLowerCase() === 'cookie') {
      header.value?.split(';').forEach((cookie) => {
        const [name, value] = cookie.split('=');
        ret[name.trim()] = value.trim();
      });
    }
  }

  return ret;
}

export async function deleteConnection(origin: string) {
  return mutex.runExclusive(async () => {
    if (await getConnection(origin)) {
      await connectionDb.del(origin);
    }
  });
}

export async function getConnection(origin: string) {
  try {
    const existing = await connectionDb.get(origin);
    return existing;
  } catch (e) {
    return null;
  }
}
export async function getHeadersByHost(linkOrHost: string) {
  const ret: { [key: string]: string } = {};
  const url = urlify(linkOrHost);
  const isHost = !url;
  const host = isHost ? linkOrHost : url.host;
  const requests = await getRequestLogsByHost(host);

  let filteredRequest: RequestLog | null = null;

  for (const request of requests) {
    if (isHost) {
      if (!filteredRequest || filteredRequest.updatedAt > request.updatedAt) {
        filteredRequest = request;
      }
    } else {
      if (
        !filteredRequest ||
        (filteredRequest.updatedAt > request.updatedAt &&
          minimatch(request.url, linkOrHost))
      ) {
        filteredRequest = request;
      }
    }
  }

  if (!filteredRequest) return ret;

  for (const header of filteredRequest.requestHeaders) {
    if (header.name.toLowerCase() !== 'cookie') {
      ret[header.name] = header.value || '';
    }
  }

  return ret;
}

export async function setLocalStorage(
  host: string,
  name: string,
  value: string,
) {
  return mutex.runExclusive(async () => {
    await localStorageDb.sublevel(host).put(name, value);
    return true;
  });
}

export async function setSessionStorage(
  host: string,
  name: string,
  value: string,
) {
  return mutex.runExclusive(async () => {
    await sessionStorageDb.sublevel(host).put(name, value);
    return true;
  });
}

export async function clearLocalStorage(host: string) {
  return mutex.runExclusive(async () => {
    await localStorageDb.sublevel(host).clear();
    return true;
  });
}

export async function clearSessionStorage(host: string) {
  return mutex.runExclusive(async () => {
    await sessionStorageDb.sublevel(host).clear();
    return true;
  });
}

export async function getLocalStorageByHost(host: string) {
  const ret: { [key: string]: string } = {};
  for await (const [key, value] of localStorageDb.sublevel(host).iterator()) {
    ret[key] = value;
  }
  return ret;
}

export async function getSessionStorageByHost(host: string) {
  const ret: { [key: string]: string } = {};
  for await (const [key, value] of sessionStorageDb.sublevel(host).iterator()) {
    ret[key] = value;
  }
  return ret;
}

async function getDefaultPluginsInstalled(): Promise<string | boolean> {
  return appDb.get(AppDatabaseKey.DefaultPluginsInstalled).catch(() => false);
}

export async function setDefaultPluginsInstalled(
  installed: string | boolean = false,
) {
  return mutex.runExclusive(async () => {
    await appDb.put(AppDatabaseKey.DefaultPluginsInstalled, installed);
  });
}

export async function getAppState() {
  return {
    defaultPluginsInstalled: await getDefaultPluginsInstalled(),
  };
}

export async function resetDB() {
  return mutex.runExclusive(async () => {
    return Promise.all([
      localStorageDb.clear(),
      sessionStorageDb.clear(),
      requestDb.clear(),
    ]);
  });
}

export async function getDBSizeByRoot(
  rootDB: AbstractSublevel<Level, any, any, any>,
): Promise<number> {
  return new Promise(async (resolve, reject) => {
    let size = 0;

    for await (const sublevel of rootDB.keys({ keyEncoding: 'utf8' })) {
      const link = sublevel.split('!')[1];
      const sub = rootDB.sublevel(link);
      for await (const [key, value] of sub.iterator()) {
        size += key.length + value.length;
      }
    }

    resolve(size);
  });
}

export async function getRecursiveDBSize(
  db: AbstractSublevel<Level, any, any, any>,
): Promise<number> {
  return new Promise(async (resolve, reject) => {
    let size = 0;
    for await (const sublevel of db.keys({ keyEncoding: 'utf8' })) {
      const parts = sublevel.split('!');
      if (parts.length === 1) {
        const value = await db.get(parts[0]);
        size += parts[0].length + (value ? JSON.stringify(value).length : 0);
      } else {
        const sub = db.sublevel(parts[1]);
        size +=
          (await getRecursiveDBSize(
            sub as unknown as AbstractSublevel<Level, any, any, any>,
          )) + parts[1].length;
      }
    }
    resolve(size);
  });
}

export async function getDBSize(): Promise<number> {
  const sizes = await Promise.all([
    getDBSizeByRoot(localStorageDb),
    getDBSizeByRoot(sessionStorageDb),
    getRecursiveDBSize(requestDb),
  ]);
  return sizes.reduce((a, b) => a + b, 0);
}
