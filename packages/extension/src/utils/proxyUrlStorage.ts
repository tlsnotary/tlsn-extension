const DB_NAME = 'tlsn-settings';
const STORE_NAME = 'settings';
const PROXY_URL_KEY = 'proxyBaseUrl';

/**
 * Open the IndexedDB database for settings storage
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Get the stored proxy base URL from IndexedDB.
 * Returns null if not set or on error.
 */
export async function getStoredProxyUrl(): Promise<string | null> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(PROXY_URL_KEY);

      request.onsuccess = () => {
        const value = request.result;
        if (typeof value === 'string' && value.length > 0) {
          resolve(value);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        resolve(null);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    return null;
  }
}

/**
 * Store the proxy base URL in IndexedDB.
 * Pass null to clear the setting.
 */
export async function setStoredProxyUrl(url: string | null): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request =
        url !== null
          ? store.put(url, PROXY_URL_KEY)
          : store.delete(PROXY_URL_KEY);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to store proxy URL'));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to store proxy URL:', error);
    throw error;
  }
}
