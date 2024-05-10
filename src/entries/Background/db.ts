import { Level } from 'level';
import type { RequestHistory } from './rpc';
import { sha256 } from '../../utils/misc';
const charwise = require('charwise');

const db = new Level('./ext-db', {
  valueEncoding: 'json',
});
const historyDb = db.sublevel<string, RequestHistory>('history', {
  valueEncoding: 'json',
});
const pluginDb = db.sublevel<string, string>('plugin', {
  valueEncoding: 'hex',
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
  return historyDb.get(id);
}

export async function getPluginHashes(): Promise<string[]> {
  const retVal: string[] = [];
  for await (const [key] of pluginDb.iterator()) {
    // await pluginDb.del(key);
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
