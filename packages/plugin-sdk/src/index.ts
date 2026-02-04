/**
 * @tlsn/plugin-sdk
 *
 * SDK for developing and running TLSN WebAssembly plugins
 */

import { SandboxEvalCode, type SandboxOptions, loadQuickJs } from '@sebastianwessel/quickjs';
import variant from '@jitl/quickjs-ng-wasmfile-release-sync';
import { v4 as uuidv4 } from 'uuid';
import { logger, LogLevel, DEFAULT_LOG_LEVEL } from '@tlsn/common';
import {
  DomJson,
  DomOptions,
  ExecutionContext,
  InterceptedRequest,
  InterceptedRequestHeader,
  OpenWindowResponse,
  WindowMessage,
  Handler,
  PluginConfig,
  RequestPermission,
} from './types';
import deepEqual from 'fast-deep-equal';

// Module-level registry to avoid circular references in capability closures
const executionContextRegistry = new Map<string, ExecutionContext>();

// Pure function for updating execution context without `this` binding
function updateExecutionContext(
  uuid: string,
  params: {
    windowId?: number;
    plugin?: string;
    requests?: InterceptedRequest[];
    headers?: InterceptedRequestHeader[];
    context?: {
      [functionName: string]: {
        effects: any[][];
        selectors: any[][];
      };
    };
    currentContext?: string;
    stateStore?: { [key: string]: any };
  },
): void {
  const context = executionContextRegistry.get(uuid);
  if (!context) {
    throw new Error('Execution context not found');
  }
  executionContextRegistry.set(uuid, { ...context, ...params });
}

// Pure function for creating DOM JSON without `this` binding
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

  return {
    type,
    options,
    children,
  };
}

// Pure function for creating useEffect hook without `this` binding
function makeUseEffect(
  uuid: string,
  context: {
    [functionName: string]: {
      effects: any[][];
      selectors: any[][];
    };
  },
) {
  return (effect: () => void, deps: any[]) => {
    const executionContext = executionContextRegistry.get(uuid);
    if (!executionContext) {
      throw new Error('Execution context not found');
    }
    const functionName = executionContext.currentContext;
    context[functionName] = context[functionName] || {
      effects: [],
      selectors: [],
    };
    const effects = context[functionName].effects;
    const lastDeps = executionContext.context[functionName]?.effects[effects.length];
    effects.push(deps);
    if (deepEqual(lastDeps, deps)) {
      return;
    }
    effect();
  };
}

// Pure function for creating useRequests hook without `this` binding
function makeUseRequests(
  uuid: string,
  context: {
    [functionName: string]: {
      effects: any[][];
      selectors: any[][];
    };
  },
) {
  return (filterFn: (requests: InterceptedRequest[]) => InterceptedRequest[]) => {
    const executionContext = executionContextRegistry.get(uuid);
    if (!executionContext) {
      throw new Error('Execution context not found');
    }
    const functionName = executionContext.currentContext;
    context[functionName] = context[functionName] || {
      effects: [],
      selectors: [],
    };
    const selectors = context[functionName].selectors;
    const requests = JSON.parse(JSON.stringify(executionContext.requests || []));
    const result = filterFn(requests);
    selectors.push(result);
    return result;
  };
}

// Pure function for creating useHeaders hook without `this` binding
function makeUseHeaders(
  uuid: string,
  context: {
    [functionName: string]: {
      effects: any[][];
      selectors: any[][];
    };
  },
) {
  return (filterFn: (headers: InterceptedRequestHeader[]) => InterceptedRequestHeader[]) => {
    const executionContext = executionContextRegistry.get(uuid);
    if (!executionContext) {
      throw new Error('Execution context not found');
    }
    const functionName = executionContext.currentContext;
    context[functionName] = context[functionName] || {
      effects: [],
      selectors: [],
    };
    const selectors = context[functionName].selectors;
    // Serialize headers to break circular references
    const headers = JSON.parse(JSON.stringify(executionContext.headers || []));
    const result = filterFn(headers);

    // Validate that filterFn returned an array
    if (result === undefined) {
      throw new Error(`useHeaders: filter function returned undefined. expect an erray`);
    }
    if (!Array.isArray(result)) {
      throw new Error(`useHeaders: filter function must return an array, got ${typeof result}. `);
    }

    selectors.push(result);
    return result;
  };
}

function makeUseState(
  uuid: string,
  stateStore: { [key: string]: any },
  _eventEmitter: {
    emit: (message: any) => void;
  },
) {
  return (key: string, defaultValue: any) => {
    const executionContext = executionContextRegistry.get(uuid);
    if (!executionContext) {
      throw new Error('Execution context not found');
    }
    if (!stateStore[key] && defaultValue !== undefined) {
      stateStore[key] = defaultValue;
    }
    // eventEmitter.emit({
    //   type: 'TO_BG_RE_RENDER_PLUGIN_UI',
    //   windowId: executionContextRegistry.get(uuid)?.windowId || 0,
    // });
    return stateStore[key];
  };
}

function makeSetState(
  uuid: string,
  stateStore: { [key: string]: any },
  eventEmitter: {
    emit: (message: any) => void;
  },
) {
  return (key: string, value: any) => {
    const executionContext = executionContextRegistry.get(uuid);
    if (!executionContext) {
      throw new Error('Execution context not found');
    }
    stateStore[key] = value;
    if (deepEqual(stateStore, executionContext.stateStore)) {
      return;
    }

    eventEmitter.emit({
      type: 'TO_BG_RE_RENDER_PLUGIN_UI',
      windowId: executionContextRegistry.get(uuid)?.windowId || 0,
    });
  };
}

// Pure function for creating openWindow without `this` binding
function makeOpenWindow(
  uuid: string,
  eventEmitter: {
    addListener: (listener: (message: WindowMessage) => void) => void;
    removeListener: (listener: (message: WindowMessage) => void) => void;
  },
  onOpenWindow: (
    url: string,
    options?: {
      width?: number;
      height?: number;
      showOverlay?: boolean;
    },
  ) => Promise<OpenWindowResponse>,
  _onCloseWindow: (windowId: number) => void,
) {
  return async (
    url: string,
    options?: {
      width?: number;
      height?: number;
      showOverlay?: boolean;
    },
  ): Promise<{ windowId: number; uuid: string; tabId: number }> => {
    if (!url || typeof url !== 'string') {
      throw new Error('URL must be a non-empty string');
    }

    try {
      const response = await onOpenWindow(url, options);

      // Check if response indicates an error
      if (response?.type === 'WINDOW_ERROR') {
        throw new Error(
          response.payload?.details || response.payload?.error || 'Failed to open window',
        );
      }

      // Return window info from successful response
      if (response?.type === 'WINDOW_OPENED' && response.payload) {
        updateExecutionContext(uuid, {
          windowId: response.payload.windowId,
        });

        const onMessage = async (message: any) => {
          // Handle window closed first - always remove listener
          if (message.type === 'WINDOW_CLOSED') {
            eventEmitter.removeListener(onMessage);
            return;
          }

          // For all other messages, check if context still exists
          // Context may have been cleaned up due to error or done() call
          const executionContext = executionContextRegistry.get(uuid);
          if (!executionContext) {
            logger.debug(
              `[makeOpenWindow] Ignoring message ${message.type}: execution context no longer exists`,
            );
            eventEmitter.removeListener(onMessage);
            return;
          }

          try {
            if (message.type === 'REQUEST_INTERCEPTED') {
              const request = message.request;
              updateExecutionContext(uuid, {
                requests: [...(executionContext.requests || []), request],
              });
              executionContext.main();
            }

            if (message.type === 'HEADER_INTERCEPTED') {
              const header = message.header;
              updateExecutionContext(uuid, {
                headers: [...(executionContext.headers || []), header],
              });
              executionContext.main();
            }

            if (message.type === 'PLUGIN_UI_CLICK') {
              logger.debug('PLUGIN_UI_CLICK', message);
              const cb = executionContext.callbacks[message.onclick];

              logger.debug('Callback:', cb);
              if (cb) {
                updateExecutionContext(uuid, {
                  currentContext: message.onclick,
                });
                const result = await cb();
                // Re-check context exists after async callback
                if (executionContextRegistry.has(uuid)) {
                  updateExecutionContext(uuid, {
                    currentContext: '',
                  });
                }
                logger.debug('Callback result:', result);
              }
            }

            if (message.type === 'RE_RENDER_PLUGIN_UI') {
              logger.debug('[makeOpenWindow] RE_RENDER_PLUGIN_UI', message.windowId);
              executionContext.main(true);
            }
          } catch (error) {
            logger.error(`[makeOpenWindow] Error handling message ${message.type}:`, error);
            // Clean up on error to prevent further issues
            eventEmitter.removeListener(onMessage);
          }
        };

        eventEmitter.addListener(onMessage);

        return {
          windowId: response.payload.windowId,
          uuid: response.payload.uuid,
          tabId: response.payload.tabId,
        };
      }

      throw new Error('Invalid response from background script');
    } catch (error) {
      logger.error('[makeOpenWindow] Failed to open window:', error);
      throw error;
    }
  };
}

// Export Parser and its types
export {
  Parser,
  type Range,
  type ParsedValue,
  type ParsedHeader,
  type ParsedRequest,
  type ParsedResponse,
  type HeaderRangeOptions,
  type BodyRangeOptions,
} from './parser';

export class Host {
  private capabilities: Map<string, (...args: any[]) => any> = new Map();
  private onProve: (
    requestOptions: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
    },
    proverOptions: {
      verifierUrl: string;
      proxyUrl: string;
      maxRecvData?: number;
      maxSentData?: number;
      handlers: Handler[];
    },
  ) => Promise<any>;
  private onRenderPluginUi: (windowId: number, result: DomJson) => void;
  private onCloseWindow: (windowId: number) => void;
  private onOpenWindow: (
    url: string,
    options?: {
      width?: number;
      height?: number;
      showOverlay?: boolean;
    },
  ) => Promise<OpenWindowResponse>;

  constructor(options: {
    onProve: (
      requestOptions: {
        url: string;
        method: string;
        headers: Record<string, string>;
        body?: string;
      },
      proverOptions: {
        verifierUrl: string;
        proxyUrl: string;
        maxRecvData?: number;
        maxSentData?: number;
        handlers: Handler[];
      },
    ) => Promise<any>;
    onRenderPluginUi: (windowId: number, result: DomJson) => void;
    onCloseWindow: (windowId: number) => void;
    onOpenWindow: (
      url: string,
      options?: {
        width?: number;
        height?: number;
        showOverlay?: boolean;
      },
    ) => Promise<OpenWindowResponse>;
    logLevel?: LogLevel;
  }) {
    this.onProve = options.onProve;
    this.onRenderPluginUi = options.onRenderPluginUi;
    this.onCloseWindow = options.onCloseWindow;
    this.onOpenWindow = options.onOpenWindow;

    // Initialize logger with provided level or default to WARN
    logger.init(options.logLevel ?? DEFAULT_LOG_LEVEL);
  }

  addCapability(name: string, handler: (...args: any[]) => any): void {
    this.capabilities.set(name, handler);
  }

  async createEvalCode(capabilities?: { [method: string]: (...args: any[]) => any }): Promise<{
    eval: (code: string) => Promise<any>;
    dispose: () => void;
  }> {
    const { runSandboxed } = await loadQuickJs(variant);

    const options: SandboxOptions = {
      allowFetch: false,
      allowFs: false,
      maxStackSize: 0,
      env: {
        ...Object.fromEntries(this.capabilities),
        ...(capabilities || {}),
      },
    };

    let evalCode: SandboxEvalCode | null = null;
    let disposeCallback: (() => void) | null = null;

    // Start sandbox and keep it alive
    // Don't await this - we want it to keep running
    runSandboxed(async (sandbox) => {
      evalCode = sandbox.evalCode;

      // Keep the sandbox alive until dispose is called
      // The runtime won't be disposed until this promise resolves
      return new Promise<void>((resolve) => {
        disposeCallback = resolve;
      });
    }, options);

    // Wait for evalCode to be ready
    while (!evalCode) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Return evalCode and dispose function
    return {
      eval: async (code: string) => {
        const result = await evalCode!(code);

        if (!result.ok) {
          const err = new Error(result.error.message);
          err.name = result.error.name;
          err.stack = result.error.stack;
          throw err;
        }

        return result.data;
      },
      dispose: () => {
        if (disposeCallback) {
          disposeCallback();
          disposeCallback = null;
        }
      },
    };
  }

  updateExecutionContext(
    uuid: string,
    params: {
      windowId?: number;
      plugin?: string;
      requests?: InterceptedRequest[];
      headers?: InterceptedRequestHeader[];
      context?: {
        [functionName: string]: {
          effects: any[][];
          selectors: any[][];
        };
      };
      currentContext?: string;
    },
  ): void {
    updateExecutionContext(uuid, params);
  }

  async getPluginConfig(code: string): Promise<any> {
    const sandbox = await this.createEvalCode();
    const exportedCode = await sandbox.eval(`
const div = env.div;
const button = env.button;
const openWindow = env.openWindow;
const useEffect = env.useEffect;
const useRequests = env.useRequests;
const useHeaders = env.useHeaders;
const createProver = env.createProver;
const sendRequest = env.sendRequest;
const transcript = env.transcript;
const subtractRanges = env.subtractRanges;
const mapStringToRange = env.mapStringToRange;
const reveal = env.reveal;
const getResponse = env.getResponse;
const closeWindow = env.closeWindow;
const done = env.done;
${code};
`);

    const { config } = exportedCode;
    return config;
  }

  async executePlugin(
    code: string,
    {
      eventEmitter,
    }: {
      eventEmitter: {
        addListener: (listener: (message: WindowMessage) => void) => void;
        removeListener: (listener: (message: WindowMessage) => void) => void;
        emit: (message: WindowMessage) => void;
      };
    },
  ): Promise<unknown> {
    const uuid = uuidv4();

    const context: {
      [functionName: string]: {
        effects: any[][];
        selectors: any[][];
      };
    } = {};

    const stateStore: { [key: string]: any } = {};

    let doneResolve: (args?: any[]) => void;
    let doneReject: (error: Error) => void;
    let isCompleted = false;

    const donePromise = new Promise((resolve, reject) => {
      doneResolve = resolve;
      doneReject = reject;
    });

    // Helper to terminate plugin execution with an error
    const terminateWithError = (error: Error, sandbox?: { dispose: () => void }) => {
      if (isCompleted) return;
      isCompleted = true;
      logger.error('[executePlugin] Plugin terminated with error:', error);

      // Clean up registry entry
      const ctx = executionContextRegistry.get(uuid);
      if (ctx?.windowId) {
        try {
          this.onCloseWindow(ctx.windowId);
        } catch (closeError) {
          logger.error('[executePlugin] Error closing window:', closeError);
        }
      }
      executionContextRegistry.delete(uuid);

      // Dispose sandbox if provided
      if (sandbox) {
        try {
          sandbox.dispose();
        } catch (disposeError) {
          logger.error('[executePlugin] Error disposing sandbox:', disposeError);
        }
      }

      doneReject(error);
    };

    /**
     * The sandbox is a sandboxed environment that is used to execute the plugin code.
     * It is created using the createEvalCode method from the plugin-sdk.
     * The sandbox is created with the following capabilities:
     * - div: a function that creates a div element
     * - button: a function that creates a button element
     * - openWindow: a function that opens a new window
     * - useEffect: a function that creates a useEffect hook
     * - useRequests: a function that creates a useRequests hook
     * - useHeaders: a function that creates a useHeaders hook
     * - subtractRanges: a function that subtracts ranges
     * - mapStringToRange: a function that maps a string to a range
     * - createProver: a function that creates a prover
     * - sendRequest: a function that sends a request
     * - transcript: a function that returns the transcript
     * - reveal: a function that reveals a commit
     * - getResponse: a function that returns the verification response (sent/received data) or null
     * - closeWindow: a function that closes a window by windowId
     * - done: a function that completes the session and closes the window
     */
    // Create pure functions without `this` bindings to avoid circular references
    const onCloseWindow = this.onCloseWindow;
    const onRenderPluginUi = this.onRenderPluginUi;
    const onOpenWindow = this.onOpenWindow;
    const onProve = this.onProve;

    const sandbox = await this.createEvalCode({
      div: (param1?: DomOptions | DomJson[], param2?: DomJson[]) =>
        createDomJson('div', param1, param2),
      button: (param1?: DomOptions | DomJson[], param2?: DomJson[]) =>
        createDomJson('button', param1, param2),
      openWindow: makeOpenWindow(uuid, eventEmitter, onOpenWindow, onCloseWindow),
      useEffect: makeUseEffect(uuid, context),
      useRequests: makeUseRequests(uuid, context),
      useHeaders: makeUseHeaders(uuid, context),
      useState: makeUseState(uuid, stateStore, eventEmitter),
      setState: makeSetState(uuid, stateStore, eventEmitter),
      prove: onProve,
      done: (args?: any[]) => {
        if (isCompleted) return;
        isCompleted = true;

        // Close the window if it exists
        const context = executionContextRegistry.get(uuid);
        if (context?.windowId) {
          onCloseWindow(context.windowId);
        }
        executionContextRegistry.delete(uuid);
        doneResolve(args);
      },
    });

    let exportedCode;
    try {
      exportedCode = await sandbox.eval(`
const div = env.div;
const button = env.button;
const openWindow = env.openWindow;
const useEffect = env.useEffect;
const useRequests = env.useRequests;
const useHeaders = env.useHeaders;
const useState = env.useState;
const setState = env.setState;
const prove = env.prove;
const closeWindow = env.closeWindow;
const done = env.done;
${code};
`);
    } catch (evalError) {
      const error = evalError instanceof Error ? evalError : new Error(String(evalError));
      terminateWithError(new Error(`Plugin evaluation failed: ${error.message}`), sandbox);
      return donePromise;
    }

    const { main: mainFn, ...args } = exportedCode;

    if (typeof mainFn !== 'function') {
      terminateWithError(new Error('Main function not found in plugin'), sandbox);
      return donePromise;
    }

    const callbacks: {
      [callbackName: string]: () => Promise<void>;
    } = {};

    for (const key in args) {
      if (typeof args[key] === 'function') {
        callbacks[key] = args[key];
      }
    }

    let json: DomJson | null = null;

    const main = (force = false) => {
      try {
        updateExecutionContext(uuid, {
          currentContext: 'main',
        });

        let result = mainFn();
        const lastSelectors = executionContextRegistry.get(uuid)?.context['main']?.selectors;
        const selectors = context['main']?.selectors;
        const lastStateStore = executionContextRegistry.get(uuid)?.stateStore;

        if (
          !force &&
          deepEqual(lastSelectors, selectors) &&
          deepEqual(lastStateStore, stateStore)
        ) {
          result = null;
        }

        updateExecutionContext(uuid, {
          currentContext: '',
          context: {
            ...executionContextRegistry.get(uuid)?.context,
            main: {
              effects: JSON.parse(JSON.stringify(context['main']?.effects)),
              selectors: JSON.parse(JSON.stringify(context['main']?.selectors)),
            },
          },
          stateStore: JSON.parse(JSON.stringify(stateStore)),
        });

        if (context['main']) {
          context['main'].effects.length = 0;
          context['main'].selectors.length = 0;
        }

        if (result) {
          logger.debug('Main function executed:', result);

          logger.debug(
            'executionContextRegistry.get(uuid)?.windowId',
            executionContextRegistry.get(uuid)?.windowId,
          );

          json = result;
          waitForWindow(async () => executionContextRegistry.get(uuid)?.windowId).then(
            (windowId: number) => {
              logger.debug('render result', json as DomJson);
              onRenderPluginUi(windowId!, json as DomJson);
            },
          );
        }

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        terminateWithError(new Error(`Plugin main() error: ${err.message}`), sandbox);
        return null;
      }
    };

    executionContextRegistry.set(uuid, {
      id: uuid,
      plugin: code,
      pluginUrl: '',
      context: {},
      currentContext: '',
      sandbox,
      main: main,
      callbacks: callbacks,
      stateStore: {},
    });

    // Execute initial main() - errors are handled within main() via terminateWithError
    main();

    return donePromise;
  }

  /**
   * Public method for creating DOM JSON
   * Delegates to the pure module-level function
   */
  createDomJson = (
    type: 'div' | 'button',
    param1: DomOptions | DomJson[] = {},
    param2: DomJson[] = [],
  ): DomJson => {
    return createDomJson(type, param1, param2);
  };
}

async function waitForWindow(callback: () => Promise<any>, retry = 0): Promise<any | null> {
  const resp = await callback();

  if (resp) return resp;

  if (retry < 100) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return waitForWindow(callback, retry + 1);
  }

  return null;
}

/**
 * Extract plugin configuration from plugin code without executing it.
 * Uses regex-based parsing to extract the config object from the source code.
 *
 * Note: This regex-based approach cannot extract complex fields like arrays
 * (requests, urls). For full config extraction including permissions, use
 * Host.getPluginConfig() which uses the QuickJS sandbox.
 *
 * @param code - The plugin source code
 * @returns The plugin config object, or null if extraction fails
 */
export async function extractConfig(code: string): Promise<PluginConfig | null> {
  try {
    // Pattern to match config object definition:
    // const config = { name: '...', description: '...' }
    // or
    // const config = { name: "...", description: "..." }
    const configPattern =
      /const\s+config\s*=\s*\{([^}]*name\s*:\s*['"`]([^'"`]+)['"`][^}]*description\s*:\s*['"`]([^'"`]+)['"`][^}]*|[^}]*description\s*:\s*['"`]([^'"`]+)['"`][^}]*name\s*:\s*['"`]([^'"`]+)['"`][^}]*)\}/s;

    const match = code.match(configPattern);

    if (!match) {
      return null;
    }

    // Extract name and description (could be in either order)
    const name = match[2] || match[5];
    const description = match[3] || match[4];

    if (!name) {
      return null;
    }

    const config: PluginConfig = {
      name,
      description: description || 'No description provided',
    };

    // Try to extract optional version
    const versionMatch = code.match(/version\s*:\s*['"`]([^'"`]+)['"`]/);
    if (versionMatch) {
      config.version = versionMatch[1];
    }

    // Try to extract optional author
    const authorMatch = code.match(/author\s*:\s*['"`]([^'"`]+)['"`]/);
    if (authorMatch) {
      config.author = authorMatch[1];
    }

    return config;
  } catch (error) {
    logger.error('[extractConfig] Failed to extract plugin config:', error);
    return null;
  }
}

// Export types
export type { PluginConfig, RequestPermission };

// Re-export LogLevel for consumers
export { LogLevel } from '@tlsn/common';

// Default export
export default Host;
