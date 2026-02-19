/**
 * MobilePluginHost
 *
 * Analogous to the extension's Host class (packages/plugin-sdk/src/index.ts),
 * but designed for React Native. Uses native QuickJS (via quickjs-native Expo module)
 * instead of WASM-based @sebastianwessel/quickjs.
 *
 * Responsibilities:
 * 1. Create QuickJS sandbox context via native module
 * 2. Inject plugin capability functions (prove, openWindow, div, button, hooks)
 * 3. Evaluate plugin code in the sandbox
 * 4. Handle callbacks when sandbox calls host functions
 * 5. Manage execution context (state store, hooks, event handling)
 * 6. Translate handler formats between plugin-sdk and mobile native
 */

// Simple unique ID generator — avoids the `uuid` package which requires
// crypto.getRandomValues() (unavailable in Hermes).
let _idCounter = 0;
function uuidv4(): string {
  _idCounter++;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `${ts}-${rand}-${_idCounter}`;
}

// ============================================================================
// Types (mirrors plugin-sdk types, avoids importing plugin-sdk + its WASM deps)
// ============================================================================

export type DomOptions = {
  className?: string;
  id?: string;
  style?: Record<string, string>;
  onclick?: string;
};

export type DomJson =
  | {
      type: 'div' | 'button';
      options: DomOptions;
      children: DomJson[];
    }
  | string;

export interface InterceptedRequest {
  id: string;
  method: string;
  url: string;
  timestamp: number;
  tabId: number;
  requestBody?: unknown;
}

export interface InterceptedRequestHeader {
  id: string;
  method: string;
  url: string;
  timestamp: number;
  type: string;
  requestHeaders: { name: string; value?: string }[];
  tabId: number;
}

/** Plugin-sdk handler format (SCREAMING_SNAKE_CASE) */
export interface PluginHandler {
  type: 'SENT' | 'RECV';
  part:
    | 'START_LINE'
    | 'PROTOCOL'
    | 'METHOD'
    | 'REQUEST_TARGET'
    | 'STATUS_CODE'
    | 'HEADERS'
    | 'BODY'
    | 'ALL';
  action: 'REVEAL' | 'PEDERSEN';
  params?: Record<string, unknown>;
}

/** Mobile native handler format (PascalCase) */
export interface NativeHandler {
  handlerType: 'Sent' | 'Recv';
  part: 'StartLine' | 'Protocol' | 'Method' | 'RequestTarget' | 'StatusCode' | 'Headers' | 'Body' | 'All';
  action: 'Reveal' | 'Pedersen';
  params?: {
    key?: string;
    hideKey?: boolean;
    hideValue?: boolean;
    contentType?: string;
    path?: string;
    regex?: string;
    flags?: string;
  };
}

export interface PluginConfig {
  name: string;
  description: string;
  version?: string;
  author?: string;
  requests?: {
    method: string;
    host: string;
    pathname: string;
    verifierUrl: string;
    proxyUrl?: string;
  }[];
  urls?: string[];
}

export type WindowMessage =
  | { type: 'HEADER_INTERCEPTED'; header: InterceptedRequestHeader; windowId: number }
  | { type: 'REQUEST_INTERCEPTED'; request: InterceptedRequest; windowId: number }
  | { type: 'PLUGIN_UI_CLICK'; onclick: string; windowId: number }
  | { type: 'WINDOW_CLOSED'; windowId: number }
  | { type: 'RE_RENDER_PLUGIN_UI'; windowId: number };

type EventListener = (message: WindowMessage) => void;

export interface EventEmitter {
  addListener: (listener: EventListener) => void;
  removeListener: (listener: EventListener) => void;
  emit: (message: WindowMessage) => void;
}

interface ExecutionContext {
  id: string;
  plugin: string;
  requests: InterceptedRequest[];
  headers: InterceptedRequestHeader[];
  windowId: number;
  context: Record<string, { effects: unknown[][]; selectors: unknown[][] }>;
  currentContext: string;
  stateStore: Record<string, unknown>;
  main: (force?: boolean) => DomJson | null;
  callbacks: Record<string, () => Promise<void>>;
}

// ============================================================================
// Handler format translation
// ============================================================================

const HANDLER_TYPE_MAP: Record<string, 'Sent' | 'Recv'> = {
  SENT: 'Sent',
  RECV: 'Recv',
};

const HANDLER_PART_MAP: Record<string, NativeHandler['part']> = {
  START_LINE: 'StartLine',
  PROTOCOL: 'Protocol',
  METHOD: 'Method',
  REQUEST_TARGET: 'RequestTarget',
  STATUS_CODE: 'StatusCode',
  HEADERS: 'Headers',
  BODY: 'Body',
  ALL: 'All',
};

const HANDLER_ACTION_MAP: Record<string, 'Reveal' | 'Pedersen'> = {
  REVEAL: 'Reveal',
  PEDERSEN: 'Pedersen',
};

export function translateHandler(handler: PluginHandler): NativeHandler {
  const result: NativeHandler = {
    handlerType: HANDLER_TYPE_MAP[handler.type] || 'Sent',
    part: HANDLER_PART_MAP[handler.part] || 'StartLine',
    action: HANDLER_ACTION_MAP[handler.action] || 'Reveal',
  };

  if (handler.params) {
    result.params = {};
    if (handler.params.key) result.params.key = handler.params.key as string;
    if (handler.params.hideKey) result.params.hideKey = handler.params.hideKey as boolean;
    if (handler.params.hideValue) result.params.hideValue = handler.params.hideValue as boolean;
    if (handler.params.path) result.params.path = handler.params.path as string;
    if (handler.params.regex) result.params.regex = handler.params.regex as string;
    if (handler.params.flags) result.params.flags = handler.params.flags as string;
    // Plugin uses params.type: 'json', native uses params.contentType: 'json'
    if (handler.params.type) result.params.contentType = handler.params.type as string;
  }

  return result;
}

export function translateHandlers(handlers: PluginHandler[]): NativeHandler[] {
  return handlers.map(translateHandler);
}

// ============================================================================
// Execution context registry (same pattern as plugin-sdk)
// ============================================================================

const contextRegistry = new Map<string, ExecutionContext>();

function updateContext(
  uuid: string,
  updates: Partial<ExecutionContext>,
): void {
  const ctx = contextRegistry.get(uuid);
  if (!ctx) throw new Error('Execution context not found: ' + uuid);
  contextRegistry.set(uuid, { ...ctx, ...updates });
}

// ============================================================================
// Hook factories (equivalent to plugin-sdk's makeUseEffect, makeUseHeaders, etc.)
// ============================================================================

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;

  for (const key of aKeys) {
    if (!deepEqual(aObj[key], bObj[key])) return false;
  }
  return true;
}

function createDomJson(
  type: 'div' | 'button',
  param1: DomOptions | DomJson[] = {},
  param2: DomJson[] = [],
): DomJson {
  let options: DomOptions = {};
  let children: DomJson[] = [];
  if (Array.isArray(param1)) {
    children = param1;
  } else if (typeof param1 === 'object') {
    options = param1;
    children = param2;
  }
  return { type, options, children };
}

function makeUseEffect(
  uuid: string,
  hookContext: Record<string, { effects: unknown[][]; selectors: unknown[][] }>,
) {
  return (effect: () => void, deps: unknown[]) => {
    const ctx = contextRegistry.get(uuid);
    if (!ctx) throw new Error('Execution context not found');
    const fnName = ctx.currentContext;
    hookContext[fnName] = hookContext[fnName] || { effects: [], selectors: [] };
    const effects = hookContext[fnName].effects;
    const lastDeps = ctx.context[fnName]?.effects[effects.length];
    effects.push(deps);
    if (deepEqual(lastDeps, deps)) return;
    effect();
  };
}

function makeUseRequests(
  uuid: string,
  hookContext: Record<string, { effects: unknown[][]; selectors: unknown[][] }>,
) {
  return (filterFn: (requests: InterceptedRequest[]) => InterceptedRequest[]) => {
    const ctx = contextRegistry.get(uuid);
    if (!ctx) throw new Error('Execution context not found');
    const fnName = ctx.currentContext;
    hookContext[fnName] = hookContext[fnName] || { effects: [], selectors: [] };
    const requests = JSON.parse(JSON.stringify(ctx.requests || []));
    const result = filterFn(requests);
    hookContext[fnName].selectors.push(result);
    return result;
  };
}

function makeUseHeaders(
  uuid: string,
  hookContext: Record<string, { effects: unknown[][]; selectors: unknown[][] }>,
) {
  return (filterFn: (headers: InterceptedRequestHeader[]) => InterceptedRequestHeader[]) => {
    const ctx = contextRegistry.get(uuid);
    if (!ctx) throw new Error('Execution context not found');
    const fnName = ctx.currentContext;
    hookContext[fnName] = hookContext[fnName] || { effects: [], selectors: [] };
    const headers = JSON.parse(JSON.stringify(ctx.headers || []));
    const result = filterFn(headers);
    if (!Array.isArray(result)) {
      throw new Error('useHeaders: filter function must return an array');
    }
    hookContext[fnName].selectors.push(result);
    return result;
  };
}

function makeUseState(
  uuid: string,
  stateStore: Record<string, unknown>,
) {
  return (key: string, defaultValue: unknown) => {
    if (stateStore[key] === undefined && defaultValue !== undefined) {
      stateStore[key] = defaultValue;
    }
    return stateStore[key];
  };
}

function makeSetState(
  uuid: string,
  stateStore: Record<string, unknown>,
  eventEmitter: EventEmitter,
) {
  return (key: string, value: unknown) => {
    const ctx = contextRegistry.get(uuid);
    if (!ctx) throw new Error('Execution context not found');
    const oldStore = { ...stateStore };
    stateStore[key] = value;
    if (deepEqual(oldStore, stateStore)) return;
    // Defer re-render to avoid recursive main() calls when setState is
    // called from within main(). Without this, the recursive main(true)
    // renders the correct UI, but then the original main() overwrites it
    // with stale domJson (where the local variable still had the old value).
    queueMicrotask(() => {
      eventEmitter.emit({
        type: 'RE_RENDER_PLUGIN_UI',
        windowId: ctx.windowId || 0,
      });
    });
  };
}

// ============================================================================
// MobilePluginHost
// ============================================================================

interface MobilePluginHostOptions {
  /**
   * Called when the plugin calls prove(requestOptions, proverOptions).
   * The host should translate handlers and call tlsn-native.
   */
  onProve: (
    requestOptions: { url: string; method: string; headers: Record<string, string>; body?: string },
    proverOptions: { verifierUrl: string; proxyUrl: string; maxRecvData?: number; maxSentData?: number; handlers: PluginHandler[] },
  ) => Promise<unknown>;

  /** Called when the plugin renders UI (DomJson) */
  onRenderPluginUi: (windowId: number, domJson: DomJson) => void;

  /** Called when the plugin calls openWindow(url, options) */
  onOpenWindow: (url: string, options?: { width?: number; height?: number; showOverlay?: boolean }) => Promise<{ windowId: number; uuid: string; tabId: number }>;

  /** Called when the plugin calls done() or closes a window */
  onCloseWindow: (windowId: number) => void;
}

/**
 * MobilePluginHost executes plugin code and provides host capabilities.
 *
 * Currently uses direct function evaluation (no sandbox).
 * Phase 1 (QuickJS native module) will add true sandbox isolation.
 *
 * The key insight: plugin code exports functions (main, onClick, etc.) and
 * uses globals (div, button, prove, useState, etc.) that the host provides.
 * This class provides those globals and manages the execution lifecycle.
 */
export class MobilePluginHost {
  private onProve: MobilePluginHostOptions['onProve'];
  private onRenderPluginUi: MobilePluginHostOptions['onRenderPluginUi'];
  private onOpenWindow: MobilePluginHostOptions['onOpenWindow'];
  private onCloseWindow: MobilePluginHostOptions['onCloseWindow'];

  constructor(options: MobilePluginHostOptions) {
    this.onProve = options.onProve;
    this.onRenderPluginUi = options.onRenderPluginUi;
    this.onOpenWindow = options.onOpenWindow;
    this.onCloseWindow = options.onCloseWindow;
  }

  /**
   * Execute a plugin in the host environment.
   *
   * This evaluates the plugin code, injects capabilities, calls main(),
   * and returns a promise that resolves when the plugin calls done().
   */
  async executePlugin(
    code: string,
    { eventEmitter }: { eventEmitter: EventEmitter },
  ): Promise<unknown> {
    const uuid = uuidv4();
    const hookContext: Record<string, { effects: unknown[][]; selectors: unknown[][] }> = {};
    const stateStore: Record<string, unknown> = {};

    let doneResolve: (result?: unknown) => void;
    let doneReject: (error: Error) => void;
    let isCompleted = false;

    const donePromise = new Promise((resolve, reject) => {
      doneResolve = resolve;
      doneReject = reject;
    });

    const onCloseWindow = this.onCloseWindow;
    const onRenderPluginUi = this.onRenderPluginUi;
    const onOpenWindow = this.onOpenWindow;
    const onProve = this.onProve;

    // Build the capability globals that plugin code expects
    const capabilities = {
      div: (param1?: DomOptions | DomJson[], param2?: DomJson[]) =>
        createDomJson('div', param1, param2),
      button: (param1?: DomOptions | DomJson[], param2?: DomJson[]) =>
        createDomJson('button', param1, param2),
      openWindow: async (
        url: string,
        options?: { width?: number; height?: number; showOverlay?: boolean },
      ) => {
        const response = await onOpenWindow(url, options);
        updateContext(uuid, { windowId: response.windowId });

        // Set up message listener for this window
        const onMessage = async (message: WindowMessage) => {
          if (message.type === 'WINDOW_CLOSED') {
            eventEmitter.removeListener(onMessage);
            return;
          }

          const ctx = contextRegistry.get(uuid);
          if (!ctx) {
            eventEmitter.removeListener(onMessage);
            return;
          }

          if ('windowId' in message && message.windowId !== ctx.windowId) return;

          try {
            if (message.type === 'REQUEST_INTERCEPTED') {
              updateContext(uuid, {
                requests: [...(ctx.requests || []), message.request],
              });
              ctx.main();
            }
            if (message.type === 'HEADER_INTERCEPTED') {
              updateContext(uuid, {
                headers: [...(ctx.headers || []), message.header],
              });
              ctx.main();
            }
            if (message.type === 'PLUGIN_UI_CLICK') {
              const cb = ctx.callbacks[message.onclick];
              if (cb) {
                updateContext(uuid, { currentContext: message.onclick });
                await cb();
                if (contextRegistry.has(uuid)) {
                  updateContext(uuid, { currentContext: '' });
                }
              }
            }
            if (message.type === 'RE_RENDER_PLUGIN_UI') {
              ctx.main(true);
            }
          } catch (error) {
            console.error(`[MobilePluginHost] Error handling message ${message.type}:`, error);
            eventEmitter.removeListener(onMessage);
          }
        };

        eventEmitter.addListener(onMessage);
        return response;
      },
      useEffect: makeUseEffect(uuid, hookContext),
      useRequests: makeUseRequests(uuid, hookContext),
      useHeaders: makeUseHeaders(uuid, hookContext),
      useState: makeUseState(uuid, stateStore),
      setState: makeSetState(uuid, stateStore, eventEmitter),
      prove: onProve,
      done: (result?: unknown) => {
        if (isCompleted) return;
        isCompleted = true;
        const ctx = contextRegistry.get(uuid);
        if (ctx?.windowId) onCloseWindow(ctx.windowId);
        contextRegistry.delete(uuid);
        doneResolve(result);
      },
    };

    // Evaluate the plugin code.
    //
    // NOTE: This currently uses Function() constructor (no sandbox isolation).
    // Phase 1 (QuickJS native Expo module) will replace this with true sandboxed
    // evaluation via the native QuickJS C engine.
    let exportedCode: Record<string, unknown>;
    try {
      exportedCode = evaluatePluginCode(code, capabilities);
    } catch (evalError) {
      const error = evalError instanceof Error ? evalError : new Error(String(evalError));
      doneReject!(new Error(`Plugin evaluation failed: ${error.message}`));
      return donePromise;
    }

    const { main: mainFn, ...otherExports } = exportedCode;

    if (typeof mainFn !== 'function') {
      doneReject!(new Error('Main function not found in plugin'));
      return donePromise;
    }

    // Collect callback functions (onClick, expandUI, minimizeUI, etc.)
    const callbacks: Record<string, () => Promise<void>> = {};
    for (const key in otherExports) {
      if (typeof otherExports[key] === 'function') {
        callbacks[key] = otherExports[key] as () => Promise<void>;
      }
    }

    let lastJson: DomJson | null = null;

    const main = (force = false) => {
      try {
        updateContext(uuid, { currentContext: 'main' });

        let result = (mainFn as () => DomJson)();
        const lastSelectors = contextRegistry.get(uuid)?.context['main']?.selectors;
        const selectors = hookContext['main']?.selectors;
        const lastStateStore = contextRegistry.get(uuid)?.stateStore;

        if (!force && deepEqual(lastSelectors, selectors) && deepEqual(lastStateStore, stateStore)) {
          result = null as unknown as DomJson;
        }

        updateContext(uuid, {
          currentContext: '',
          context: {
            ...contextRegistry.get(uuid)?.context,
            main: {
              effects: JSON.parse(JSON.stringify(hookContext['main']?.effects || [])),
              selectors: JSON.parse(JSON.stringify(hookContext['main']?.selectors || [])),
            },
          },
          stateStore: JSON.parse(JSON.stringify(stateStore)),
        });

        if (hookContext['main']) {
          hookContext['main'].effects.length = 0;
          hookContext['main'].selectors.length = 0;
        }

        if (result) {
          lastJson = result;
          // Wait for windowId to be set before rendering
          const ctx = contextRegistry.get(uuid);
          if (ctx?.windowId) {
            onRenderPluginUi(ctx.windowId, lastJson);
          } else {
            // Queue render for when window opens
            waitForWindow(() => contextRegistry.get(uuid)?.windowId).then(
              (windowId) => {
                if (windowId && lastJson) {
                  onRenderPluginUi(windowId, lastJson);
                }
              },
            );
          }
        }

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        if (!isCompleted) {
          isCompleted = true;
          const ctx = contextRegistry.get(uuid);
          if (ctx?.windowId) onCloseWindow(ctx.windowId);
          contextRegistry.delete(uuid);
          doneReject!(new Error(`Plugin main() error: ${err.message}`));
        }
        return null;
      }
    };

    // Register execution context
    contextRegistry.set(uuid, {
      id: uuid,
      plugin: code,
      requests: [],
      headers: [],
      windowId: 0,
      context: {},
      currentContext: '',
      stateStore: {},
      main,
      callbacks,
    });

    // Run initial main()
    main();

    return donePromise;
  }

  /**
   * Feed an intercepted header into a running plugin's execution context.
   */
  emitHeaderIntercepted(
    eventEmitter: EventEmitter,
    windowId: number,
    header: InterceptedRequestHeader,
  ): void {
    eventEmitter.emit({
      type: 'HEADER_INTERCEPTED',
      header,
      windowId,
    });
  }

  /**
   * Dispatch a plugin UI button click.
   */
  emitPluginAction(
    eventEmitter: EventEmitter,
    windowId: number,
    onclick: string,
  ): void {
    eventEmitter.emit({
      type: 'PLUGIN_UI_CLICK',
      onclick,
      windowId,
    });
  }
}

// ============================================================================
// Plugin code evaluation
// ============================================================================

/**
 * Evaluate plugin code with injected capabilities.
 *
 * TEMPORARY: Uses Function() constructor (no sandbox).
 * Will be replaced with native QuickJS evaluation in Phase 1.
 */
function evaluatePluginCode(
  code: string,
  capabilities: Record<string, unknown>,
): Record<string, unknown> {
  // Build the preamble that makes capabilities available as globals
  const capabilityNames = Object.keys(capabilities);
  const preamble = capabilityNames
    .map((name) => `const ${name} = __capabilities__.${name};`)
    .join('\n');

  // The plugin code ends with `export default { config, main, onClick, ... }`
  // We need to capture that. Transform the export to a return.
  const transformedCode = code
    .replace(/export\s+default\s+/, 'return ')
    // Also handle: export { main, onClick, ... }
    .replace(/export\s*\{[^}]+\}\s*;?/g, '');

  const wrappedCode = `
    ${preamble}
    ${transformedCode}
  `;

  // eslint-disable-next-line no-new-func
  const fn = new Function('__capabilities__', wrappedCode);
  return fn(capabilities);
}

// ============================================================================
// Utilities
// ============================================================================

async function waitForWindow(
  getter: () => number | undefined,
  retry = 0,
): Promise<number | null> {
  const value = getter();
  if (value) return value;
  if (retry < 100) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return waitForWindow(getter, retry + 1);
  }
  return null;
}
