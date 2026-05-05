const DB_NAME = 'tlsn-settings';
const DB_VERSION = 2;
const SETTINGS_STORE = 'settings';
const PLUGIN_COUNTS_STORE = 'pluginCounts';

interface PluginCountRecord {
  hash: string;
  count: number;
  lastExecutedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE);
      }
      if (!db.objectStoreNames.contains(PLUGIN_COUNTS_STORE)) {
        db.createObjectStore(PLUGIN_COUNTS_STORE, { keyPath: 'hash' });
      }
    };
  });
}

export async function getPluginCount(hash: string): Promise<number> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(PLUGIN_COUNTS_STORE, 'readonly');
      const store = transaction.objectStore(PLUGIN_COUNTS_STORE);
      const request = store.get(hash);

      request.onsuccess = () => {
        const value = request.result as PluginCountRecord | undefined;
        if (value && typeof value.count === 'number') {
          resolve(value.count);
        } else {
          resolve(0);
        }
      };

      request.onerror = () => {
        resolve(0);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    return 0;
  }
}

export async function incrementPluginCount(hash: string): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PLUGIN_COUNTS_STORE, 'readwrite');
      const store = transaction.objectStore(PLUGIN_COUNTS_STORE);
      const getRequest = store.get(hash);

      getRequest.onsuccess = () => {
        const existing = getRequest.result as PluginCountRecord | undefined;
        const current: PluginCountRecord = existing ?? {
          hash,
          count: 0,
          lastExecutedAt: '',
        };
        const next: PluginCountRecord = {
          hash,
          count: current.count + 1,
          lastExecutedAt: new Date().toISOString(),
        };
        const putRequest = store.put(next);

        putRequest.onsuccess = () => {
          resolve();
        };

        putRequest.onerror = () => {
          reject(new Error('Failed to increment plugin count'));
        };
      };

      getRequest.onerror = () => {
        reject(new Error('Failed to increment plugin count'));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to increment plugin count:', error);
    throw error;
  }
}
