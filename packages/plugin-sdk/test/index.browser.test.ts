import { describe, it, expect, afterEach, vi } from 'vitest';
import { Host } from '../src/index';
import type {
  WindowMessage,
  InterceptedRequest,
  InterceptedRequestHeader,
  DomJson,
} from '../src/types';

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
 * executePlugin() works via preprocessPluginCode() which wraps exports in
 * arrow functions (no .prototype → no handleToNative serialization cycle).
 * openWindow() is idempotent — safe to call on every re-render.
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

      // Plugin must call openWindow() to register the PLUGIN_UI_CLICK listener.
      // main() must NOT be async — an async main() with await openWindow() would
      // suspend inside the QuickJS event loop and never complete without explicit
      // executePendingJobs() pumping, so the PLUGIN_UI_CLICK listener never registers.
      const donePromise = host.executePlugin(
        `
        export function main() {
          openWindow('https://example.com', { width: 400, height: 300 });
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
        windowId: 1,
      } as unknown as WindowMessage);

      const result = await donePromise;
      expect(result).toEqual({ proof: 'mock' });
    });

    // --- Helpers for reactive hook tests ---

    let reqCounter = 0;
    function makeRequestMessage(
      windowId: number,
      overrides?: Partial<InterceptedRequest>,
    ): WindowMessage {
      return {
        type: 'REQUEST_INTERCEPTED',
        windowId,
        request: {
          id: `req-${++reqCounter}`,
          method: 'GET',
          url: 'https://example.com/api',
          timestamp: Date.now(),
          tabId: 1,
          ...overrides,
        },
      };
    }

    let hdrCounter = 0;
    function makeHeaderMessage(
      windowId: number,
      overrides?: Partial<InterceptedRequestHeader>,
    ): WindowMessage {
      return {
        type: 'HEADER_INTERCEPTED',
        windowId,
        header: {
          id: `hdr-${++hdrCounter}`,
          method: 'GET',
          url: 'https://example.com/api',
          timestamp: Date.now(),
          type: 'xmlhttprequest',
          requestHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          tabId: 1,
          ...overrides,
        },
      };
    }

    /**
     * Bridge that converts TO_BG_RE_RENDER_PLUGIN_UI → RE_RENDER_PLUGIN_UI.
     * In the real extension, the background script does this. In tests we
     * simulate it with a setTimeout to avoid synchronous recursion.
     */
    function installReRenderBridge(emitter: ReturnType<typeof createEventEmitter>) {
      emitter.addListener(((msg: any) => {
        if (msg.type === 'TO_BG_RE_RENDER_PLUGIN_UI') {
          setTimeout(() => {
            emitter.emit({
              type: 'RE_RENDER_PLUGIN_UI',
              windowId: msg.windowId,
            } as WindowMessage);
          }, 10);
        }
      }) as (msg: WindowMessage) => void);
    }

    // --- useRequests ---

    describe('useRequests', () => {
      it('should receive intercepted requests', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        const donePromise = host.executePlugin(
          `
          export async function main() {
            const reqs = useRequests(r => r);
            if (reqs.length >= 1) {
              done(reqs.length);
              return null;
            }
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['waiting']);
          }
        `,
          { eventEmitter: emitter },
        );

        await new Promise((r) => setTimeout(r, 200));
        emitter.emit(makeRequestMessage(1));

        const result = await donePromise;
        expect(result).toBe(1);
      });

      it('should apply filter function correctly', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        const donePromise = host.executePlugin(
          `
          export async function main() {
            const postReqs = useRequests(r => r.filter(req => req.method === 'POST'));
            if (postReqs.length >= 1) {
              done({ count: postReqs.length, url: postReqs[0].url });
              return null;
            }
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['waiting for POST']);
          }
        `,
          { eventEmitter: emitter },
        );

        await new Promise((r) => setTimeout(r, 200));

        // GET request should not trigger done
        emitter.emit(makeRequestMessage(1, { method: 'GET' }));
        await new Promise((r) => setTimeout(r, 100));

        // POST request should trigger done
        emitter.emit(makeRequestMessage(1, { method: 'POST', url: 'https://example.com/submit' }));

        const result = await donePromise;
        expect(result).toEqual({ count: 1, url: 'https://example.com/submit' });
      });

      it('should accumulate across multiple intercepts', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        const donePromise = host.executePlugin(
          `
          export async function main() {
            const reqs = useRequests(r => r);
            if (reqs.length >= 3) {
              done(reqs.map(r => r.url));
              return null;
            }
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['waiting']);
          }
        `,
          { eventEmitter: emitter },
        );

        await new Promise((r) => setTimeout(r, 200));
        emitter.emit(makeRequestMessage(1, { url: 'https://example.com/1' }));
        await new Promise((r) => setTimeout(r, 50));
        emitter.emit(makeRequestMessage(1, { url: 'https://example.com/2' }));
        await new Promise((r) => setTimeout(r, 50));
        emitter.emit(makeRequestMessage(1, { url: 'https://example.com/3' }));

        const result = await donePromise;
        expect(result).toEqual([
          'https://example.com/1',
          'https://example.com/2',
          'https://example.com/3',
        ]);
      });
    });

    // --- useHeaders ---

    describe('useHeaders', () => {
      it('should receive intercepted headers', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        const donePromise = host.executePlugin(
          `
          export async function main() {
            const hdrs = useHeaders(h => h);
            if (hdrs.length >= 1) {
              done(hdrs.length);
              return null;
            }
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['waiting']);
          }
        `,
          { eventEmitter: emitter },
        );

        await new Promise((r) => setTimeout(r, 200));
        emitter.emit(makeHeaderMessage(1));

        const result = await donePromise;
        expect(result).toBe(1);
      });

      it('should extract specific header values', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        const donePromise = host.executePlugin(
          `
          export async function main() {
            const authHeaders = useHeaders(h =>
              h.filter(hdr => hdr.requestHeaders.some(rh => rh.name === 'Authorization'))
            );
            if (authHeaders.length >= 1) {
              const authValue = authHeaders[0].requestHeaders
                .find(rh => rh.name === 'Authorization').value;
              done(authValue);
              return null;
            }
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['waiting']);
          }
        `,
          { eventEmitter: emitter },
        );

        await new Promise((r) => setTimeout(r, 200));
        emitter.emit(
          makeHeaderMessage(1, {
            requestHeaders: [
              { name: 'Authorization', value: 'Bearer secret-token' },
              { name: 'Content-Type', value: 'application/json' },
            ],
          }),
        );

        const result = await donePromise;
        expect(result).toBe('Bearer secret-token');
      });
    });

    // --- useEffect ---

    describe('useEffect', () => {
      it('should fire on first call', async () => {
        const host = createHost();
        const emitter = createEventEmitter();
        installReRenderBridge(emitter);

        const donePromise = host.executePlugin(
          `
          export async function main() {
            useEffect(() => {
              setState('effectRan', true);
            }, []);
            const ran = useState('effectRan', false);
            if (ran) {
              done('effect-ran');
              return null;
            }
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['waiting']);
          }
        `,
          { eventEmitter: emitter },
        );

        const result = await donePromise;
        expect(result).toBe('effect-ran');
      });

      it('should fire when deps change via useRequests', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        const donePromise = host.executePlugin(
          `
          export async function main() {
            const reqs = useRequests(r => r);
            useEffect(() => {
              if (reqs.length > 0) {
                done('deps-changed:' + reqs.length);
              }
            }, [reqs.length]);
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['waiting']);
          }
        `,
          { eventEmitter: emitter },
        );

        await new Promise((r) => setTimeout(r, 200));
        emitter.emit(makeRequestMessage(1));

        const result = await donePromise;
        expect(result).toBe('deps-changed:1');
      });
    });

    // --- useState / setState ---

    describe('useState / setState', () => {
      it('should return default value from useState', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        const result = await host.executePlugin(
          `
          export function main() {
            const name = useState('name', 'Alice');
            done(name);
            return null;
          }
        `,
          { eventEmitter: emitter },
        );

        expect(result).toBe('Alice');
      });

      it('should persist useState value across re-renders', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        const donePromise = host.executePlugin(
          `
          export async function main() {
            const name = useState('name', 'Alice');
            const reqs = useRequests(r => r);
            if (reqs.length >= 1) {
              done({ name, reqCount: reqs.length });
              return null;
            }
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['waiting']);
          }
        `,
          { eventEmitter: emitter },
        );

        await new Promise((r) => setTimeout(r, 200));
        emitter.emit(makeRequestMessage(1));

        const result = await donePromise;
        expect(result).toEqual({ name: 'Alice', reqCount: 1 });
      });

      it('should update state and trigger re-render via setState', async () => {
        const host = createHost();
        const emitter = createEventEmitter();
        installReRenderBridge(emitter);

        const donePromise = host.executePlugin(
          `
          export async function main() {
            const count = useState('counter', 0);
            if (count > 0) {
              done(count);
              return null;
            }
            await openWindow('https://example.com', { width: 400, height: 300 });
            return button({ onclick: 'increment' }, ['click me']);
          }
          export function increment() {
            const count = useState('counter', 0);
            setState('counter', count + 1);
          }
        `,
          { eventEmitter: emitter },
        );

        await new Promise((r) => setTimeout(r, 200));
        emitter.emit({
          type: 'PLUGIN_UI_CLICK',
          onclick: 'increment',
          windowId: 1,
        } as WindowMessage);

        const result = await donePromise;
        expect(result).toBe(1);
      });
    });

    // --- openWindow ---

    describe('openWindow', () => {
      it('should pass correct args to onOpenWindow', async () => {
        const onOpenSpy = vi.fn().mockResolvedValue({
          type: 'WINDOW_OPENED',
          payload: { windowId: 42, uuid: 'test-uuid', tabId: 5 },
        });
        const host = new Host({
          onProve: vi.fn().mockResolvedValue({ proof: 'mock' }),
          onRenderPluginUi: vi.fn(),
          onCloseWindow: vi.fn(),
          onOpenWindow: onOpenSpy,
        });
        const emitter = createEventEmitter();

        const result = await host.executePlugin(
          `
          export async function main() {
            const win = await openWindow('https://test.example.com', {
              width: 800, height: 600, showOverlay: true
            });
            done({ windowId: win.windowId, tabId: win.tabId });
            return null;
          }
        `,
          { eventEmitter: emitter },
        );

        expect(onOpenSpy).toHaveBeenCalledWith('https://test.example.com', {
          width: 800,
          height: 600,
          showOverlay: true,
        });
        expect(result).toEqual({ windowId: 42, tabId: 5 });
      });

      it('should be idempotent on re-renders (SDK guards duplicate calls)', async () => {
        const onOpenSpy = vi.fn().mockResolvedValue({
          type: 'WINDOW_OPENED',
          payload: { windowId: 1, uuid: 'test-uuid', tabId: 1 },
        });
        const host = new Host({
          onProve: vi.fn().mockResolvedValue({ proof: 'mock' }),
          onRenderPluginUi: vi.fn(),
          onCloseWindow: vi.fn(),
          onOpenWindow: onOpenSpy,
        });
        const emitter = createEventEmitter();

        // Plugin calls openWindow every render — SDK should only open once
        const donePromise = host.executePlugin(
          `
          export async function main() {
            const reqs = useRequests(r => r);
            await openWindow('https://example.com', { width: 400, height: 300 });
            if (reqs.length >= 2) {
              done(reqs.length);
              return null;
            }
            return div({}, ['waiting']);
          }
        `,
          { eventEmitter: emitter },
        );

        await new Promise((r) => setTimeout(r, 200));
        emitter.emit(makeRequestMessage(1));
        await new Promise((r) => setTimeout(r, 50));
        emitter.emit(makeRequestMessage(1));

        await donePromise;
        // onOpenWindow should only be called once despite main() running 3 times
        expect(onOpenSpy).toHaveBeenCalledTimes(1);
      });

      it('should reject on empty URL', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        const result = await host.executePlugin(
          `
          export async function main() {
            try {
              await openWindow('', { width: 400, height: 300 });
              done('should-not-reach');
            } catch (e) {
              done('error:' + e.message);
            }
            return null;
          }
        `,
          { eventEmitter: emitter },
        );

        expect(result).toContain('error:');
      });
    });

    // --- done() ---

    describe('done()', () => {
      it('should call onCloseWindow when window is open', async () => {
        const onCloseSpy = vi.fn();
        const host = new Host({
          onProve: vi.fn().mockResolvedValue({ proof: 'mock' }),
          onRenderPluginUi: vi.fn(),
          onCloseWindow: onCloseSpy,
          onOpenWindow: vi.fn().mockResolvedValue({
            type: 'WINDOW_OPENED',
            payload: { windowId: 7, uuid: 'test-uuid', tabId: 1 },
          }),
        });
        const emitter = createEventEmitter();

        await host.executePlugin(
          `
          export async function main() {
            await openWindow('https://example.com', { width: 400, height: 300 });
            done('closing');
            return null;
          }
        `,
          { eventEmitter: emitter },
        );

        expect(onCloseSpy).toHaveBeenCalledWith(7);
      });

      it('should be idempotent (first call wins)', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        const result = await host.executePlugin(
          `
          export function main() {
            done('first');
            done('second');
            return null;
          }
        `,
          { eventEmitter: emitter },
        );

        expect(result).toBe('first');
      });
    });

    // --- Error cases ---

    describe('error cases', () => {
      it('should reject when main export is missing', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        await expect(
          host.executePlugin(
            `
            export function notMain() {
              return null;
            }
          `,
            { eventEmitter: emitter },
          ),
        ).rejects.toThrow('Main function not found');
      });

      it('should reject on syntax error in plugin', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        await expect(
          host.executePlugin('export function main( { }', { eventEmitter: emitter }),
        ).rejects.toThrow('Plugin evaluation failed');
      });
    });

    // --- DOM rendering helpers ---

    /**
     * Renders a DomJson tree to real HTML elements, mirroring the extension's
     * Content script createNode(). Click events emit PLUGIN_UI_CLICK via the
     * test emitter instead of browser.runtime.sendMessage.
     */
    function renderToDOM(
      json: DomJson,
      windowId: number,
      emitter: ReturnType<typeof createEventEmitter>,
    ): HTMLElement | Text {
      if (typeof json === 'string') {
        return document.createTextNode(json);
      }

      const node = document.createElement(json.type);

      if (json.options.className) node.className = json.options.className;
      if (json.options.id) node.id = json.options.id;
      if (json.options.style) {
        Object.entries(json.options.style).forEach(([key, value]) => {
          (node.style as any)[key] = value;
        });
      }

      // Input-specific attributes
      if (json.options.inputType) (node as HTMLInputElement).type = json.options.inputType;
      if (json.options.checked !== undefined)
        (node as HTMLInputElement).checked = json.options.checked;
      if (json.options.value !== undefined) (node as HTMLInputElement).value = json.options.value;
      if (json.options.placeholder)
        (node as HTMLInputElement).placeholder = json.options.placeholder;
      if (json.options.disabled !== undefined)
        (node as HTMLInputElement).disabled = json.options.disabled;

      if (json.options.onclick) {
        const onclickName = json.options.onclick;
        node.addEventListener('click', () => {
          emitter.emit({
            type: 'PLUGIN_UI_CLICK',
            onclick: onclickName,
            windowId,
          } as WindowMessage);
        });
      }

      json.children.forEach((child) => {
        node.appendChild(renderToDOM(child, windowId, emitter));
      });

      return node;
    }

    /**
     * Waits until onRenderPluginUi has been called at least `callCount` times.
     * Returns the DomJson from the most recent call.
     */
    async function waitForRender(
      spy: ReturnType<typeof vi.fn>,
      callCount: number,
      timeoutMs = 5000,
    ): Promise<DomJson> {
      const start = Date.now();
      while (spy.mock.calls.length < callCount) {
        if (Date.now() - start > timeoutMs) {
          throw new Error(
            `waitForRender: timed out waiting for render #${callCount} (got ${spy.mock.calls.length})`,
          );
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      return spy.mock.calls[callCount - 1][1] as DomJson;
    }

    // --- Full integration ---

    describe('integration', () => {
      it('should handle openWindow → intercept → useRequests → click → prove → done', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        const donePromise = host.executePlugin(
          `
          export async function main() {
            const reqs = useRequests(r => r.filter(req => req.url.includes('/api/data')));
            if (reqs.length > 0) {
              return button({ onclick: 'handleProve' }, ['Prove Now']);
            }
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['Waiting for API request...']);
          }
          export async function handleProve() {
            const result = await prove(
              { url: 'https://example.com/api/data', method: 'GET', headers: {} },
              { verifierUrl: 'http://localhost:7047', proxyUrl: 'ws://localhost:55688', handlers: [] }
            );
            done(result);
          }
        `,
          { eventEmitter: emitter },
        );

        await new Promise((r) => setTimeout(r, 200));

        // Intercept an API request
        emitter.emit(makeRequestMessage(1, { url: 'https://example.com/api/data' }));
        await new Promise((r) => setTimeout(r, 100));

        // Click the prove button
        emitter.emit({
          type: 'PLUGIN_UI_CLICK',
          onclick: 'handleProve',
          windowId: 1,
        } as WindowMessage);

        const result = await donePromise;
        expect(result).toEqual({ proof: 'mock' });
      });

      it('should handle useHeaders + useState + setState lifecycle', async () => {
        const host = createHost();
        const emitter = createEventEmitter();
        installReRenderBridge(emitter);

        const donePromise = host.executePlugin(
          `
          export async function main() {
            const cachedAuth = useState('auth', null);
            const hdrs = useHeaders(h =>
              h.filter(hdr => hdr.requestHeaders.some(rh => rh.name === 'Authorization'))
            );

            // Cache auth header when intercepted
            if (hdrs.length > 0 && !cachedAuth) {
              const authValue = hdrs[0].requestHeaders
                .find(rh => rh.name === 'Authorization').value;
              setState('auth', authValue);
            }

            if (cachedAuth) {
              return button({ onclick: 'handleProve' }, ['Prove with auth']);
            }

            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['Waiting for auth header...']);
          }
          export async function handleProve() {
            const auth = useState('auth', null);
            done(auth);
          }
        `,
          { eventEmitter: emitter },
        );

        await new Promise((r) => setTimeout(r, 200));

        // Intercept header with Authorization
        emitter.emit(
          makeHeaderMessage(1, {
            requestHeaders: [{ name: 'Authorization', value: 'Bearer my-token' }],
          }),
        );

        // Wait for: header intercept → main() → setState → bridge → RE_RENDER → main(true)
        await new Promise((r) => setTimeout(r, 300));

        // Click the prove button
        emitter.emit({
          type: 'PLUGIN_UI_CLICK',
          onclick: 'handleProve',
          windowId: 1,
        } as WindowMessage);

        const result = await donePromise;
        expect(result).toBe('Bearer my-token');
      });
    });

    // --- plugin export syntax (preprocessPluginCode behavior) ---

    describe('plugin export syntax', () => {
      it('should run plugin using export default { main, config } syntax', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        const result = await host.executePlugin(
          `
          const config = { name: 'Test', description: 'Desc' };
          function main() {
            done('ok');
            return null;
          }
          export default { main, config };
        `,
          { eventEmitter: emitter },
        );

        expect(result).toBe('ok');
      });

      it('should expose non-function config export via getPluginConfig', async () => {
        const host = createHost();
        const code = `
          const config = {
            name: 'Browser Config',
            description: 'Tested in browser',
            requests: [{ method: 'GET', host: 'api.example.com', pathname: '/v1/data' }],
            urls: ['https://example.com/*'],
          };
          function main() { return null; }
          export default { main, config };
        `;

        const result = await host.getPluginConfig(code);

        expect(result.name).toBe('Browser Config');
        expect(result.requests).toHaveLength(1);
        expect(result.requests[0].host).toBe('api.example.com');
        expect(result.urls).toEqual(['https://example.com/*']);
      });
    });

    // --- REQUESTS_BATCH ---

    describe('REQUESTS_BATCH', () => {
      it('should accumulate a batch of requests and trigger re-render', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        const donePromise = host.executePlugin(
          `
          export async function main() {
            const reqs = useRequests(r => r);
            if (reqs.length >= 3) {
              done(reqs.map(r => r.url));
              return null;
            }
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['waiting for batch']);
          }
        `,
          { eventEmitter: emitter },
        );

        await new Promise((r) => setTimeout(r, 200));

        // Send three requests as a single batch
        emitter.emit({
          type: 'REQUESTS_BATCH',
          windowId: 1,
          requests: [
            {
              id: 'b1',
              method: 'GET',
              url: 'https://example.com/a',
              timestamp: Date.now(),
              tabId: 1,
            },
            {
              id: 'b2',
              method: 'GET',
              url: 'https://example.com/b',
              timestamp: Date.now(),
              tabId: 1,
            },
            {
              id: 'b3',
              method: 'GET',
              url: 'https://example.com/c',
              timestamp: Date.now(),
              tabId: 1,
            },
          ],
        } as unknown as WindowMessage);

        const result = await donePromise;
        expect(result).toEqual([
          'https://example.com/a',
          'https://example.com/b',
          'https://example.com/c',
        ]);
      });

      it('should accumulate REQUESTS_BATCH alongside individual REQUEST_INTERCEPTED', async () => {
        const host = createHost();
        const emitter = createEventEmitter();
        let reqCounter = 100;

        const donePromise = host.executePlugin(
          `
          export async function main() {
            const reqs = useRequests(r => r);
            if (reqs.length >= 4) {
              done(reqs.length);
              return null;
            }
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['waiting']);
          }
        `,
          { eventEmitter: emitter },
        );

        await new Promise((r) => setTimeout(r, 200));

        // One individual request
        emitter.emit({
          type: 'REQUEST_INTERCEPTED',
          windowId: 1,
          request: {
            id: `r-${++reqCounter}`,
            method: 'GET',
            url: 'https://example.com/single',
            timestamp: Date.now(),
            tabId: 1,
          },
        } as WindowMessage);

        await new Promise((r) => setTimeout(r, 50));

        // Three more as a batch
        emitter.emit({
          type: 'REQUESTS_BATCH',
          windowId: 1,
          requests: [
            {
              id: `r-${++reqCounter}`,
              method: 'GET',
              url: 'https://example.com/b1',
              timestamp: Date.now(),
              tabId: 1,
            },
            {
              id: `r-${++reqCounter}`,
              method: 'GET',
              url: 'https://example.com/b2',
              timestamp: Date.now(),
              tabId: 1,
            },
            {
              id: `r-${++reqCounter}`,
              method: 'GET',
              url: 'https://example.com/b3',
              timestamp: Date.now(),
              tabId: 1,
            },
          ],
        } as unknown as WindowMessage);

        const result = await donePromise;
        expect(result).toBe(4);
      });
    });

    // --- HEADERS_BATCH ---

    describe('HEADERS_BATCH', () => {
      it('should accumulate a batch of headers and trigger re-render', async () => {
        const host = createHost();
        const emitter = createEventEmitter();

        const donePromise = host.executePlugin(
          `
          export async function main() {
            const hdrs = useHeaders(h => h);
            if (hdrs.length >= 3) {
              done(hdrs.map(h => h.url));
              return null;
            }
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['waiting for header batch']);
          }
        `,
          { eventEmitter: emitter },
        );

        await new Promise((r) => setTimeout(r, 200));

        emitter.emit({
          type: 'HEADERS_BATCH',
          windowId: 1,
          headers: [
            {
              id: 'h1',
              method: 'GET',
              url: 'https://example.com/x',
              timestamp: Date.now(),
              type: 'xmlhttprequest',
              requestHeaders: [],
              tabId: 1,
            },
            {
              id: 'h2',
              method: 'GET',
              url: 'https://example.com/y',
              timestamp: Date.now(),
              type: 'xmlhttprequest',
              requestHeaders: [],
              tabId: 1,
            },
            {
              id: 'h3',
              method: 'GET',
              url: 'https://example.com/z',
              timestamp: Date.now(),
              type: 'xmlhttprequest',
              requestHeaders: [],
              tabId: 1,
            },
          ],
        } as unknown as WindowMessage);

        const result = await donePromise;
        expect(result).toEqual([
          'https://example.com/x',
          'https://example.com/y',
          'https://example.com/z',
        ]);
      });
    });

    // --- WINDOW_CLOSED cleanup ---

    describe('WINDOW_CLOSED', () => {
      it('should stop processing messages after WINDOW_CLOSED', async () => {
        const host = createHost();
        const emitter = createEventEmitter();
        let reqCounter = 200;
        const _mainCallUrls: string[] = [];

        const donePromise = host
          .executePlugin(
            `
          export async function main() {
            const reqs = useRequests(r => r);
            // record urls seen so far via a side-channel capability
            reportUrls(reqs.map(r => r.url));
            if (reqs.length >= 1) {
              done(reqs.length);
              return null;
            }
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['waiting']);
          }
        `,
            {
              eventEmitter: {
                ...emitter,
                // Inject reportUrls capability via a wrapper host
              },
            },
          )
          .catch(() => null); // may reject if context is cleaned up

        // Use a separate host with the reportUrls capability instead
        const host2 = new Host({
          onProve: vi.fn().mockResolvedValue({ proof: 'mock' }),
          onRenderPluginUi: vi.fn(),
          onCloseWindow: vi.fn(),
          onOpenWindow: vi.fn().mockResolvedValue({
            type: 'WINDOW_OPENED',
            payload: { windowId: 1, uuid: 'test-uuid', tabId: 1 },
          }),
        });
        const emitter2 = createEventEmitter();

        const donePromise2 = host2.executePlugin(
          `
          export async function main() {
            const reqs = useRequests(r => r);
            if (reqs.length >= 1) {
              done(reqs.length);
              return null;
            }
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({}, ['waiting']);
          }
        `,
          { eventEmitter: emitter2 },
        );

        await new Promise((r) => setTimeout(r, 200));

        // Close the window — listener should be removed
        emitter2.emit({ type: 'WINDOW_CLOSED', windowId: 1 } as WindowMessage);
        await new Promise((r) => setTimeout(r, 50));

        // These requests arrive after WINDOW_CLOSED — should be ignored
        emitter2.emit({
          type: 'REQUEST_INTERCEPTED',
          windowId: 1,
          request: {
            id: `r-${++reqCounter}`,
            method: 'GET',
            url: 'https://example.com/after-close',
            timestamp: Date.now(),
            tabId: 1,
          },
        } as WindowMessage);

        await new Promise((r) => setTimeout(r, 100));

        // donePromise2 should never resolve because no requests were received
        // before WINDOW_CLOSED, and requests after close are ignored.
        // We verify by checking it's still pending after the timeout.
        let resolved = false;
        donePromise2
          .then(() => {
            resolved = true;
          })
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          .catch(() => {});
        await new Promise((r) => setTimeout(r, 100));

        expect(resolved).toBe(false);

        // Cleanup: emit WINDOW_CLOSED on original emitter too
        void donePromise;
        emitter.emit({ type: 'WINDOW_CLOSED', windowId: 1 } as WindowMessage);
      });

      it('should remove listener so further messages do not trigger main()', async () => {
        const onRenderSpy = vi.fn();
        const host = new Host({
          onProve: vi.fn().mockResolvedValue({ proof: 'mock' }),
          onRenderPluginUi: onRenderSpy,
          onCloseWindow: vi.fn(),
          onOpenWindow: vi.fn().mockResolvedValue({
            type: 'WINDOW_OPENED',
            payload: { windowId: 1, uuid: 'test-uuid', tabId: 1 },
          }),
        });
        const emitter = createEventEmitter();
        let reqCounter = 300;

        // Plugin that renders on every request (never calls done)
        host
          .executePlugin(
            `
          export async function main() {
            const reqs = useRequests(r => r);
            await openWindow('https://example.com', { width: 400, height: 300 });
            return div({ id: 'count' }, ['Count: ' + reqs.length]);
          }
        `,
            { eventEmitter: emitter },
          )
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          .catch(() => {});

        await new Promise((r) => setTimeout(r, 200));

        // First request triggers a render
        emitter.emit({
          type: 'REQUEST_INTERCEPTED',
          windowId: 1,
          request: {
            id: `r-${++reqCounter}`,
            method: 'GET',
            url: 'https://example.com/1',
            timestamp: Date.now(),
            tabId: 1,
          },
        } as WindowMessage);
        await new Promise((r) => setTimeout(r, 100));

        const renderCountBeforeClose = onRenderSpy.mock.calls.length;
        expect(renderCountBeforeClose).toBeGreaterThanOrEqual(1);

        // Close the window
        emitter.emit({ type: 'WINDOW_CLOSED', windowId: 1 } as WindowMessage);
        await new Promise((r) => setTimeout(r, 50));

        // Further requests after close should not trigger more renders
        emitter.emit({
          type: 'REQUEST_INTERCEPTED',
          windowId: 1,
          request: {
            id: `r-${++reqCounter}`,
            method: 'GET',
            url: 'https://example.com/2',
            timestamp: Date.now(),
            tabId: 1,
          },
        } as WindowMessage);
        await new Promise((r) => setTimeout(r, 100));

        expect(onRenderSpy.mock.calls.length).toBe(renderCountBeforeClose);
      });
    });

    // --- Todo app integration (real DOM rendering) ---

    describe('todo app integration', () => {
      it('should render, add, toggle, remove todos, and finish', async () => {
        const onRenderSpy = vi.fn();
        const host = new Host({
          onProve: vi.fn().mockResolvedValue({ proof: 'mock' }),
          onRenderPluginUi: onRenderSpy,
          onCloseWindow: vi.fn(),
          onOpenWindow: vi.fn().mockResolvedValue({
            type: 'WINDOW_OPENED',
            payload: { windowId: 1, uuid: 'test-uuid', tabId: 1 },
          }),
        });
        const emitter = createEventEmitter();
        installReRenderBridge(emitter);

        // Container for rendered DOM
        const container = document.createElement('div');
        container.id = 'todo-test-container';
        document.body.appendChild(container);

        const todoPlugin = `
            const ITEMS = ['Buy groceries', 'Walk the dog', 'Read a book'];

            function toggleAt(i) {
              const state = useState('appState', { todos: [], nextIndex: 0 });
              const newTodos = state.todos.map((t, idx) =>
                idx === i ? { text: t.text, done: !t.done } : t
              );
              setState('appState', { ...state, todos: newTodos });
            }

            function removeAt(i) {
              const state = useState('appState', { todos: [], nextIndex: 0 });
              const newTodos = state.todos.filter((_, idx) => idx !== i);
              setState('appState', { ...state, todos: newTodos });
            }

            export function main() {
              const state = useState('appState', { todos: [], nextIndex: 0 });
              openWindow('https://example.com', { width: 600, height: 400 });

              const todoItems = state.todos.map((todo, i) =>
                div({ className: 'todo-item', id: 'todo-' + i }, [
                  input({ inputType: 'checkbox', checked: todo.done, id: 'check-' + i, onclick: 'toggle_' + i }),
                  div({ className: 'todo-text' }, [todo.text]),
                  button({ id: 'remove-' + i, onclick: 'remove_' + i }, ['x']),
                ])
              );

              return div({ id: 'todo-app' }, [
                div({ id: 'header' }, [
                  div({ id: 'count' }, ['Todos: ' + state.todos.length]),
                  button({ id: 'add-btn', onclick: 'addTodo' }, ['Add']),
                ]),
                div({ id: 'todo-list' }, todoItems),
                div({ id: 'footer' }, [
                  button({ id: 'finish-btn', onclick: 'finishApp' }, ['Finish']),
                ]),
              ]);
            }

            export function addTodo() {
              const state = useState('appState', { todos: [], nextIndex: 0 });
              const idx = state.nextIndex;
              if (idx >= ITEMS.length) return;
              setState('appState', {
                todos: [...state.todos, { text: ITEMS[idx], done: false }],
                nextIndex: idx + 1,
              });
            }

            export function toggle_0() { toggleAt(0); }
            export function toggle_1() { toggleAt(1); }
            export function toggle_2() { toggleAt(2); }
            export function remove_0() { removeAt(0); }
            export function remove_1() { removeAt(1); }
            export function remove_2() { removeAt(2); }

            export function finishApp() {
              const state = useState('appState', { todos: [], nextIndex: 0 });
              done({
                todoCount: state.todos.length,
                todos: state.todos.map(t => ({ text: t.text, done: t.done })),
              });
            }
          `;

        const donePromise = host.executePlugin(todoPlugin, { eventEmitter: emitter });

        // Helper to mount latest render to DOM container
        const mountRender = (renderIndex: number) => {
          const json = onRenderSpy.mock.calls[renderIndex - 1][1] as DomJson;
          container.innerHTML = '';
          container.appendChild(renderToDOM(json, 1, emitter));
        };

        // Step 1: Wait for initial render — empty todo list
        await waitForRender(onRenderSpy, 1);
        mountRender(1);
        expect(container.querySelector('#count')!.textContent).toBe('Todos: 0');
        expect(container.querySelectorAll('.todo-item').length).toBe(0);

        // Step 2: Click "Add" — should add "Buy groceries"
        container.querySelector<HTMLElement>('#add-btn')!.click();
        await waitForRender(onRenderSpy, 2);
        mountRender(2);
        expect(container.querySelector('#count')!.textContent).toBe('Todos: 1');
        expect(container.querySelectorAll('.todo-item').length).toBe(1);
        expect(container.querySelector('#todo-0 .todo-text')!.textContent).toBe('Buy groceries');
        expect(container.querySelector<HTMLInputElement>('#check-0')!.checked).toBe(false);

        // Step 3: Click "Add" again — should add "Walk the dog"
        container.querySelector<HTMLElement>('#add-btn')!.click();
        await waitForRender(onRenderSpy, 3);
        mountRender(3);
        expect(container.querySelector('#count')!.textContent).toBe('Todos: 2');
        expect(container.querySelectorAll('.todo-item').length).toBe(2);
        expect(container.querySelector('#todo-1 .todo-text')!.textContent).toBe('Walk the dog');

        // Step 4: Toggle checkbox on first todo
        container.querySelector<HTMLElement>('#check-0')!.click();
        await waitForRender(onRenderSpy, 4);
        mountRender(4);
        expect(container.querySelector<HTMLInputElement>('#check-0')!.checked).toBe(true);
        // Second todo still unchecked
        expect(container.querySelector<HTMLInputElement>('#check-1')!.checked).toBe(false);

        // Step 5: Remove second todo ("Walk the dog")
        container.querySelector<HTMLElement>('#remove-1')!.click();
        await waitForRender(onRenderSpy, 5);
        mountRender(5);
        expect(container.querySelector('#count')!.textContent).toBe('Todos: 1');
        expect(container.querySelectorAll('.todo-item').length).toBe(1);
        // Only "Buy groceries" (checked) remains
        expect(container.querySelector('#todo-0 .todo-text')!.textContent).toBe('Buy groceries');
        expect(container.querySelector<HTMLInputElement>('#check-0')!.checked).toBe(true);

        // Step 6: Click "Finish" — plugin calls done()
        container.querySelector<HTMLElement>('#finish-btn')!.click();
        const result = await donePromise;
        expect(result).toEqual({
          todoCount: 1,
          todos: [{ text: 'Buy groceries', done: true }],
        });

        // Cleanup
        document.body.removeChild(container);
      }, 15000);
    });
  });
});
