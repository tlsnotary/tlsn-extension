import { Level } from 'level';
import { AbstractSublevel } from 'abstract-level';
import { PluginConfig, PluginMetadata, sha256, urlify } from '../../utils/misc';
import { RequestHistory, RequestProgress } from './rpc';
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
const cookiesDb = db.sublevel<string, boolean>('cookies', {
  valueEncoding: 'json',
});
const headersDb = db.sublevel<string, boolean>('headers', {
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
enum AppDatabaseKey {
  DefaultPluginsInstalled = 'DefaultPluginsInstalled',
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

export async function setCookies(host: string, name: string, value: string) {
  return mutex.runExclusive(async () => {
    await cookiesDb.sublevel(host).put(name, value);
    return true;
  });
}

export async function clearCookies(host: string) {
  return mutex.runExclusive(async () => {
    await cookiesDb.sublevel(host).clear();
    return true;
  });
}

export async function getCookies(link: string, name: string) {
  try {
    const existing = await cookiesDb.sublevel(link).get(name);
    return existing;
  } catch (e) {
    return null;
  }
}

export async function getCookiesByHost(link: string) {
  const ret: { [key: string]: string } = {};
  const links: { [k: string]: boolean } = {};
  const url = urlify(link);

  for await (const sublevel of cookiesDb.keys({ keyEncoding: 'utf8' })) {
    const l = sublevel.split('!')[1];
    links[l] = true;
  }

  const cookieLink = url
    ? Object.keys(links).filter((l) => minimatch(l, link))[0]
    : Object.keys(links).filter((l) => urlify(l)?.host === link)[0];

  if (!cookieLink) return ret;

  for await (const [key, value] of cookiesDb.sublevel(cookieLink).iterator()) {
    ret[key] = value;
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

export async function setHeaders(link: string, name: string, value?: string) {
  if (!value) return null;
  return mutex.runExclusive(async () => {
    await headersDb.sublevel(link).put(name, value);
    return true;
  });
}

export async function clearHeaders(host: string) {
  return mutex.runExclusive(async () => {
    await headersDb.sublevel(host).clear();
    return true;
  });
}

export async function getHeaders(host: string, name: string) {
  try {
    const existing = await headersDb.sublevel(host).get(name);
    return existing;
  } catch (e) {
    return null;
  }
}
export async function getHeadersByHost(link: string) {
  const ret: { [key: string]: string } = {};
  const url = urlify(link);

  const links: { [k: string]: boolean } = {};
  for await (const sublevel of headersDb.keys({ keyEncoding: 'utf8' })) {
    const l = sublevel.split('!')[1];
    links[l] = true;
  }

  const headerLink = url
    ? Object.keys(links).filter((l) => minimatch(l, link))[0]
    : Object.keys(links).filter((l) => urlify(l)?.host === link)[0];

  if (!headerLink) return ret;

  for await (const [key, value] of headersDb.sublevel(headerLink).iterator()) {
    ret[key] = value;
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
      cookiesDb.clear(),
      headersDb.clear(),
      localStorageDb.clear(),
      sessionStorageDb.clear(),
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

export async function getDBSize(): Promise<number> {
  const sizes = await Promise.all([
    getDBSizeByRoot(cookiesDb),
    getDBSizeByRoot(headersDb),
    getDBSizeByRoot(localStorageDb),
    getDBSizeByRoot(sessionStorageDb),
  ]);
  return sizes.reduce((a, b) => a + b, 0);
}
