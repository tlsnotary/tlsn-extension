import { describe, it, expect, afterEach, vi } from 'vitest';
import { Host } from './index';
import type { WindowMessage } from './types';

/**
 * Browser E2E tests for the QuickJS sandbox.
 *
 * These tests run real QuickJS WASM in Chromium via Playwright, verifying that:
 * - The WASM binary loads and initializes correctly
 * - JavaScript code executes inside the sandbox
 * - Host capabilities (sync and async) can be called from sandboxed code
 * - Errors propagate from sandbox to host
 * - The sandbox is isolated from browser globals
 *
 * NOTE: sandbox.eval() returns undefined for export values in this environment
 * (a @sebastianwessel/quickjs limitation). Tests verify behavior via host
 * capability spies instead of return values.
 *
 * KNOWN LIMITATION: executePlugin() cannot be tested here because the library
 * deeply serializes the env object when injecting capabilities. The complex
 * closures in useEffect/useState/openWindow cause "Maximum call stack size
 * exceeded" during serialization. The full plugin lifecycle works in the actual
 * extension (webpack-bundled offscreen page).
 */
describe('QuickJS Browser E2E', () => {
  const sandboxes: Array<{ dispose: () => void }> = [];

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

  afterEach(() => {
    for (const s of sandboxes) {
      try {
        s.dispose();
      } catch {
        // ignore
      }
    }
    sandboxes.length = 0;
  });

  describe('createEvalCode', () => {
    it('should load QuickJS WASM and execute code', async () => {
      const spy = vi.fn();
      const host = createHost();
      const sandbox = await host.createEvalCode({ report: spy });
      sandboxes.push(sandbox);

      await sandbox.eval(`
        const report = env.report;
        report(1 + 2);
      `);

      expect(spy).toHaveBeenCalledWith(3);
    });

    it('should handle multiple capability calls', async () => {
      const results: number[] = [];
      const collect = vi.fn((x: number) => results.push(x));

      const host = createHost();
      const sandbox = await host.createEvalCode({ collect });
      sandboxes.push(sandbox);

      await sandbox.eval(`
        const collect = env.collect;
        collect(1);
        collect(2);
        collect(3);
      `);

      expect(collect).toHaveBeenCalledTimes(3);
      expect(results).toEqual([1, 2, 3]);
    });

    it('should pass complex objects between host and sandbox', async () => {
      const spy = vi.fn();
      const host = createHost();
      const sandbox = await host.createEvalCode({ report: spy });
      sandboxes.push(sandbox);

      await sandbox.eval(`
        const report = env.report;
        report({ greeting: 'hello' + ' ' + 'world', nums: [1, 2, 3].map(n => n * 2) });
      `);

      expect(spy).toHaveBeenCalledWith({
        greeting: 'hello world',
        nums: [2, 4, 6],
      });
    });

    it('should call sync host capabilities with correct args', async () => {
      const addSpy = vi.fn((a: number, b: number) => a + b);
      const host = createHost();
      const sandbox = await host.createEvalCode({ add: addSpy });
      sandboxes.push(sandbox);

      await sandbox.eval(`
        const add = env.add;
        add(3, 4);
        add(10, 20);
      `);

      expect(addSpy).toHaveBeenCalledTimes(2);
      expect(addSpy).toHaveBeenCalledWith(3, 4);
      expect(addSpy).toHaveBeenCalledWith(10, 20);
    });

    it('should call async host capabilities', async () => {
      const asyncFn = vi.fn(async (x: number) => x * 10);
      const host = createHost();
      const sandbox = await host.createEvalCode({ compute: asyncFn });
      sandboxes.push(sandbox);

      await sandbox.eval(`
        const compute = env.compute;
        await compute(5);
      `);

      expect(asyncFn).toHaveBeenCalledWith(5);
    });

    it('should use return values from host capabilities in sandbox logic', async () => {
      const add = vi.fn((a: number, b: number) => a + b);
      const report = vi.fn();
      const host = createHost();
      const sandbox = await host.createEvalCode({ add, report });
      sandboxes.push(sandbox);

      await sandbox.eval(`
        const add = env.add;
        const report = env.report;
        const sum = add(3, 4);
        report(sum * 2);
      `);

      expect(add).toHaveBeenCalledWith(3, 4);
      expect(report).toHaveBeenCalledWith(14);
    });

    it('should propagate sandbox eval errors', async () => {
      const host = createHost();
      const sandbox = await host.createEvalCode();
      sandboxes.push(sandbox);

      await expect(sandbox.eval('throw new Error("boom");')).rejects.toThrow('boom');
    });

    it('should propagate syntax errors', async () => {
      const host = createHost();
      const sandbox = await host.createEvalCode();
      sandboxes.push(sandbox);

      await expect(sandbox.eval('const x = {;')).rejects.toThrow();
    });

    it('should isolate sandbox from browser globals', async () => {
      const report = vi.fn();
      const host = createHost();
      const sandbox = await host.createEvalCode({ report });
      sandboxes.push(sandbox);

      await sandbox.eval(`
        const report = env.report;
        report({
          hasWindow: typeof window !== 'undefined',
          hasDocument: typeof document !== 'undefined',
        });
      `);

      // QuickJS sandbox has no window or document (browser DOM APIs)
      expect(report).toHaveBeenCalledWith({
        hasWindow: false,
        hasDocument: false,
      });
    });

    it('should maintain state across multiple evals', async () => {
      const report = vi.fn();
      const host = createHost();
      const sandbox = await host.createEvalCode({ report });
      sandboxes.push(sandbox);

      await sandbox.eval('globalThis.counter = 1;');
      await sandbox.eval(`
        const report = env.report;
        globalThis.counter += 1;
        report(globalThis.counter);
      `);

      expect(report).toHaveBeenCalledWith(2);
    });
  });

  describe('executePlugin', () => {
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

    // executePlugin now preprocesses plugin code to:
    // 1. Strip named exports and re-export via `export default { ... }`
    // 2. Wrap functions in arrow functions (no .prototype → no handleToNative cycle)
    // This means plugins can use standard `export function` syntax.

    it('should run a plugin that calls done() from main', async () => {
      const host = createHost();
      const emitter = createEventEmitter();

      const result = await host.executePlugin(
        `
        export function main() {
          done('finished');
          return null;
        }
      `,
        { eventEmitter: emitter },
      );

      expect(result).toBe('finished');
    });

    it('should handle onClick -> async prove() -> done()', async () => {
      const host = createHost();
      const emitter = createEventEmitter();

      // Plugin must call openWindow() to register the PLUGIN_UI_CLICK listener
      const donePromise = host.executePlugin(
        `
        export async function main() {
          await openWindow('https://example.com', { width: 400, height: 300 });
          return button({ onclick: 'handleClick' }, ['Prove']);
        }
        export async function handleClick() {
          const result = await prove(
            { url: 'https://example.com', method: 'GET', headers: {} },
            { verifierUrl: 'http://localhost:7047', proxyUrl: 'ws://localhost:55688', handlers: [] }
          );
          done(result);
        }
      `,
        { eventEmitter: emitter },
      );

      await new Promise((r) => setTimeout(r, 200));
      emitter.emit({
        type: 'PLUGIN_UI_CLICK',
        onclick: 'handleClick',
      } as unknown as WindowMessage);

      const result = await donePromise;
      expect(result).toEqual({ proof: 'mock' });
    });
  });
});
