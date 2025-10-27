/**
 * Vitest test setup file
 *
 * This file runs before all tests to set up the testing environment,
 * including mocking browser APIs for Chrome extension testing.
 */

import { vi } from 'vitest';

// Create a mock chrome object with runtime.id (required for webextension-polyfill)
const chromeMock = {
  runtime: {
    id: 'test-extension-id',
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(),
    },
    getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
    onInstalled: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    getContexts: vi.fn(),
  },
  windows: {
    create: vi.fn(),
    get: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
    onRemoved: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn(),
    get: vi.fn(),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  webRequest: {
    onBeforeRequest: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    onBeforeSendHeaders: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
    sync: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
  },
  offscreen: {
    createDocument: vi.fn(),
  },
};

// Set up chrome global for webextension-polyfill
globalThis.chrome = chromeMock as any;

// Mock webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      id: 'test-extension-id',
      sendMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
    },
    windows: {
      create: vi.fn(),
      get: vi.fn(),
      remove: vi.fn(),
      onRemoved: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    tabs: {
      sendMessage: vi.fn(),
      onUpdated: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      query: vi.fn(),
    },
    webRequest: {
      onBeforeRequest: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      onBeforeSendHeaders: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
    storage: {
      local: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
      },
      sync: {
        get: vi.fn(),
        set: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
      },
    },
  },
}));

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});
