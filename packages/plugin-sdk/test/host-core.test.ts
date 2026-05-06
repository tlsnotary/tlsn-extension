/**
 * Node.js unit tests for HostCore.
 *
 * Uses a new Function() mock evaluator — no QuickJS WASM or browser needed.
 *
 * IMPORTANT PATTERN: openWindow() must be called from within main() or a click
 * handler, NOT from inside the evaluator body. The evaluator runs before
 * executionContextRegistry is populated, so openWindow() finds no context and
 * early-exits without setting windowId.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { HostCore, executionContextRegistry } from '../src/host-core';
import type { PluginEvaluator, PluginEvaluatorResult, AnyFunction } from '../src/host-core';
import type { DomJson, WindowMessage } from '../src/types';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

function createMockEvaluator(): PluginEvaluator {
  return {
    evaluate: async (
      code: string,
      capabilities: Record<string, AnyFunction>,
    ): Promise<PluginEvaluatorResult> => {
      const exports: Record<string, unknown> = {};
      const capNames = Object.keys(capabilities);
      const capValues = Object.values(capabilities);
      const fn = new Function('exports', ...capNames, code);
      fn(exports, ...capValues);
      return { exports, dispose: vi.fn() };
    },
  };
}

/**
 * Relays TO_BG_RE_RENDER_PLUGIN_UI → RE_RENDER_PLUGIN_UI.
 * This simulates what the extension's background script does so that setState()
 * triggers re-renders in unit tests (no background script present).
 */
function createTestEventEmitter() {
  const listeners: Set<(msg: WindowMessage) => void> = new Set();
  return {
    addListener: (l: (msg: WindowMessage) => void) => listeners.add(l),
    removeListener: (l: (msg: WindowMessage) => void) => listeners.delete(l),
    emit: (msg: WindowMessage) => {
      const out: WindowMessage =
        msg.type === 'TO_BG_RE_RENDER_PLUGIN_UI'
          ? { type: 'RE_RENDER_PLUGIN_UI', windowId: msg.windowId }
          : msg;
      for (const l of [...listeners]) l(out);
    },
  };
}

function makeHost(overrides: Partial<ConstructorParameters<typeof HostCore>[0]> = {}) {
  const onProve = vi.fn().mockResolvedValue({ proof: 'mock-proof' });
  const onRenderPluginUi = vi.fn();
  const onCloseWindow = vi.fn();
  const onOpenWindow = vi.fn().mockResolvedValue({
    type: 'WINDOW_OPENED',
    payload: { windowId: 42, uuid: 'test-uuid', tabId: 1 },
  });

  const host = new HostCore({
    evaluator: createMockEvaluator(),
    onProve,
    onRenderPluginUi,
    onCloseWindow,
    onOpenWindow,
    ...overrides,
  });

  return { host, onProve, onRenderPluginUi, onCloseWindow, onOpenWindow };
}

/**
 * Yield to the event loop — lets all pending microtasks and one macrotask
 * round complete. After this:
 * - evaluate() has resolved
 * - openWindow() (if called from main()) has resolved and windowId is set
 * - waitForWindow() has resolved
 * - onRenderPluginUi() has been called (if main returned non-null)
 * - makeOpenWindow's message listener is active
 */
const settle = () => new Promise<void>((r) => setTimeout(r, 0));

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. Core lifecycle
// ---------------------------------------------------------------------------

describe('HostCore — core lifecycle', () => {
  it('resolves with the value passed to done()', async () => {
    const { host } = makeHost();
    const code = `exports.main = function() { done('success'); return null; };`;
    await expect(
      host.executePlugin(code, { eventEmitter: createTestEventEmitter() }),
    ).resolves.toBe('success');
  });

  it('rejects when the evaluator throws', async () => {
    const badEval: PluginEvaluator = {
      evaluate: async () => {
        throw new Error('syntax error');
      },
    };
    const { host } = makeHost({ evaluator: badEval });
    await expect(
      host.executePlugin('', { eventEmitter: createTestEventEmitter() }),
    ).rejects.toThrow('Plugin evaluation failed: syntax error');
  });

  it('rejects when no main export is found', async () => {
    const { host } = makeHost();
    await expect(
      host.executePlugin('exports.config = {};', { eventEmitter: createTestEventEmitter() }),
    ).rejects.toThrow('Main function not found in plugin');
  });

  it('cleans up the context registry after done()', async () => {
    const { host } = makeHost();
    await host.executePlugin('exports.main = function() { done(); return null; };', {
      eventEmitter: createTestEventEmitter(),
    });
    expect(executionContextRegistry.size).toBe(0);
  });

  it('done() is idempotent — second call is a no-op', async () => {
    const { host } = makeHost();
    const code = `
exports.main = function() {
  done('first');
  done('second');
  return null;
};`;
    const result = await host.executePlugin(code, { eventEmitter: createTestEventEmitter() });
    expect(result).toBe('first');
  });
});

// ---------------------------------------------------------------------------
// 2. useState / setState
// ---------------------------------------------------------------------------

describe('HostCore — useState / setState', () => {
  it('returns the default value on first call', async () => {
    const { host } = makeHost();
    const code = `
exports.main = function() {
  var v = useState('x', 99);
  done(v);
  return null;
};`;
    await expect(
      host.executePlugin(code, { eventEmitter: createTestEventEmitter() }),
    ).resolves.toBe(99);
  });

  it('preserves falsy defaults (0, false, empty string)', async () => {
    const { host } = makeHost();
    const code = `
exports.main = function() {
  var a = useState('zero', 0);
  var b = useState('bool', false);
  var c = useState('str', '');
  done([a, b, c]);
  return null;
};`;
    const [a, b, c] = (await host.executePlugin(code, {
      eventEmitter: createTestEventEmitter(),
    })) as unknown[];
    expect(a).toBe(0);
    expect(b).toBe(false);
    expect(c).toBe('');
  });

  it('setState triggers a re-render and updated state is visible', async () => {
    const emitter = createTestEventEmitter();
    let renderCount = 0;

    // Pattern: openWindow called from main() (AFTER context exists) — NOT from evaluate.
    // This ensures windowId is set before waitForWindow's first poll, and the
    // makeOpenWindow listener is active when PLUGIN_UI_CLICK arrives.
    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            renderCount++;
            const count = caps['useState']('count', 0) as number;
            caps['openWindow']('http://example.com'); // fire-and-forget from sync main()
            if (renderCount >= 2) {
              caps['done'](count);
              return null;
            }
            return caps['div']({}, [String(count)]);
          },
          increment: async () => {
            caps['setState']('count', 7);
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host } = makeHost({ evaluator });
    const p = host.executePlugin('', { eventEmitter: emitter });

    // Let all microtasks run: evaluate → main() → openWindow → waitForWindow → onRenderPluginUi
    await settle();

    // Click → increment → setState → relay (TO_BG → RE_RENDER) → main(true) → done(7)
    emitter.emit({ type: 'PLUGIN_UI_CLICK', onclick: 'increment', windowId: 42 });

    expect(await p).toBe(7);
  });

  it('state persists across re-renders', async () => {
    const emitter = createTestEventEmitter();
    let renderCount = 0;

    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            renderCount++;
            const val = caps['useState']('val', 'initial') as string;
            caps['openWindow']('http://example.com');
            if (renderCount >= 3) {
              caps['done'](val);
              return null;
            }
            return caps['div']({}, [val]);
          },
          step1: async () => {
            caps['setState']('val', 'step1');
          },
          step2: async () => {
            caps['setState']('val', 'step2');
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host } = makeHost({ evaluator });
    const p = host.executePlugin('', { eventEmitter: emitter });

    await settle();
    emitter.emit({ type: 'PLUGIN_UI_CLICK', onclick: 'step1', windowId: 42 });
    await settle();
    emitter.emit({ type: 'PLUGIN_UI_CLICK', onclick: 'step2', windowId: 42 });

    expect(await p).toBe('step2');
  });
});

// ---------------------------------------------------------------------------
// 3. useEffect
// ---------------------------------------------------------------------------

describe('HostCore — useEffect', () => {
  it('runs effect on first call', async () => {
    let effectRan = false;
    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            caps['useEffect'](() => {
              effectRan = true;
            }, []);
            caps['done'](effectRan);
            return null;
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host } = makeHost({ evaluator });
    await expect(host.executePlugin('', { eventEmitter: createTestEventEmitter() })).resolves.toBe(
      true,
    );
  });

  it('does not re-run effect when deps are identical', async () => {
    const emitter = createTestEventEmitter();
    let effectRunCount = 0;
    let renderCount = 0;

    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            renderCount++;
            caps['useEffect'](() => {
              effectRunCount++;
            }, ['constant']);
            caps['openWindow']('http://example.com');
            if (renderCount >= 2) {
              caps['done'](effectRunCount);
              return null;
            }
            return caps['div']({}, ['render']);
          },
          trigger: async () => {
            caps['setState']('tick', renderCount);
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host } = makeHost({ evaluator });
    const p = host.executePlugin('', { eventEmitter: emitter });

    await settle();
    emitter.emit({ type: 'PLUGIN_UI_CLICK', onclick: 'trigger', windowId: 42 });

    expect(await p).toBe(1); // effect ran once — same deps skips on re-render
  });

  it('re-runs effect when deps change', async () => {
    const emitter = createTestEventEmitter();
    let effectRunCount = 0;
    let renderCount = 0;

    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            renderCount++;
            caps['useEffect'](() => {
              effectRunCount++;
            }, [renderCount]); // deps change each render
            caps['openWindow']('http://example.com');
            if (renderCount >= 2) {
              caps['done'](effectRunCount);
              return null;
            }
            return caps['div']({}, ['render']);
          },
          trigger: async () => {
            caps['setState']('tick', renderCount);
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host } = makeHost({ evaluator });
    const p = host.executePlugin('', { eventEmitter: emitter });

    await settle();
    emitter.emit({ type: 'PLUGIN_UI_CLICK', onclick: 'trigger', windowId: 42 });

    expect(await p).toBe(2); // effect ran twice — deps changed on re-render
  });
});

// ---------------------------------------------------------------------------
// 4. done() / doneWithOverlay()
// ---------------------------------------------------------------------------

describe('HostCore — done() / doneWithOverlay()', () => {
  it('done() calls onCloseWindow when a window is open', async () => {
    const emitter = createTestEventEmitter();

    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            caps['openWindow']('http://example.com');
            return caps['div']({}, ['waiting']);
          },
          finish: async () => {
            caps['done']('closed');
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host, onCloseWindow } = makeHost({ evaluator });
    const p = host.executePlugin('', { eventEmitter: emitter });

    await settle();
    emitter.emit({ type: 'PLUGIN_UI_CLICK', onclick: 'finish', windowId: 42 });

    await p;
    expect(onCloseWindow).toHaveBeenCalledWith(42);
  });

  it('doneWithOverlay() falls back to done() when no window is open', async () => {
    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            caps['doneWithOverlay']('result');
            return null;
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host, onRenderPluginUi } = makeHost({ evaluator });
    const result = await host.executePlugin('', { eventEmitter: createTestEventEmitter() });

    expect(result).toBe('result');
    expect(onRenderPluginUi).not.toHaveBeenCalled();
  });

  it('doneWithOverlay() renders a completion overlay then closes window', async () => {
    const emitter = createTestEventEmitter();

    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            caps['openWindow']('http://example.com');
            return caps['div']({}, ['content']);
          },
          finish: async () => {
            caps['doneWithOverlay']('done', { delayMs: 0 });
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host, onRenderPluginUi, onCloseWindow } = makeHost({ evaluator });
    const p = host.executePlugin('', { eventEmitter: emitter });

    await settle();
    emitter.emit({ type: 'PLUGIN_UI_CLICK', onclick: 'finish', windowId: 42 });

    await p;

    // Overlay was rendered (has a div structure as DomJson)
    const overlayCall = onRenderPluginUi.mock.calls.find(([wid]) => wid === 42);
    expect(overlayCall).toBeDefined();
    const overlay = overlayCall![1] as DomJson;
    expect(typeof overlay).toBe('object');
    expect(onCloseWindow).toHaveBeenCalledWith(42);
  });
});

// ---------------------------------------------------------------------------
// 5. prove()
// ---------------------------------------------------------------------------

describe('HostCore — prove()', () => {
  it('calls onProve with canonicalized handlers', async () => {
    const emitter = createTestEventEmitter();
    const onProve = vi.fn().mockResolvedValue({ proof: 'p' });

    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            caps['openWindow']('http://example.com');
            return caps['div']({}, ['ready']);
          },
          doProve: async () => {
            await caps['prove'](
              { url: 'https://api.example.com', method: 'GET', headers: {} },
              {
                verifierUrl: 'http://localhost:7047',
                proxyUrl: 'wss://proxy',
                // String shorthand 'REVEAL' — should be canonicalized to { kind: 'REVEAL' }
                handlers: [{ type: 'SENT', part: 'START_LINE', action: 'REVEAL' }],
              },
            );
            caps['done']('done');
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host } = makeHost({ evaluator, onProve });
    const p = host.executePlugin('', { eventEmitter: emitter });

    await settle();
    emitter.emit({ type: 'PLUGIN_UI_CLICK', onclick: 'doProve', windowId: 42 });
    await p;

    expect(onProve).toHaveBeenCalledOnce();
    const [, proverOpts] = onProve.mock.calls[0];
    expect(proverOpts.handlers[0].action).toEqual({ kind: 'REVEAL' });
  });

  it('sets _proveProgress to COMPLETE after resolution', async () => {
    const emitter = createTestEventEmitter();
    const onProve = vi.fn().mockResolvedValue({ proof: 'p' });
    let progressAtEnd: unknown;

    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            caps['openWindow']('http://example.com');
            return caps['div']({}, ['ready']);
          },
          doProve: async () => {
            await caps['prove'](
              { url: 'https://api.example.com', method: 'GET', headers: {} },
              { verifierUrl: 'http://localhost:7047', proxyUrl: 'wss://proxy', handlers: [] },
            );
            progressAtEnd = caps['useState']('_proveProgress', null);
            caps['done']();
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host } = makeHost({ evaluator, onProve });
    const p = host.executePlugin('', { eventEmitter: emitter });

    await settle();
    emitter.emit({ type: 'PLUGIN_UI_CLICK', onclick: 'doProve', windowId: 42 });
    await p;

    expect((progressAtEnd as { step: string } | null)?.step).toBe('COMPLETE');
  });

  it('propagates onProgress callbacks to plugin state', async () => {
    const emitter = createTestEventEmitter();
    const onProve = vi.fn().mockImplementation(async (_req, _opts, onProgress) => {
      onProgress({ step: 'SENDING', progress: 0.5, message: 'Sending...' });
      return { proof: 'p' };
    });

    let capturedStep: string | undefined;

    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            caps['openWindow']('http://example.com');
            return caps['div']({}, ['ready']);
          },
          doProve: async () => {
            await caps['prove'](
              { url: 'https://api.example.com', method: 'GET', headers: {} },
              { verifierUrl: 'http://localhost:7047', proxyUrl: 'wss://proxy', handlers: [] },
            );
            capturedStep = (caps['useState']('_proveProgress', null) as { step: string } | null)
              ?.step;
            caps['done']();
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host } = makeHost({ evaluator, onProve });
    const p = host.executePlugin('', { eventEmitter: emitter });

    await settle();
    emitter.emit({ type: 'PLUGIN_UI_CLICK', onclick: 'doProve', windowId: 42 });
    await p;

    expect(capturedStep).toBe('COMPLETE');
  });
});

// ---------------------------------------------------------------------------
// 6. openWindow
// ---------------------------------------------------------------------------

describe('HostCore — openWindow', () => {
  it('calls onOpenWindow with the given URL and options', async () => {
    const { onOpenWindow } = makeHost();
    // Use a direct async main() for this simple case — no click needed
    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: async () => {
            await caps['openWindow']('https://example.com', { width: 800, height: 600 });
            caps['done']('opened');
            return null;
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host } = makeHost({ evaluator, onOpenWindow });
    await host.executePlugin('', { eventEmitter: createTestEventEmitter() });

    expect(onOpenWindow).toHaveBeenCalledWith('https://example.com', { width: 800, height: 600 });
  });

  it('returns the cached result on repeated calls (idempotent)', async () => {
    let r1: unknown, r2: unknown;
    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: async () => {
            r1 = await caps['openWindow']('https://example.com');
            r2 = await caps['openWindow']('https://example.com');
            caps['done']();
            return null;
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host, onOpenWindow } = makeHost({ evaluator });
    await host.executePlugin('', { eventEmitter: createTestEventEmitter() });

    expect(onOpenWindow).toHaveBeenCalledOnce();
    expect(r1).toBe(r2);
  });

  it('WINDOW_CLOSED terminates the plugin with an error', async () => {
    const emitter = createTestEventEmitter();

    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            caps['openWindow']('http://example.com');
            return caps['div']({}, ['waiting']);
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host } = makeHost({ evaluator });
    const p = host.executePlugin('', { eventEmitter: emitter });

    await settle(); // Let openWindow resolve, listener become active

    emitter.emit({ type: 'WINDOW_CLOSED', windowId: 42 });

    await expect(p).rejects.toThrow('Window closed by user');
  });

  it('buffers messages received before windowId resolves', async () => {
    const emitter = createTestEventEmitter();

    // Delay onOpenWindow to control when the window resolves
    let resolveOpen!: () => void;
    const slowOpenWindow = vi.fn().mockImplementation(
      () =>
        new Promise<{ type: string; payload: object }>((resolve) => {
          resolveOpen = () =>
            resolve({
              type: 'WINDOW_OPENED',
              payload: { windowId: 42, uuid: 'u', tabId: 1 },
            });
        }),
    );

    let capturedRequestCount = 0;
    let renderCount = 0;

    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            renderCount++;
            const reqs = caps['useRequests']((r: unknown[]) => r) as unknown[];
            capturedRequestCount = reqs.length;
            caps['openWindow']('http://example.com');
            if (capturedRequestCount > 0 && renderCount >= 2) {
              caps['done'](capturedRequestCount);
              return null;
            }
            return caps['div']({}, ['waiting']);
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host } = makeHost({ evaluator, onOpenWindow: slowOpenWindow });
    const p = host.executePlugin('', { eventEmitter: emitter });

    // Listener is added by openWindow (synchronously inside main's openWindow call)
    // but resolvedWindowId is still null — messages will be buffered
    await settle(); // main() and openWindow call run, listener added, but window not yet resolved

    // Send a request BEFORE the window resolves — should be buffered
    emitter.emit({
      type: 'REQUEST_INTERCEPTED',
      request: {
        id: 'req-1',
        method: 'GET',
        url: 'https://example.com/api',
        timestamp: Date.now(),
        tabId: 1,
      },
      windowId: 42,
    });

    // Now resolve the window — buffered request should be replayed into context
    resolveOpen();
    await settle();

    // Force a re-render so main() picks up the replayed request
    emitter.emit({ type: 'RE_RENDER_PLUGIN_UI', windowId: 42 });

    expect(await p).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7. addCapability()
// ---------------------------------------------------------------------------

describe('HostCore — addCapability()', () => {
  it('injects custom capability callable from plugin code', async () => {
    const customFn = vi.fn().mockReturnValue('custom');

    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            const val = caps['myFn']();
            caps['done'](val);
            return null;
          },
        },
        dispose: vi.fn(),
      }),
    };

    const { host } = makeHost({ evaluator });
    host.addCapability('myFn', customFn);

    const result = await host.executePlugin('', { eventEmitter: createTestEventEmitter() });

    expect(customFn).toHaveBeenCalledOnce();
    expect(result).toBe('custom');
  });
});

// ---------------------------------------------------------------------------
// 8. onRenderPluginUi
// ---------------------------------------------------------------------------

describe('HostCore — onRenderPluginUi', () => {
  it('is called with the DomJson returned by main() after window opens', async () => {
    const emitter = createTestEventEmitter();

    const evaluator: PluginEvaluator = {
      evaluate: async (_, caps) => ({
        exports: {
          main: () => {
            caps['openWindow']('http://example.com');
            return caps['div']({ id: 'root' }, ['Hello']);
          },
          finish: async () => caps['done'](),
        },
        dispose: vi.fn(),
      }),
    };

    const { host, onRenderPluginUi } = makeHost({ evaluator });
    const p = host.executePlugin('', { eventEmitter: emitter });

    // The initial render path goes through waitForWindow(), which polls every
    // 1 second until windowId is set in the registry. In production, the
    // background script forces a re-render via CONTENT_SCRIPT_READY when the
    // managed window's content script loads. Without that signal here, we
    // simply wait for the natural poll to complete.
    await vi.waitFor(() => expect(onRenderPluginUi).toHaveBeenCalled(), {
      timeout: 2000,
      interval: 50,
    });

    const [windowId, domJson] = onRenderPluginUi.mock.calls[0];
    expect(windowId).toBe(42);
    expect((domJson as { type: string }).type).toBe('div');

    emitter.emit({ type: 'PLUGIN_UI_CLICK', onclick: 'finish', windowId: 42 });
    await p;
  });
});
