import { Level } from 'level';
import type { RequestHistory } from './rpc';
import { PluginConfig, PluginMetadata, sha256 } from '../../utils/misc';
import mutex from './mutex';
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

export async function setNotaryRequestVerification(
  id: string,
  verification: { sent: string; recv: string },
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

export async function getPluginByHash(hash: string): Promise<string | null> {
  try {
    const plugin = await pluginDb.get(hash);
    return plugin;
  } catch (e) {
    return null;
  }
}

export async function addPlugin(hex: string): Promise<string | null> {
  const hash = await sha256(hex);

  if (await getPluginByHash(hash)) {
    return null;
  }

  await pluginDb.put(hash, hex);
  return hash;
}

export async function removePlugin(hash: string): Promise<string | null> {
  const existing = await pluginDb.get(hash);

  if (!existing) return null;

  await pluginDb.del(hash);

  return hash;
}

export async function getPluginConfigByHash(
  hash: string,
): Promise<PluginConfig | null> {
  try {
    const config = await pluginConfigDb.get(hash);
    return config;
  } catch (e) {
    return null;
  }
}

export async function addPluginConfig(
  hash: string,
  config: PluginConfig,
): Promise<PluginConfig | null> {
  if (await getPluginConfigByHash(hash)) {
    return null;
  }

  await pluginConfigDb.put(hash, config);
  return config;
}

export async function removePluginConfig(
  hash: string,
): Promise<PluginConfig | null> {
  const existing = await pluginConfigDb.get(hash);

  if (!existing) return null;

  await pluginConfigDb.del(hash);

  return existing;
}

export async function getPlugins(): Promise<
  (PluginConfig & { hash: string; metadata: PluginMetadata })[]
> {
  const hashes = await getPluginHashes();
  const ret: (PluginConfig & { hash: string; metadata: PluginMetadata })[] = [];
  for (const hash of hashes) {
    const config = await getPluginConfigByHash(hash);
    const metadata = await getPluginMetadataByHash(hash);
    if (config) {
      ret.push({
        ...config,
        hash,
        metadata: metadata || {
          filePath: '',
          origin: '',
        },
      });
    }
  }
  return ret;
}

export async function getPluginMetadataByHash(
  hash: string,
): Promise<PluginMetadata | null> {
  try {
    const metadata = await pluginMetadataDb.get(hash);
    return metadata;
  } catch (e) {
    return null;
  }
}

export async function addPluginMetadata(
  hash: string,
  metadata: PluginMetadata,
): Promise<PluginMetadata | null> {
  await pluginMetadataDb.put(hash, metadata);
  return metadata;
}

export async function removePluginMetadata(
  hash: string,
): Promise<PluginMetadata | null> {
  const existing = await pluginMetadataDb.get(hash);

  if (!existing) return null;

  await pluginMetadataDb.del(hash);

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

export async function getCookies(host: string, name: string) {
  try {
    const existing = await cookiesDb.sublevel(host).get(name);
    return existing;
  } catch (e) {
    return null;
  }
}

export async function getCookiesByHost(host: string) {
  const ret: { [key: string]: string } = {};
  for await (const [key, value] of cookiesDb.sublevel(host).iterator()) {
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

export async function setHeaders(host: string, name: string, value?: string) {
  if (!value) return null;
  return mutex.runExclusive(async () => {
    await headersDb.sublevel(host).put(name, value);
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

export async function getHeadersByHost(host: string) {
  const ret: { [key: string]: string } = {};
  for await (const [key, value] of headersDb.sublevel(host).iterator()) {
    ret[key] = value;
  }
  return ret;
}
