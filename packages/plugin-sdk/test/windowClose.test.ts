/**
 * Tests for window close handling.
 *
 * Bug: When a user closes a managed window (e.g. the Spotify page) while a
 * plugin is running, the plugin never terminates — done() is never called,
 * so the execCode() Promise hangs forever and the demo page spinner keeps
 * spinning.
 *
 * Fix: When WINDOW_CLOSED is received for the plugin's window, terminate
 * the plugin via onError so the donePromise rejects.
 */
import { describe, it, expect, vi } from 'vitest';
import { Host } from '../src/index';
import type { WindowMessage } from '../src/types';

type Listener = (message: WindowMessage) => void;

function createTestEventEmitter() {
  const listeners: Listener[] = [];
  return {
    emit: (message: WindowMessage) => {
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

describe.skipIf(typeof window !== 'undefined')('Window close handling', () => {
  it('should terminate plugin when its window is closed by user', async () => {
    const eventEmitter = createTestEventEmitter();
    const WINDOW_ID = 50;
    const onCloseWindow = vi.fn();

    const onOpenWindow = vi.fn().mockResolvedValue({
      type: 'WINDOW_OPENED',
      payload: { windowId: WINDOW_ID, uuid: 'test-uuid', tabId: 100 },
    });

    const host = new Host({
      onProve: vi.fn(),
      onRenderPluginUi: vi.fn(),
      onCloseWindow,
      onOpenWindow,
    });

    // Plugin opens a window and waits for headers — never calls done()
    const pluginCode = `
export const config = { name: 'Window Close Test' };

export function main() {
  openWindow('https://x.com');
  const allHeaders = useHeaders((h) => h);
  return div({}, ['waiting for headers: ' + allHeaders.length]);
}
`.trim();

    const executePromise = host.executePlugin(pluginCode, { eventEmitter });

    // Wait for plugin to initialize and open window
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simulate user closing the window
    eventEmitter.emit({
      type: 'WINDOW_CLOSED',
      windowId: WINDOW_ID,
    });

    // The plugin should reject with "Window closed by user"
    await expect(executePromise).rejects.toThrow('Window closed by user');

    // Listener should be cleaned up
    expect(eventEmitter.listenerCount).toBe(0);
  }, 30_000);

  it('should NOT terminate plugin when a different window is closed', async () => {
    const eventEmitter = createTestEventEmitter();
    const WINDOW_ID = 51;
    const OTHER_WINDOW_ID = 999;

    const onOpenWindow = vi.fn().mockResolvedValue({
      type: 'WINDOW_OPENED',
      payload: { windowId: WINDOW_ID, uuid: 'test-uuid', tabId: 100 },
    });

    const host = new Host({
      onProve: vi.fn(),
      onRenderPluginUi: vi.fn(),
      onCloseWindow: vi.fn(),
      onOpenWindow,
    });

    // Plugin opens a window and calls done() when it sees a header
    const pluginCode = `
export const config = { name: 'Other Window Close Test' };

export function main() {
  openWindow('https://x.com');
  const allHeaders = useHeaders((h) => h);
  if (allHeaders.length > 0) {
    done('completed');
  }
  return div({}, ['waiting...']);
}
`.trim();

    const executePromise = host.executePlugin(pluginCode, { eventEmitter });

    // Wait for plugin to initialize
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Close a DIFFERENT window — plugin should keep running
    eventEmitter.emit({
      type: 'WINDOW_CLOSED',
      windowId: OTHER_WINDOW_ID,
    });

    // Plugin should still be running — send a header so it completes
    eventEmitter.emit({
      type: 'HEADER_INTERCEPTED',
      header: {
        id: '1',
        method: 'GET',
        url: 'https://api.x.com/test',
        timestamp: Date.now(),
        type: 'xmlhttprequest',
        requestHeaders: [],
        tabId: 100,
      },
      windowId: WINDOW_ID,
    });

    const result = await executePromise;
    expect(result).toBe('completed');
  }, 30_000);

  it('should terminate plugin when window is closed during onOpenWindow buffering', async () => {
    const eventEmitter = createTestEventEmitter();
    const WINDOW_ID = 52;

    // onOpenWindow emits WINDOW_CLOSED while still resolving
    const onOpenWindow = vi.fn().mockImplementation(async () => {
      // Window opens then immediately closes (user closes it very fast)
      eventEmitter.emit({
        type: 'WINDOW_CLOSED',
        windowId: WINDOW_ID,
      });

      return {
        type: 'WINDOW_OPENED',
        payload: { windowId: WINDOW_ID, uuid: 'test-uuid', tabId: 100 },
      };
    });

    const host = new Host({
      onProve: vi.fn(),
      onRenderPluginUi: vi.fn(),
      onCloseWindow: vi.fn(),
      onOpenWindow,
    });

    const pluginCode = `
export const config = { name: 'Buffered Close Test' };

export function main() {
  openWindow('https://x.com');
  const allHeaders = useHeaders((h) => h);
  return div({}, ['waiting...']);
}
`.trim();

    const executePromise = host.executePlugin(pluginCode, { eventEmitter });

    // The plugin should reject because WINDOW_CLOSED was buffered
    await expect(executePromise).rejects.toThrow('Window closed by user');

    // Listener should be cleaned up
    expect(eventEmitter.listenerCount).toBe(0);
  }, 30_000);

  it('should clean up listener after window close terminates plugin', async () => {
    const eventEmitter = createTestEventEmitter();
    const WINDOW_ID = 53;
    const onCloseWindow = vi.fn();

    const onOpenWindow = vi.fn().mockResolvedValue({
      type: 'WINDOW_OPENED',
      payload: { windowId: WINDOW_ID, uuid: 'test-uuid', tabId: 100 },
    });

    const host = new Host({
      onProve: vi.fn(),
      onRenderPluginUi: vi.fn(),
      onCloseWindow,
      onOpenWindow,
    });

    const pluginCode = `
export const config = { name: 'Cleanup Test' };

export function main() {
  openWindow('https://x.com');
  const allHeaders = useHeaders((h) => h);
  return div({}, ['waiting...']);
}
`.trim();

    const executePromise = host.executePlugin(pluginCode, { eventEmitter });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    // At this point, there should be a listener registered
    expect(eventEmitter.listenerCount).toBeGreaterThan(0);

    // Close the window
    eventEmitter.emit({
      type: 'WINDOW_CLOSED',
      windowId: WINDOW_ID,
    });

    await executePromise.catch(() => {
      // Expected rejection
    });

    // Listener should be fully cleaned up — no leaks
    expect(eventEmitter.listenerCount).toBe(0);

    // onCloseWindow should have been called (terminateWithError closes the window)
    expect(onCloseWindow).toHaveBeenCalledWith(WINDOW_ID);
  }, 30_000);
});
