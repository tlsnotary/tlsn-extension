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
  effects: any[][];
  selectors: any[][];
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
};

type DomFn = (param1?: DomOptions | DomJson[], children?: DomJson[]) => DomJson;

type DomJson = {
  type: 'overlay' | 'div' | 'button';
  options: DomOptions;
  children: DomJson[];
};

export class SessionManager {
  private host: Host;
  private sessions: Map<string, SessionState> = new Map();

  constructor() {
    this.host = new Host();
  }

  async executePlugin(code: string): Promise<unknown> {
    const uuid = uuidv4();

    const effects: any[][] = [];
    const selectors: any[][] = [];
    const sandbox = await this.host.createEvalCode({
      overlay: this.createDomJson.bind(this, 'overlay'),
      div: this.createDomJson.bind(this, 'div'),
      button: this.createDomJson.bind(this, 'button'),
      openWindow: this.makeOpenWindow(uuid),
      useEffect: this.makeUseEffect(uuid, effects),
      useRequests: this.makeUseRequests(uuid, selectors),
      useHeaders: this.makeUseHeaders(uuid, selectors),
    });

    const mainFn = await sandbox.eval(`
const overlay = env.overlay;
const div = env.div;
const button = env.button;
const openWindow = env.openWindow;
const useEffect = env.useEffect;
const useRequests = env.useRequests;
const useHeaders = env.useHeaders;
${code};
export default main;
`);

    if (typeof mainFn !== 'function') {
      throw new Error('Main function not found');
    }

    const main = () => {
      try {
        let result = mainFn();
        const lastSelectors = this.sessions.get(uuid)?.selectors;
        if (deepEqual(lastSelectors, selectors)) {
          result = null;
        }

        this.updateSession(uuid, {
          effects: JSON.parse(JSON.stringify(effects)),
          selectors: JSON.parse(JSON.stringify(selectors)),
        });

        effects.length = 0;
        selectors.length = 0;

        if (result) {
          console.log('Main function executed:', result);
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
      effects: [],
      selectors: [],
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
      effects?: any[][];
      selectors?: any[][];
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
    type: 'overlay' | 'div' | 'button',
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

  makeUseEffect = (uuid: string, effects: any[][]) => {
    return (effect: () => void, deps: any[]) => {
      const session = this.sessions.get(uuid);
      if (!session) {
        throw new Error('Session not found');
      }
      const lastDeps = session.effects[effects.length];
      effects.push(deps);
      if (deepEqual(lastDeps, deps)) {
        return;
      }
      effect();
    };
  };

  makeUseRequests = (uuid: string, selectors: any[][]) => {
    return (
      filterFn: (requests: InterceptedRequest[]) => InterceptedRequest[],
    ) => {
      const session = this.sessions.get(uuid);
      if (!session) {
        throw new Error('Session not found');
      }
      const result = filterFn(session.requests || []);
      selectors.push(result);
      return result;
    };
  };

  makeUseHeaders = (uuid: string, selectors: any[][]) => {
    return (
      filterFn: (
        headers: InterceptedRequestHeader[],
      ) => InterceptedRequestHeader[],
    ) => {
      const session = this.sessions.get(uuid);
      if (!session) {
        throw new Error('Session not found');
      }
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
