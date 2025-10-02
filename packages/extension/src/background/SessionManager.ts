import Host from '../../../plugin-sdk/src';
import { v4 as uuidv4 } from 'uuid';
import { InterceptedRequest } from '../types/window-manager';
import deepEqual from 'fast-deep-equal';

type SessionState = {
  id: string;
  pluginUrl: string;
  plugin: string;
  requests?: InterceptedRequest[];
  windowId?: number;
  effects: any[][];
  selectors: any[][];
  sandbox: {
    eval: (code: string) => Promise<unknown>;
    dispose: () => void;
  };
  main: () => any;
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
      openWindow: this.makeOpenWindow(uuid),
      useEffect: this.makeUseEffect(uuid, effects),
      useRequests: this.makeUseRequests(uuid, selectors),
    });

    const mainFn = await sandbox.eval(code);

    if (typeof mainFn !== 'function') {
      throw new Error('Main function not found');
    }

    const main = () => {
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

          const onRequestIntercepted = (message: any) => {
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

            if (message.type === 'WINDOW_CLOSED') {
              chromeRuntime.onMessage.removeListener(onRequestIntercepted);
            }
          };

          chromeRuntime.onMessage.addListener(onRequestIntercepted);

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
