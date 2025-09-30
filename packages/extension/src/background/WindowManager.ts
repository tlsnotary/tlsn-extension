/**
 * WindowManager - Multi-window management for TLSNotary extension
 *
 * Manages multiple browser windows with request interception and overlay display.
 * Each window maintains its own state, request history, and overlay visibility.
 */

import { v4 as uuidv4 } from 'uuid';
import browser from 'webextension-polyfill';
import type {
  WindowRegistration,
  InterceptedRequest,
  ManagedWindow,
  IWindowManager,
} from '../types/window-manager';
import {
  MAX_MANAGED_WINDOWS,
  MAX_REQUESTS_PER_WINDOW,
  OVERLAY_RETRY_DELAY_MS,
  MAX_OVERLAY_RETRY_ATTEMPTS,
} from '../constants/limits';

/**
 * WindowManager implementation
 *
 * Provides centralized management for multiple browser windows with:
 * - Window lifecycle tracking (create, lookup, close)
 * - Request interception per window
 * - Overlay visibility control
 * - Automatic cleanup of closed windows
 */
export class WindowManager implements IWindowManager {
  /**
   * Internal storage for managed windows
   * Key: Chrome window ID
   * Value: ManagedWindow object
   */
  private windows: Map<number, ManagedWindow> = new Map();

  /**
   * Register a new window with the manager
   *
   * Creates a ManagedWindow object with UUID, initializes request tracking,
   * and optionally shows the TLSN overlay.
   *
   * @param config - Window registration configuration
   * @returns Promise resolving to the created ManagedWindow
   *
   * @example
   * ```typescript
   * const window = await windowManager.registerWindow({
   *   id: 123,
   *   tabId: 456,
   *   url: 'https://example.com',
   *   showOverlay: true
   * });
   * ```
   */
  async registerWindow(config: WindowRegistration): Promise<ManagedWindow> {
    // Check maximum window limit
    if (this.windows.size >= MAX_MANAGED_WINDOWS) {
      const error = `Maximum window limit reached (${MAX_MANAGED_WINDOWS}). Currently managing ${this.windows.size} windows. Please close some windows before opening new ones.`;
      console.error(`[WindowManager] ${error}`);
      throw new Error(error);
    }

    const managedWindow: ManagedWindow = {
      id: config.id,
      uuid: uuidv4(),
      tabId: config.tabId,
      url: config.url,
      createdAt: new Date(),
      requests: [],
      overlayVisible: false,
      showOverlayWhenReady: config.showOverlay !== false, // Default: true
    };

    this.windows.set(config.id, managedWindow);

    console.log(
      `[WindowManager] Window registered: ${managedWindow.uuid} (ID: ${managedWindow.id}, Tab: ${managedWindow.tabId}, showOverlayWhenReady: ${managedWindow.showOverlayWhenReady}) [${this.windows.size}/${MAX_MANAGED_WINDOWS}]`,
    );

    return managedWindow;
  }

  /**
   * Close and cleanup a window
   *
   * Hides the overlay if visible and removes the window from tracking.
   * Does nothing if the window is not found.
   *
   * @param windowId - Chrome window ID
   *
   * @example
   * ```typescript
   * await windowManager.closeWindow(123);
   * ```
   */
  async closeWindow(windowId: number): Promise<void> {
    const window = this.windows.get(windowId);
    if (!window) {
      console.warn(
        `[WindowManager] Attempted to close non-existent window: ${windowId}`,
      );
      return;
    }

    // Hide overlay before closing
    if (window.overlayVisible) {
      await this.hideOverlay(windowId).catch((error) => {
        console.warn(
          `[WindowManager] Failed to hide overlay for window ${windowId}:`,
          error,
        );
      });
    }

    // Remove from tracking
    this.windows.delete(windowId);

    console.log(
      `[WindowManager] Window closed: ${window.uuid} (ID: ${window.id})`,
    );
  }

  /**
   * Get a managed window by ID
   *
   * @param windowId - Chrome window ID
   * @returns The ManagedWindow or undefined if not found
   *
   * @example
   * ```typescript
   * const window = windowManager.getWindow(123);
   * if (window) {
   *   console.log(`Window has ${window.requests.length} requests`);
   * }
   * ```
   */
  getWindow(windowId: number): ManagedWindow | undefined {
    return this.windows.get(windowId);
  }

  /**
   * Get a managed window by tab ID
   *
   * Searches through all windows to find one containing the specified tab.
   * Useful for webRequest listeners that only provide tab IDs.
   *
   * @param tabId - Chrome tab ID
   * @returns The ManagedWindow or undefined if not found
   *
   * @example
   * ```typescript
   * const window = windowManager.getWindowByTabId(456);
   * if (window) {
   *   windowManager.addRequest(window.id, request);
   * }
   * ```
   */
  getWindowByTabId(tabId: number): ManagedWindow | undefined {
    for (const window of this.windows.values()) {
      if (window.tabId === tabId) {
        return window;
      }
    }
    return undefined;
  }

  /**
   * Get all managed windows
   *
   * @returns Map of window IDs to ManagedWindow objects (copy)
   *
   * @example
   * ```typescript
   * const allWindows = windowManager.getAllWindows();
   * console.log(`Managing ${allWindows.size} windows`);
   * ```
   */
  getAllWindows(): Map<number, ManagedWindow> {
    return new Map(this.windows);
  }

  /**
   * Add an intercepted request to a window
   *
   * Appends the request to the window's request array and updates the overlay
   * if it's currently visible. Logs an error if the window is not found.
   *
   * @param windowId - Chrome window ID
   * @param request - The intercepted request to add
   *
   * @example
   * ```typescript
   * windowManager.addRequest(123, {
   *   id: 'req-456',
   *   method: 'GET',
   *   url: 'https://example.com/api/data',
   *   timestamp: Date.now(),
   *   tabId: 456
   * });
   * ```
   */
  addRequest(windowId: number, request: InterceptedRequest): void {
    const window = this.windows.get(windowId);
    if (!window) {
      console.error(
        `[WindowManager] Cannot add request to non-existent window: ${windowId}`,
      );
      return;
    }

    // Add timestamp if not provided
    if (!request.timestamp) {
      request.timestamp = Date.now();
    }

    window.requests.push(request);

    // Enforce request limit per window to prevent unbounded memory growth
    if (window.requests.length > MAX_REQUESTS_PER_WINDOW) {
      const removed = window.requests.length - MAX_REQUESTS_PER_WINDOW;
      window.requests.splice(0, removed);
      console.warn(
        `[WindowManager] Request limit reached for window ${windowId}. Removed ${removed} oldest request(s). Current: ${window.requests.length}/${MAX_REQUESTS_PER_WINDOW}`,
      );
    }

    console.log(
      `[WindowManager] Request added to window ${windowId}: ${request.method} ${request.url}`,
    );

    // Update overlay if visible
    if (window.overlayVisible) {
      this.updateOverlay(windowId).catch((error) => {
        console.warn(
          `[WindowManager] Failed to update overlay for window ${windowId}:`,
          error,
        );
      });
    }
  }

  /**
   * Get all requests for a window
   *
   * @param windowId - Chrome window ID
   * @returns Array of intercepted requests (empty array if window not found)
   *
   * @example
   * ```typescript
   * const requests = windowManager.getWindowRequests(123);
   * console.log(`Window has ${requests.length} requests`);
   * ```
   */
  getWindowRequests(windowId: number): InterceptedRequest[] {
    const window = this.windows.get(windowId);
    return window?.requests || [];
  }

  /**
   * Show the TLSN overlay in a window
   *
   * Sends a message to the content script to display the overlay with
   * the current list of intercepted requests. Catches and logs errors
   * if the content script is not ready.
   *
   * @param windowId - Chrome window ID
   *
   * @example
   * ```typescript
   * await windowManager.showOverlay(123);
   * ```
   */
  async showOverlay(windowId: number, retryCount: number = 0): Promise<void> {
    const window = this.windows.get(windowId);
    if (!window) {
      console.error(
        `[WindowManager] Cannot show overlay for non-existent window: ${windowId}`,
      );
      return;
    }

    try {
      await browser.tabs.sendMessage(window.tabId, {
        type: 'SHOW_TLSN_OVERLAY',
        requests: window.requests,
      });

      window.overlayVisible = true;
      window.showOverlayWhenReady = false; // Clear the pending flag
      console.log(`[WindowManager] Overlay shown for window ${windowId}`);
    } catch (error) {
      // Retry if content script not ready
      if (retryCount < MAX_OVERLAY_RETRY_ATTEMPTS) {
        console.log(
          `[WindowManager] Overlay display failed for window ${windowId}, retry ${retryCount + 1}/${MAX_OVERLAY_RETRY_ATTEMPTS} in ${OVERLAY_RETRY_DELAY_MS}ms`,
        );

        // Wait and retry
        await new Promise((resolve) => setTimeout(resolve, OVERLAY_RETRY_DELAY_MS));

        // Check if window still exists before retrying
        if (this.windows.has(windowId)) {
          return this.showOverlay(windowId, retryCount + 1);
        } else {
          console.warn(
            `[WindowManager] Window ${windowId} closed during retry, aborting overlay display`,
          );
        }
      } else {
        console.warn(
          `[WindowManager] Failed to show overlay for window ${windowId} after ${MAX_OVERLAY_RETRY_ATTEMPTS} attempts:`,
          error,
        );
        // Keep showOverlayWhenReady=true so tabs.onUpdated can try again
      }
    }
  }

  /**
   * Hide the TLSN overlay in a window
   *
   * Sends a message to the content script to remove the overlay.
   * Catches and logs errors if the content script is not available.
   *
   * @param windowId - Chrome window ID
   *
   * @example
   * ```typescript
   * await windowManager.hideOverlay(123);
   * ```
   */
  async hideOverlay(windowId: number): Promise<void> {
    const window = this.windows.get(windowId);
    if (!window) {
      console.error(
        `[WindowManager] Cannot hide overlay for non-existent window: ${windowId}`,
      );
      return;
    }

    try {
      await browser.tabs.sendMessage(window.tabId, {
        type: 'HIDE_TLSN_OVERLAY',
      });

      window.overlayVisible = false;
      console.log(`[WindowManager] Overlay hidden for window ${windowId}`);
    } catch (error) {
      console.warn(
        `[WindowManager] Failed to hide overlay for window ${windowId}:`,
        error,
      );
      // Don't throw - window may already be closed
    }
  }

  /**
   * Check if overlay is visible in a window
   *
   * @param windowId - Chrome window ID
   * @returns true if overlay is visible, false otherwise
   *
   * @example
   * ```typescript
   * if (windowManager.isOverlayVisible(123)) {
   *   console.log('Overlay is currently displayed');
   * }
   * ```
   */
  isOverlayVisible(windowId: number): boolean {
    const window = this.windows.get(windowId);
    return window?.overlayVisible || false;
  }

  /**
   * Update overlay with current requests (private helper)
   *
   * Sends an UPDATE_TLSN_REQUESTS message to the content script.
   *
   * @param windowId - Chrome window ID
   */
  private async updateOverlay(windowId: number): Promise<void> {
    const window = this.windows.get(windowId);
    if (!window || !window.overlayVisible) {
      return;
    }

    try {
      await browser.tabs.sendMessage(window.tabId, {
        type: 'UPDATE_TLSN_REQUESTS',
        requests: window.requests,
      });

      console.log(
        `[WindowManager] Overlay updated for window ${windowId} with ${window.requests.length} requests`,
      );
    } catch (error) {
      console.warn(
        `[WindowManager] Failed to update overlay for window ${windowId}:`,
        error,
      );
    }
  }

  /**
   * Cleanup windows that are no longer valid
   *
   * Iterates through all tracked windows and removes any that have been
   * closed in the browser. This prevents memory leaks and stale state.
   *
   * Should be called periodically (e.g., every minute) or when handling
   * window events.
   *
   * @example
   * ```typescript
   * // Run cleanup every minute
   * setInterval(() => {
   *   windowManager.cleanupInvalidWindows();
   * }, 60000);
   * ```
   */
  async cleanupInvalidWindows(): Promise<void> {
    const windowIds = Array.from(this.windows.keys());
    let cleanedCount = 0;

    for (const windowId of windowIds) {
      try {
        // Check if window still exists in browser
        await browser.windows.get(windowId);
      } catch (error) {
        // Window no longer exists, clean it up
        const window = this.windows.get(windowId);
        this.windows.delete(windowId);
        cleanedCount++;

        console.log(
          `[WindowManager] Cleaned up invalid window: ${window?.uuid} (ID: ${windowId})`,
        );
      }
    }

    if (cleanedCount > 0) {
      console.log(
        `[WindowManager] Cleanup complete: ${cleanedCount} window(s) removed`,
      );
    }
  }
}
