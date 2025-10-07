import Host from '../../../plugin-sdk/src';
import { v4 as uuidv4 } from 'uuid';
import {
  InterceptedRequest,
  InterceptedRequestHeader,
} from '../types/window-manager';
import deepEqual from 'fast-deep-equal';

type SessionState = {
  id: string;
  pluginUrl: string;
  plugin: string;
  requests?: InterceptedRequest[];
  headers?: InterceptedRequestHeader[];
  windowId?: number;
  context: {
    [functionName: string]: {
      effects: any[][];
      selectors: any[][];
    };
  };
  currentContext: string;
  sandbox: {
    eval: (code: string) => Promise<unknown>;
    dispose: () => void;
  };
  main: () => any;
};

type DomOptions = {
  className?: string;
  id?: string;
  style?: { [key: string]: string };
  onclick?: string;
};

type DomFn = (param1?: DomOptions | DomJson[], children?: DomJson[]) => DomJson;

export type DomJson =
  | {
      type: 'div' | 'button';
      options: DomOptions;
      children: DomJson[];
    }
  | string;

export class SessionManager {
  private host: Host;
  private sessions: Map<string, SessionState> = new Map();

  constructor() {
    this.host = new Host();
  }

  async executePlugin(code: string): Promise<unknown> {
    const uuid = uuidv4();

    const context: {
      [functionName: string]: {
        effects: any[][];
        selectors: any[][];
      };
    } = {};

    const sandbox = await this.host.createEvalCode({
      div: this.createDomJson.bind(this, 'div'),
      button: this.createDomJson.bind(this, 'button'),
      openWindow: this.makeOpenWindow(uuid),
      useEffect: this.makeUseEffect(uuid, context),
      useRequests: this.makeUseRequests(uuid, context),
      useHeaders: this.makeUseHeaders(uuid, context),
    });

    const exportedCode = await sandbox.eval(`
const div = env.div;
const button = env.button;
const openWindow = env.openWindow;
const useEffect = env.useEffect;
const useRequests = env.useRequests;
const useHeaders = env.useHeaders;
${code};
`);

    const { main: mainFn, config, ...args } = exportedCode;

    if (typeof mainFn !== 'function') {
      throw new Error('Main function not found');
    }

    const main = () => {
      try {
        this.updateSession(uuid, {
          currentContext: 'main',
        });

        let result = mainFn();
        const lastSelectors =
          this.sessions.get(uuid)?.context['main']?.selectors;
        const selectors = context['main']?.selectors;

        if (deepEqual(lastSelectors, selectors)) {
          result = null;
        }

        this.updateSession(uuid, {
          context: {
            ...this.sessions.get(uuid)?.context,
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
          const chromeRuntime = (
            global as unknown as { chrome?: { runtime?: any } }
          ).chrome?.runtime;
          if (!chromeRuntime?.sendMessage) {
            throw new Error('Chrome runtime not available');
          }

          if (this.sessions.get(uuid)?.windowId) {
            chromeRuntime.sendMessage({
              type: 'RENDER_PLUGIN_UI',
              json: result,
              windowId: this.sessions.get(uuid)?.windowId,
            });
          }
        }

        return result;
      } catch (error) {
        console.error('Main function error:', error);
        sandbox.dispose();
        return null;
      }
    };

    this.sessions.set(uuid, {
      id: uuid,
      plugin: code,
      pluginUrl: '',
      context: {},
      currentContext: '',
      sandbox,
      main: main,
    });

    return main();
  }

  updateSession(
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
    const session = this.sessions.get(uuid);
    if (!session) {
      throw new Error('Session not found');
    }
    this.sessions.set(uuid, { ...session, ...params });
  }

  startSession(_pluginUrl: string): void {
    // Reserved for future use
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
      const session = this.sessions.get(uuid);
      if (!session) {
        throw new Error('Session not found');
      }
      const functionName = session.currentContext;
      context[functionName] = context[functionName] || {
        effects: [],
        selectors: [],
      };
      const effects = context[functionName].effects;
      const lastDeps = session.context[functionName]?.effects[effects.length];
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
    return (
      filterFn: (requests: InterceptedRequest[]) => InterceptedRequest[],
    ) => {
      const session = this.sessions.get(uuid);
      if (!session) {
        throw new Error('Session not found');
      }
      const functionName = session.currentContext;
      context[functionName] = context[functionName] || {
        effects: [],
        selectors: [],
      };
      const selectors = context[functionName].selectors;
      const result = filterFn(session.requests || []);
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
    return (
      filterFn: (
        headers: InterceptedRequestHeader[],
      ) => InterceptedRequestHeader[],
    ) => {
      const session = this.sessions.get(uuid);
      if (!session) {
        throw new Error('Session not found');
      }
      const functionName = session.currentContext;
      context[functionName] = context[functionName] || {
        effects: [],
        selectors: [],
      };
      const selectors = context[functionName].selectors;
      const result = filterFn(session.headers || []);
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
    (uuid: string) =>
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

      // Access chrome runtime (available in offscreen document)
      const chromeRuntime = (
        global as unknown as { chrome?: { runtime?: any } }
      ).chrome?.runtime;
      if (!chromeRuntime?.sendMessage) {
        throw new Error('Chrome runtime not available');
      }

      try {
        const response = await chromeRuntime.sendMessage({
          type: 'OPEN_WINDOW',
          url,
          width: options?.width,
          height: options?.height,
          showOverlay: options?.showOverlay,
        });

        // Check if response indicates an error
        if (response?.type === 'WINDOW_ERROR') {
          throw new Error(
            response.payload?.details ||
              response.payload?.error ||
              'Failed to open window',
          );
        }

        // Return window info from successful response
        if (response?.type === 'WINDOW_OPENED' && response.payload) {
          this.updateSession(uuid, {
            windowId: response.payload.windowId,
          });

          const onMessage = (message: any) => {
            if (message.type === 'REQUEST_INTERCEPTED') {
              const request = message.request;
              const session = this.sessions.get(uuid);
              if (!session) {
                throw new Error('Session not found');
              }
              this.updateSession(uuid, {
                requests: [...(session.requests || []), request],
              });
              session.main();
            }

            if (message.type === 'HEADER_INTERCEPTED') {
              const header = message.header;
              const session = this.sessions.get(uuid);
              if (!session) {
                throw new Error('Session not found');
              }
              this.updateSession(uuid, {
                headers: [...(session.headers || []), header],
              });
              session.main();
            }

            if (message.type === 'PLUGIN_UI_CLICK') {
              console.log('PLUGIN_UI_CLICK', message);
              const session = this.sessions.get(uuid);
              if (!session) {
                throw new Error('Session not found');
              }
            }

            if (message.type === 'WINDOW_CLOSED') {
              chromeRuntime.onMessage.removeListener(onMessage);
            }
          };

          chromeRuntime.onMessage.addListener(onMessage);

          return {
            windowId: response.payload.windowId,
            uuid: response.payload.uuid,
            tabId: response.payload.tabId,
          };
        }

        throw new Error('Invalid response from background script');
      } catch (error) {
        console.error('[SessionManager] Failed to open window:', error);
        throw error;
      }
    };
}
