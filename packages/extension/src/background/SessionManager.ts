import Host from '../../../plugin-sdk/src/index';
import { v4 as uuidv4 } from 'uuid';

type SessionState = {
  id: string;
  pluginUrl: string;
  plugin?: string;
};

export class SessionManager {
  private host: Host;
  private sessions: Map<string, SessionState> = new Map();

  constructor() {
    this.host = new Host();
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
  openWindow = async (
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
    const chromeRuntime = (global as any).chrome?.runtime;
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

  async executePlugin(code: string): Promise<unknown> {
    const result = await this.host.run(code, {
      openWindow: this.openWindow,
    });
    return result;
  }

  startSession(pluginUrl: string): void {
    const uuid = uuidv4();
    this.sessions.set(uuid, { id: uuid, pluginUrl });
  }
}
