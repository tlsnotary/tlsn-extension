import browser from 'webextension-polyfill';
import { logger } from '@tlsn/common';

export interface PluginConfig {
  name: string;
  description: string;
  version?: string;
  author?: string;
}

interface PendingConfirmation {
  requestId: string;
  resolve: (allowed: boolean) => void;
  reject: (error: Error) => void;
  windowId?: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

/**
 * Manages plugin execution confirmation popups.
 * Handles opening confirmation windows, tracking pending confirmations,
 * and processing user responses.
 */
export class ConfirmationManager {
  private pendingConfirmations: Map<string, PendingConfirmation> = new Map();
  private currentPopupWindowId: number | null = null;

  // Confirmation timeout in milliseconds (60 seconds)
  private readonly CONFIRMATION_TIMEOUT_MS = 60 * 1000;

  // Popup window dimensions
  private readonly POPUP_WIDTH = 600;
  private readonly POPUP_HEIGHT = 400;

  constructor() {
    // Listen for window removal to handle popup close
    browser.windows.onRemoved.addListener(this.handleWindowRemoved.bind(this));
  }

  /**
   * Request confirmation from the user for plugin execution.
   * Opens a popup window displaying plugin details and waits for user response.
   *
   * @param config - Plugin configuration (can be null for unknown plugins)
   * @param requestId - Unique ID to correlate the confirmation request
   * @returns Promise that resolves to true (allowed) or false (denied)
   */
  async requestConfirmation(
    config: PluginConfig | null,
    requestId: string,
  ): Promise<boolean> {
    // Check if there's already a pending confirmation
    if (this.pendingConfirmations.size > 0) {
      logger.warn(
        '[ConfirmationManager] Another confirmation is already pending, rejecting new request',
      );
      throw new Error('Another plugin confirmation is already in progress');
    }

    // Build URL with plugin info as query params
    const popupUrl = this.buildPopupUrl(config, requestId);

    return new Promise<boolean>(async (resolve, reject) => {
      try {
        // Create the confirmation popup window
        const window = await browser.windows.create({
          url: popupUrl,
          type: 'popup',
          width: this.POPUP_WIDTH,
          height: this.POPUP_HEIGHT,
          focused: true,
        });

        if (!window.id) {
          throw new Error('Failed to create confirmation popup window');
        }

        this.currentPopupWindowId = window.id;

        // Set up timeout
        const timeoutId = setTimeout(() => {
          const pending = this.pendingConfirmations.get(requestId);
          if (pending) {
            logger.debug('[ConfirmationManager] Confirmation timed out');
            this.cleanup(requestId);
            resolve(false); // Treat timeout as denial
          }
        }, this.CONFIRMATION_TIMEOUT_MS);

        // Store pending confirmation
        this.pendingConfirmations.set(requestId, {
          requestId,
          resolve,
          reject,
          windowId: window.id,
          timeoutId,
        });

        logger.debug(
          `[ConfirmationManager] Confirmation popup opened: ${window.id} for request: ${requestId}`,
        );
      } catch (error) {
        logger.error(
          '[ConfirmationManager] Failed to open confirmation popup:',
          error,
        );
        reject(error);
      }
    });
  }

  /**
   * Handle confirmation response from the popup.
   * Called when the popup sends a PLUGIN_CONFIRM_RESPONSE message.
   *
   * @param requestId - The request ID to match
   * @param allowed - Whether the user allowed execution
   */
  handleConfirmationResponse(requestId: string, allowed: boolean): void {
    const pending = this.pendingConfirmations.get(requestId);
    if (!pending) {
      logger.warn(
        `[ConfirmationManager] No pending confirmation found for request: ${requestId}`,
      );
      return;
    }

    logger.debug(
      `[ConfirmationManager] Received response for ${requestId}: ${allowed ? 'allowed' : 'denied'}`,
    );

    // Resolve the promise
    pending.resolve(allowed);

    // Close popup window if still open
    if (pending.windowId) {
      browser.windows.remove(pending.windowId).catch(() => {
        // Ignore errors if window already closed
      });
    }

    // Cleanup
    this.cleanup(requestId);
  }

  /**
   * Handle window removal event.
   * If the confirmation popup is closed without a response, treat it as denial.
   */
  private handleWindowRemoved(windowId: number): void {
    if (windowId !== this.currentPopupWindowId) {
      return;
    }

    logger.debug('[ConfirmationManager] Confirmation popup window closed');

    // Find and resolve any pending confirmation for this window
    for (const [requestId, pending] of this.pendingConfirmations.entries()) {
      if (pending.windowId === windowId) {
        logger.debug(
          `[ConfirmationManager] Treating window close as denial for request: ${requestId}`,
        );
        pending.resolve(false); // Treat close as denial
        this.cleanup(requestId);
        break;
      }
    }

    this.currentPopupWindowId = null;
  }

  /**
   * Build the popup URL with plugin info as query parameters.
   */
  private buildPopupUrl(
    config: PluginConfig | null,
    requestId: string,
  ): string {
    const baseUrl = browser.runtime.getURL('confirmPopup.html');
    const params = new URLSearchParams();

    params.set('requestId', requestId);

    if (config) {
      params.set('name', encodeURIComponent(config.name));
      params.set('description', encodeURIComponent(config.description));

      if (config.version) {
        params.set('version', encodeURIComponent(config.version));
      }

      if (config.author) {
        params.set('author', encodeURIComponent(config.author));
      }
    }

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Clean up a pending confirmation.
   */
  private cleanup(requestId: string): void {
    const pending = this.pendingConfirmations.get(requestId);
    if (pending?.timeoutId) {
      clearTimeout(pending.timeoutId);
    }
    this.pendingConfirmations.delete(requestId);

    if (this.pendingConfirmations.size === 0) {
      this.currentPopupWindowId = null;
    }
  }

  /**
   * Check if there's a pending confirmation.
   */
  hasPendingConfirmation(): boolean {
    return this.pendingConfirmations.size > 0;
  }
}

// Export singleton instance
export const confirmationManager = new ConfirmationManager();
