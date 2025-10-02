import Host from '../../../plugin-sdk/src';
import { v4 as uuidv4 } from 'uuid';
import { InterceptedRequest } from '../types/window-manager';

type SessionState = {
  id: string;
  pluginUrl: string;
  plugin: string;
  requests?: InterceptedRequest[];
  windowId?: number;
  sandbox: {
    eval: (code: string) => Promise<any>;
    dispose: () => void;
  };
};

export class SessionManager {
  private host: Host;
  private sessions: Map<string, SessionState> = new Map();

  constructor() {
    this.host = new Host();
  }

  async executePlugin(code: string): Promise<unknown> {
    const uuid = uuidv4();

    const sandbox = await this.host.createEvalCode({
      openWindow: this.makeOpenWindow(uuid),
    });

    this.sessions.set(uuid, {
      id: uuid,
      plugin: code,
      pluginUrl: '',
      sandbox,
    });

    try {
      const result = await sandbox.eval(code);
      return result;
    } catch (error) {
      // Clean up on error
      sandbox.dispose();
      this.sessions.delete(uuid);
      throw error;
    }
  }

  disposeSession(uuid: string): void {
    const session = this.sessions.get(uuid);
    if (session?.sandbox.dispose) {
      session.sandbox.dispose();
    }
    this.sessions.delete(uuid);
  }

  updateSession(
    uuid: string,
    params: {
      windowId?: number;
      plugin?: string;
      requests?: InterceptedRequest[];
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
