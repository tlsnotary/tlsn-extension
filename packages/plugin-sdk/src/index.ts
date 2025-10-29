/**
 * @tlsn/plugin-sdk
 *
 * SDK for developing and running TLSN WebAssembly plugins
 */

import { SandboxEvalCode, type SandboxOptions, loadQuickJs } from '@sebastianwessel/quickjs';
import variant from '@jitl/quickjs-ng-wasmfile-release-sync';
import { v4 as uuidv4 } from 'uuid';
import {
  DomJson,
  DomOptions,
  ExecutionContext,
  InterceptedRequest,
  InterceptedRequestHeader,
  OpenWindowResponse,
  WindowMessage,
} from './types';
import deepEqual from 'fast-deep-equal';

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
  private executionContexts: Map<string, ExecutionContext> = new Map();
  private onProve: (serverDns: string, verifierUrl: string) => Promise<string>;
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
    onProve: (serverDns: string, verifierUrl: string) => Promise<string>;
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
  }) {
    this.onProve = options.onProve;
    this.onRenderPluginUi = options.onRenderPluginUi;
    this.onCloseWindow = options.onCloseWindow;
    this.onOpenWindow = options.onOpenWindow;
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
    const context = this.executionContexts.get(uuid);
    if (!context) {
      throw new Error('Execution context not found');
    }
    this.executionContexts.set(uuid, { ...context, ...params });
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

    let doneResolve: (args?: any[]) => void;

    const donePromise = new Promise((resolve) => {
      doneResolve = resolve;
    });

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
    const sandbox = await this.createEvalCode({
      div: this.createDomJson.bind(this, 'div'),
      button: this.createDomJson.bind(this, 'button'),
      openWindow: this.makeOpenWindow(uuid, eventEmitter),
      useEffect: this.makeUseEffect(uuid, context),
      useRequests: this.makeUseRequests(uuid, context),
      useHeaders: this.makeUseHeaders(uuid, context),
      prove: this.onProve.bind(this),
      done: (args?: any[]) => {
        // Close the window if it exists
        const context = this.executionContexts.get(uuid);
        if (context?.windowId) {
          this.onCloseWindow(context.windowId);
        }
        doneResolve(args);
      },
    });

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

    const { main: mainFn, ...args } = exportedCode;

    if (typeof mainFn !== 'function') {
      throw new Error('Main function not found');
    }

    const callbacks: {
      [callbackName: string]: () => Promise<void>;
    } = {};

    for (const key in args) {
      if (typeof args[key] === 'function') {
        callbacks[key] = args[key];
      }
    }

    const main = () => {
      try {
        this.updateExecutionContext(uuid, {
          currentContext: 'main',
        });

        let result = mainFn();
        const lastSelectors = this.executionContexts.get(uuid)?.context['main']?.selectors;
        const selectors = context['main']?.selectors;

        if (deepEqual(lastSelectors, selectors)) {
          result = null;
        }

        this.updateExecutionContext(uuid, {
          currentContext: '',
          context: {
            ...this.executionContexts.get(uuid)?.context,
            main: {
              effects: JSON.parse(JSON.stringify(context['main']?.effects)),
              selectors: JSON.parse(JSON.stringify(context['main']?.selectors)),
            },
          },
        });

        if (context['main']) {
          context['main'].effects.length = 0;
          context['main'].selectors.length = 0;
        }

        if (result) {
          console.log('Main function executed:', result);

          if (this.executionContexts.get(uuid)?.windowId) {
            this.onRenderPluginUi(this.executionContexts.get(uuid)!.windowId!, result);
          }
        }

        return result;
      } catch (error) {
        console.error('Main function error:', error);
        sandbox.dispose();
        return null;
      }
    };

    this.executionContexts.set(uuid, {
      id: uuid,
      plugin: code,
      pluginUrl: '',
      context: {},
      currentContext: '',
      sandbox,
      main: main,
      callbacks: callbacks,
    });

    main();

    return donePromise;
  }

  createDomJson = (
    type: 'div' | 'button',
    param1: DomOptions | DomJson[] = {},
    param2: DomJson[] = [],
  ): DomJson => {
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
  };

  makeUseEffect = (
    uuid: string,
    context: {
      [functionName: string]: {
        effects: any[][];
        selectors: any[][];
      };
    },
  ) => {
    return (effect: () => void, deps: any[]) => {
      const executionContext = this.executionContexts.get(uuid);
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
  };

  makeUseRequests = (
    uuid: string,
    context: {
      [functionName: string]: {
        effects: any[][];
        selectors: any[][];
      };
    },
  ) => {
    return (filterFn: (requests: InterceptedRequest[]) => InterceptedRequest[]) => {
      const executionContext = this.executionContexts.get(uuid);
      if (!executionContext) {
        throw new Error('Execution context not found');
      }
      const functionName = executionContext.currentContext;
      context[functionName] = context[functionName] || {
        effects: [],
        selectors: [],
      };
      const selectors = context[functionName].selectors;
      const result = filterFn(executionContext.requests || []);
      selectors.push(result);
      return result;
    };
  };

  makeUseHeaders = (
    uuid: string,
    context: {
      [functionName: string]: {
        effects: any[][];
        selectors: any[][];
      };
    },
  ) => {
    return (filterFn: (headers: InterceptedRequestHeader[]) => InterceptedRequestHeader[]) => {
      const executionContext = this.executionContexts.get(uuid);
      if (!executionContext) {
        throw new Error('Execution context not found');
      }
      const functionName = executionContext.currentContext;
      context[functionName] = context[functionName] || {
        effects: [],
        selectors: [],
      };
      const selectors = context[functionName].selectors;
      const result = filterFn(executionContext.headers || []);
      selectors.push(result);
      return result;
    };
  };

  /**
   * Open a new browser window with the specified URL
   * This method sends a message to the background script to create a managed window
   * with request interception enabled.
   *
   * @param url - The URL to open in the new window
   * @param options - Optional window configuration
   * @returns Promise that resolves with window info or rejects with error
   */
  makeOpenWindow =
    (
      uuid: string,
      eventEmitter: {
        addListener: (listener: (message: WindowMessage) => void) => void;
        removeListener: (listener: (message: WindowMessage) => void) => void;
      },
    ) =>
    async (
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
        const response = await this.onOpenWindow(url, options);

        // Check if response indicates an error
        if (response?.type === 'WINDOW_ERROR') {
          throw new Error(
            response.payload?.details || response.payload?.error || 'Failed to open window',
          );
        }

        // Return window info from successful response
        if (response?.type === 'WINDOW_OPENED' && response.payload) {
          this.updateExecutionContext(uuid, {
            windowId: response.payload.windowId,
          });

          const onMessage = async (message: any) => {
            if (message.type === 'REQUEST_INTERCEPTED') {
              const request = message.request;
              const executionContext = this.executionContexts.get(uuid);
              if (!executionContext) {
                throw new Error('Execution context not found');
              }
              this.updateExecutionContext(uuid, {
                requests: [...(executionContext.requests || []), request],
              });
              executionContext.main();
            }

            if (message.type === 'HEADER_INTERCEPTED') {
              const header = message.header;
              const executionContext = this.executionContexts.get(uuid);
              if (!executionContext) {
                throw new Error('Execution context not found');
              }
              this.updateExecutionContext(uuid, {
                headers: [...(executionContext.headers || []), header],
              });
              executionContext.main();
            }

            if (message.type === 'PLUGIN_UI_CLICK') {
              console.log('PLUGIN_UI_CLICK', message);
              const executionContext = this.executionContexts.get(uuid);
              if (!executionContext) {
                throw new Error('Execution context not found');
              }
              const cb = executionContext.callbacks[message.onclick];

              if (cb) {
                this.updateExecutionContext(uuid, {
                  currentContext: message.onclick,
                });
                const result = await cb();
                this.updateExecutionContext(uuid, {
                  currentContext: '',
                });
                console.log('Callback result:', result);
              }
            }

            if (message.type === 'WINDOW_CLOSED') {
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
        console.error('[Host.makeOpenWindow] Failed to open window:', error);
        throw error;
      }
    };
}

// Default export
export default Host;
