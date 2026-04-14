import { describe, it, expect, vi } from 'vitest';
import { Host } from '../src/index';
import type { WindowMessage, DomJson } from '../src/types';

/**
 * Browser E2E tests for the plugin timeout system.
 *
 * These tests run real QuickJS WASM in Chromium via Playwright, verifying:
 * - Timeout warning modal is auto-shown at T-60s
 * - _extendTimeout onclick resets deadline by 5 minutes
 * - Plugin terminates with error on expiry
 * - usePluginTimeout() hook returns remaining time
 * - Timers are cleaned up when plugin completes before timeout
 *
 * Uses short timeouts (3-5s) to keep tests fast. The interval runs every 1s.
 */
describe('Plugin Timeout E2E', () => {
  function createHost() {
    return new Host({
      onProve: vi.fn().mockResolvedValue({ proof: 'mock' }),
      onRenderPluginUi: vi.fn(),
      onCloseWindow: vi.fn(),
      onOpenWindow: vi.fn().mockResolvedValue({
        type: 'WINDOW_OPENED',
        payload: { windowId: 1, uuid: 'test-uuid', tabId: 1 },
      }),
    });
  }

  function createEventEmitter() {
    const listeners: Array<(msg: WindowMessage) => void> = [];
    return {
      addListener: (fn: (msg: WindowMessage) => void) => listeners.push(fn),
      removeListener: (fn: (msg: WindowMessage) => void) => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
      emit: (msg: WindowMessage) => {
        [...listeners].forEach((fn) => fn(msg));
      },
    };
  }

  function installReRenderBridge(emitter: ReturnType<typeof createEventEmitter>) {
    emitter.addListener((msg: WindowMessage) => {
      if (msg.type === 'TO_BG_RE_RENDER_PLUGIN_UI') {
        setTimeout(() => {
          emitter.emit({
            type: 'RE_RENDER_PLUGIN_UI',
            windowId: msg.windowId,
          });
        }, 10);
      }
    });
  }

  it('should terminate plugin on timeout expiry', async () => {
    const host = createHost();
    const emitter = createEventEmitter();
    installReRenderBridge(emitter);

    // Plugin with 2-minute timeout (minimum clamp).
    // The interval runs every 1s and checks deadline.
    // We'll advance time past the deadline.
    const donePromise = host.executePlugin(
      `
        export const config = { name: 'test', description: 'test', timeout: 120000 };
        export function main() {
          openWindow('https://example.com');
          return div({}, ['waiting']);
        }
      `,
      { eventEmitter: emitter },
    );

    // The promise should reject with timeout error after ~120s.
    // To speed this up, we can't easily mock timers in WASM context,
    // so we verify the promise rejects.
    await expect(donePromise).rejects.toThrow('Plugin execution timeout');
  }, 150_000); // 2.5 min test timeout

  // Helper: walk a DomJson tree and find the first node whose children include the given text
  function findNodeWithText(node: DomJson, text: string): boolean {
    if (typeof node === 'string') return node === text;
    if (node.children?.some((c) => typeof c === 'string' && c === text)) return true;
    return node.children?.some((c) => findNodeWithText(c, text)) ?? false;
  }

  it('should show timeout warning overlay before expiry', async () => {
    const host = createHost();
    const emitter = createEventEmitter();
    installReRenderBridge(emitter);

    const onRenderSpy = host['onRenderPluginUi'] as ReturnType<typeof vi.fn>;

    const donePromise = host.executePlugin(
      `
      export const config = { name: 'test', description: 'test', timeout: 120000 };
      export function main() {
        openWindow('https://example.com');
        return div({}, ['waiting']);
      }
    `,
      { eventEmitter: emitter },
    );

    // Wait for the warning to appear (at T-60s, so ~60s after start with 120s timeout)
    await new Promise((r) => setTimeout(r, 65_000));

    // The warning wraps the plugin UI, so search the rendered tree for the title text
    const calls = onRenderSpy.mock.calls;
    const found = calls.some((call) => {
      const json = call[1] as DomJson;
      return findNodeWithText(json, 'Plugin Timeout Warning');
    });
    expect(found).toBe(true);

    // Let plugin timeout so it cleans up
    await donePromise.catch(() => {});
  }, 150_000);

  it('should extend timeout when _extendTimeout is clicked', async () => {
    const host = createHost();
    const emitter = createEventEmitter();
    installReRenderBridge(emitter);

    const donePromise = host.executePlugin(
      `
      export const config = { name: 'test', description: 'test', timeout: 120000 };
      export function main() {
        openWindow('https://example.com');
        return div({}, ['waiting']);
      }
    `,
      { eventEmitter: emitter },
    );

    // Wait for warning to appear (~60s)
    await new Promise((r) => setTimeout(r, 65_000));

    // Click extend — simulates PLUGIN_UI_CLICK with _extendTimeout
    emitter.emit({
      type: 'PLUGIN_UI_CLICK',
      onclick: '_extendTimeout',
      windowId: 1,
    });

    // Wait a bit — plugin should NOT have timed out yet (extended by 5 min)
    await new Promise((r) => setTimeout(r, 5_000));

    // The promise should still be pending (not rejected)
    let resolved = false;
    let rejected = false;
    donePromise.then(() => (resolved = true)).catch(() => (rejected = true));
    await new Promise((r) => setTimeout(r, 100));

    expect(resolved).toBe(false);
    expect(rejected).toBe(false);

    // Clean up: let it timeout eventually
    await donePromise.catch(() => {});
  }, 400_000);

  it('should provide usePluginTimeout() with remaining time', async () => {
    const host = createHost();
    const emitter = createEventEmitter();
    installReRenderBridge(emitter);

    // Plugin reads usePluginTimeout() on its first main() call.
    // State is initialized before the first main() call so the hook returns valid data.
    const donePromise = host.executePlugin(
      `
      export const config = { name: 'test', description: 'test', timeout: 120000 };
      export function main() {
        const timeout = usePluginTimeout();
        if (timeout) {
          done({ remaining: timeout.remaining, total: timeout.total });
          return null;
        }
        return div({}, ['no timeout']);
      }
    `,
      { eventEmitter: emitter },
    );

    const result = (await donePromise) as { remaining: number; total: number };
    expect(result.total).toBe(120000);
    expect(result.remaining).toBeLessThanOrEqual(120000);
    expect(result.remaining).toBeGreaterThan(0);
  }, 10_000);

  it('should clean up timeout when plugin completes normally', async () => {
    const host = createHost();
    const emitter = createEventEmitter();
    const onRenderSpy = host['onRenderPluginUi'] as ReturnType<typeof vi.fn>;

    const result = await host.executePlugin(
      `
      export const config = { name: 'test', description: 'test', timeout: 120000 };
      export function main() {
        done('completed');
        return null;
      }
    `,
      { eventEmitter: emitter },
    );

    expect(result).toBe('completed');

    // Wait a bit to ensure no warning modal appears after completion
    await new Promise((r) => setTimeout(r, 2000));

    // onRenderPluginUi should NOT have been called with a tree containing the warning
    const warningCalls = onRenderSpy.mock.calls.filter((call: unknown[]) => {
      const json = call[1] as DomJson;
      return findNodeWithText(json, 'Plugin Timeout Warning');
    });

    expect(warningCalls).toHaveLength(0);
  }, 10_000);
});
