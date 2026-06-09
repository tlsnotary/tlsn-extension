import { LogLevel, DEFAULT_LOG_LEVEL, nameToLogLevel } from '@tlsn/common';

const DB_NAME = 'tlsn-settings';
const STORE_NAME = 'settings';
const LOG_LEVEL_KEY = 'logLevel';

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
 * Get the stored log level from IndexedDB
 * Returns DEFAULT_LOG_LEVEL (WARN) if not set or on error
 */
export async function getStoredLogLevel(): Promise<LogLevel> {
  try {
    const db = await openDatabase();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(LOG_LEVEL_KEY);

      request.onsuccess = () => {
        const value = request.result;
        if (typeof value === 'number' && value >= 0 && value <= 3) {
          resolve(value as LogLevel);
        } else if (typeof value === 'string') {
          resolve(nameToLogLevel(value));
        } else {
          resolve(DEFAULT_LOG_LEVEL);
        }
      };

      request.onerror = () => {
        resolve(DEFAULT_LOG_LEVEL);
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch {
    return DEFAULT_LOG_LEVEL;
  }
}

/**
 * Store the log level in IndexedDB
 */
export async function setStoredLogLevel(level: LogLevel): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(level, LOG_LEVEL_KEY);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to store log level'));
      };

      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    // Note: Using console.error here as logger may not be initialized yet
    // eslint-disable-next-line no-console
    console.error('Failed to store log level:', error);
    throw error;
  }
}
