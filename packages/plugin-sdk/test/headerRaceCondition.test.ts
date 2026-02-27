/**
 * Tests for the header interception race condition fix.
 *
 * Bug: Headers intercepted between window creation and event listener
 * registration were silently dropped. The fix registers the listener
 * BEFORE calling onOpenWindow, buffering messages until the windowId
 * is known, then replaying them.
 *
 * These tests verify the fix by simulating headers arriving during the
 * onOpenWindow await — the exact scenario that caused the bug.
 */
import { describe, it, expect, vi } from 'vitest';
import { Host } from '../src/index';

type Listener = (message: any) => void;

function createTestEventEmitter() {
  const listeners: Listener[] = [];
  return {
    emit: (message: any) => {
      listeners.forEach((l) => l(message));
    },
    addListener: (listener: Listener) => {
      listeners.push(listener);
    },
    removeListener: (listener: Listener) => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    },
    get listenerCount() {
      return listeners.length;
    },
  };
}

describe.skipIf(typeof window !== 'undefined')('Header race condition fix', () => {
  it('should not lose headers emitted during onOpenWindow await', async () => {
    const eventEmitter = createTestEventEmitter();
    const onRenderPluginUi = vi.fn();

    // The critical mock: onOpenWindow fires headers on the event emitter
    // BEFORE resolving. This simulates the real-world scenario where
    // WindowManager starts intercepting headers as soon as windows.create()
    // returns, but the WINDOW_OPENED response hasn't reached the SDK yet.
    const WINDOW_ID = 42;
    const onOpenWindow = vi.fn().mockImplementation(async () => {
      // Simulate: background creates window → headers start flowing immediately
      // These fire while the SDK is still awaiting the onOpenWindow response
      eventEmitter.emit({
        type: 'HEADER_INTERCEPTED',
        header: {
          id: '1',
          method: 'GET',
          url: 'https://api.x.com/1.1/account/settings.json',
          timestamp: Date.now(),
          type: 'xmlhttprequest',
          requestHeaders: [{ name: 'Authorization', value: 'Bearer EARLY_TOKEN' }],
          tabId: 100,
        },
        windowId: WINDOW_ID,
      });

      eventEmitter.emit({
        type: 'HEADER_INTERCEPTED',
        header: {
          id: '2',
          method: 'GET',
          url: 'https://api.x.com/2/timeline',
          timestamp: Date.now(),
          type: 'xmlhttprequest',
          requestHeaders: [{ name: 'Authorization', value: 'Bearer EARLY_TOKEN_2' }],
          tabId: 100,
        },
        windowId: WINDOW_ID,
      });

      // Then the response arrives
      return {
        type: 'WINDOW_OPENED',
        payload: { windowId: WINDOW_ID, uuid: 'test-uuid', tabId: 100 },
      };
    });

    const host = new Host({
      onProve: vi.fn(),
      onRenderPluginUi,
      onCloseWindow: vi.fn(),
      onOpenWindow,
    });

    // Plugin that opens a window and uses useHeaders to find auth headers.
    // If early headers are lost, useHeaders returns empty and the plugin
    // reports "no_headers". If they're captured, it reports "found:<count>".
    const pluginCode = `
export const config = { name: 'Race Condition Test' };

export function main() {
  openWindow('https://x.com');
  const allHeaders = useHeaders((h) => h);
  const authHeaders = allHeaders.filter(
    (h) => h.requestHeaders && h.requestHeaders.some(
      (rh) => rh.name === 'Authorization'
    )
  );
  if (authHeaders.length > 0) {
    done('found:' + authHeaders.length);
  }
  return div({}, ['waiting for headers...']);
}
`.trim();

    const result = await host.executePlugin(pluginCode, { eventEmitter });
    expect(result).toBe('found:2');
  }, 30_000);

  it('should not lose headers in a batch emitted during onOpenWindow await', async () => {
    const eventEmitter = createTestEventEmitter();
    const WINDOW_ID = 43;

    const onOpenWindow = vi.fn().mockImplementation(async () => {
      // Simulate a HEADERS_BATCH arriving during the await
      eventEmitter.emit({
        type: 'HEADERS_BATCH',
        headers: [
          {
            id: '10',
            method: 'GET',
            url: 'https://api.x.com/graphql/1',
            timestamp: Date.now(),
            type: 'xmlhttprequest',
            requestHeaders: [{ name: 'Authorization', value: 'Bearer BATCH_1' }],
            tabId: 200,
          },
          {
            id: '11',
            method: 'POST',
            url: 'https://api.x.com/graphql/2',
            timestamp: Date.now(),
            type: 'xmlhttprequest',
            requestHeaders: [{ name: 'Authorization', value: 'Bearer BATCH_2' }],
            tabId: 200,
          },
          {
            id: '12',
            method: 'GET',
            url: 'https://api.x.com/graphql/3',
            timestamp: Date.now(),
            type: 'xmlhttprequest',
            requestHeaders: [{ name: 'Authorization', value: 'Bearer BATCH_3' }],
            tabId: 200,
          },
        ],
        windowId: WINDOW_ID,
      });

      return {
        type: 'WINDOW_OPENED',
        payload: { windowId: WINDOW_ID, uuid: 'test-uuid-2', tabId: 200 },
      };
    });

    const host = new Host({
      onProve: vi.fn(),
      onRenderPluginUi: vi.fn(),
      onCloseWindow: vi.fn(),
      onOpenWindow,
    });

    const pluginCode = `
export const config = { name: 'Batch Race Test' };

export function main() {
  openWindow('https://x.com');
  const allHeaders = useHeaders((h) => h);
  if (allHeaders.length >= 3) {
    done('batch_captured:' + allHeaders.length);
  }
  return div({}, ['waiting...']);
}
`.trim();

    const result = await host.executePlugin(pluginCode, { eventEmitter });
    expect(result).toBe('batch_captured:3');
  }, 30_000);

  it('should handle headers arriving both before AND after onOpenWindow resolves', async () => {
    const eventEmitter = createTestEventEmitter();
    const WINDOW_ID = 44;

    const onOpenWindow = vi.fn().mockImplementation(async () => {
      // One header arrives BEFORE resolution
      eventEmitter.emit({
        type: 'HEADER_INTERCEPTED',
        header: {
          id: 'early-1',
          method: 'GET',
          url: 'https://api.x.com/early',
          timestamp: Date.now(),
          type: 'xmlhttprequest',
          requestHeaders: [{ name: 'X-Early', value: 'yes' }],
          tabId: 300,
        },
        windowId: WINDOW_ID,
      });

      return {
        type: 'WINDOW_OPENED',
        payload: { windowId: WINDOW_ID, uuid: 'test-uuid-3', tabId: 300 },
      };
    });

    const host = new Host({
      onProve: vi.fn(),
      onRenderPluginUi: vi.fn(),
      onCloseWindow: vi.fn(),
      onOpenWindow,
    });

    const pluginCode = `
export const config = { name: 'Before And After Test' };

export function main() {
  openWindow('https://x.com');
  const allHeaders = useHeaders((h) => h);
  if (allHeaders.length >= 2) {
    done('both:' + allHeaders.length);
  }
  return div({}, ['count:' + allHeaders.length]);
}
`.trim();

    const executePromise = host.executePlugin(pluginCode, { eventEmitter });

    // Wait for plugin to initialize and process the early header
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Emit a LATE header (after listener is registered normally)
    eventEmitter.emit({
      type: 'HEADER_INTERCEPTED',
      header: {
        id: 'late-1',
        method: 'GET',
        url: 'https://api.x.com/late',
        timestamp: Date.now(),
        type: 'xmlhttprequest',
        requestHeaders: [{ name: 'X-Late', value: 'yes' }],
        tabId: 300,
      },
      windowId: WINDOW_ID,
    });

    const result = await executePromise;
    expect(result).toBe('both:2');
  }, 30_000);

  it('should ignore headers from other windows during buffering', async () => {
    const eventEmitter = createTestEventEmitter();
    const WINDOW_ID = 45;
    const OTHER_WINDOW_ID = 999;

    const onOpenWindow = vi.fn().mockImplementation(async () => {
      // Header from a DIFFERENT window arrives during the await
      eventEmitter.emit({
        type: 'HEADER_INTERCEPTED',
        header: {
          id: 'other-1',
          method: 'GET',
          url: 'https://other.com/page',
          timestamp: Date.now(),
          type: 'xmlhttprequest',
          requestHeaders: [{ name: 'X-Other', value: 'yes' }],
          tabId: 999,
        },
        windowId: OTHER_WINDOW_ID,
      });

      // Header from OUR window
      eventEmitter.emit({
        type: 'HEADER_INTERCEPTED',
        header: {
          id: 'ours-1',
          method: 'GET',
          url: 'https://api.x.com/ours',
          timestamp: Date.now(),
          type: 'xmlhttprequest',
          requestHeaders: [{ name: 'X-Ours', value: 'yes' }],
          tabId: 400,
        },
        windowId: WINDOW_ID,
      });

      return {
        type: 'WINDOW_OPENED',
        payload: { windowId: WINDOW_ID, uuid: 'test-uuid-4', tabId: 400 },
      };
    });

    const host = new Host({
      onProve: vi.fn(),
      onRenderPluginUi: vi.fn(),
      onCloseWindow: vi.fn(),
      onOpenWindow,
    });

    const pluginCode = `
export const config = { name: 'Window Filter Test' };

export function main() {
  openWindow('https://x.com');
  const allHeaders = useHeaders((h) => h);
  if (allHeaders.length > 0) {
    done('ours_only:' + allHeaders.length);
  }
  return div({}, ['waiting...']);
}
`.trim();

    const result = await host.executePlugin(pluginCode, { eventEmitter });
    // Should only see our window's header, not the other window's
    expect(result).toBe('ours_only:1');
  }, 30_000);

  it('should clean up listener if onOpenWindow fails', async () => {
    const eventEmitter = createTestEventEmitter();

    const onOpenWindow = vi.fn().mockImplementation(async () => {
      return {
        type: 'WINDOW_ERROR',
        payload: {
          error: 'Failed to create window',
          details: 'Too many windows open',
        },
      };
    });

    const host = new Host({
      onProve: vi.fn(),
      onRenderPluginUi: vi.fn(),
      onCloseWindow: vi.fn(),
      onOpenWindow,
    });

    // Use a plugin that awaits openWindow so the error propagates to main()
    // which triggers terminateWithError → doneReject
    const pluginCode = `
export const config = { name: 'Error Cleanup Test' };

export async function main() {
  try {
    await openWindow('https://x.com');
  } catch (e) {
    // openWindow failed — signal done with error info
    done('error:' + e.message);
  }
  return div({}, ['loading...']);
}
`.trim();

    const result = await host.executePlugin(pluginCode, { eventEmitter });
    expect(result).toBe('error:Too many windows open');

    // Listener should be cleaned up (no leaks)
    expect(eventEmitter.listenerCount).toBe(0);
  }, 30_000);

  it('should handle requests (not just headers) emitted during onOpenWindow await', async () => {
    const eventEmitter = createTestEventEmitter();
    const WINDOW_ID = 46;

    const onOpenWindow = vi.fn().mockImplementation(async () => {
      // Request arrives during the await
      eventEmitter.emit({
        type: 'REQUEST_INTERCEPTED',
        request: {
          id: 'req-1',
          method: 'GET',
          url: 'https://api.x.com/early-request',
          timestamp: Date.now(),
          tabId: 500,
        },
        windowId: WINDOW_ID,
      });

      return {
        type: 'WINDOW_OPENED',
        payload: { windowId: WINDOW_ID, uuid: 'test-uuid-5', tabId: 500 },
      };
    });

    const host = new Host({
      onProve: vi.fn(),
      onRenderPluginUi: vi.fn(),
      onCloseWindow: vi.fn(),
      onOpenWindow,
    });

    const pluginCode = `
export const config = { name: 'Request Race Test' };

export function main() {
  openWindow('https://x.com');
  const allRequests = useRequests((r) => r);
  if (allRequests.length > 0) {
    done('requests:' + allRequests.length);
  }
  return div({}, ['waiting...']);
}
`.trim();

    const result = await host.executePlugin(pluginCode, { eventEmitter });
    expect(result).toBe('requests:1');
  }, 30_000);
});
