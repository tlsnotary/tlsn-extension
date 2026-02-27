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
  InterceptedRequestHeader,
} from '../types/window-manager';
import {
  MAX_MANAGED_WINDOWS,
  MAX_REQUESTS_PER_WINDOW,
  OVERLAY_RETRY_DELAY_MS,
  MAX_OVERLAY_RETRY_ATTEMPTS,
  REQUEST_BATCH_INTERVAL_MS,
  REQUEST_BATCH_MAX_SIZE,
} from '../constants/limits';
import { logger } from '@tlsn/common';

/**
 * Helper function to convert ArrayBuffers to number arrays for JSON serialization
 * This is needed because Chrome's webRequest API returns ArrayBuffers in requestBody.raw[].bytes
 * which cannot be JSON stringified
 */
function convertArrayBuffersToArrays(obj: any): any {
  // Handle null/undefined
  if (obj == null) {
    return obj;
  }

  // Check for ArrayBuffer
  if (obj instanceof ArrayBuffer || obj.constructor?.name === 'ArrayBuffer') {
    return Array.from(new Uint8Array(obj));
  }

  // Check for typed arrays (Uint8Array, Int8Array, etc.)
  if (ArrayBuffer.isView(obj)) {
    return Array.from(obj as any);
  }

  // Handle regular arrays
  if (Array.isArray(obj)) {
    return obj.map(convertArrayBuffersToArrays);
  }

  // Handle objects (but not Date, RegExp, etc.)
  if (typeof obj === 'object' && obj.constructor === Object) {
    const converted: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        converted[key] = convertArrayBuffersToArrays(obj[key]);
      }
    }
    return converted;
  }

  return obj;
}

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

  /** Pending request batches per window */
  private requestBatches: Map<
    number,
    {
      requests: InterceptedRequest[];
      timer: ReturnType<typeof setTimeout> | null;
    }
  > = new Map();

  /** Pending header batches per window */
  private headerBatches: Map<
    number,
    {
      headers: InterceptedRequestHeader[];
      timer: ReturnType<typeof setTimeout> | null;
    }
  > = new Map();
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
      logger.error(`[WindowManager] ${error}`);
      throw new Error(error);
    }

    const managedWindow: ManagedWindow = {
      id: config.id,
      uuid: uuidv4(),
      tabId: config.tabId,
      url: config.url,
      createdAt: new Date(),
      requests: [],
      headers: [],
      overlayVisible: false,
      pluginUIVisible: false,
      showOverlayWhenReady: config.showOverlay !== false, // Default: true
    };

    this.windows.set(config.id, managedWindow);

    logger.debug(
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
      logger.warn(
        `[WindowManager] Attempted to close non-existent window: ${windowId}`,
      );
      return;
    }

    // Hide overlay before closing
    if (window.overlayVisible) {
      await this.hideOverlay(windowId).catch((error) => {
        logger.warn(
          `[WindowManager] Failed to hide overlay for window ${windowId}:`,
          error,
        );
      });
    }

    // Remove from tracking
    this.windows.delete(windowId);
    this.clearBatchState(windowId);

    browser.windows.remove(windowId);

    browser.runtime.sendMessage({
      type: 'WINDOW_CLOSED',
      windowId,
    });

    logger.debug(
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
   *   logger.debug(`Window has ${window.requests.length} requests`);
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
   * logger.debug(`Managing ${allWindows.size} windows`);
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
      logger.error(
        `[WindowManager] Cannot add request to non-existent window: ${windowId}`,
      );
      return;
    }

    // Add timestamp if not provided
    if (!request.timestamp) {
      request.timestamp = Date.now();
    }

    // Convert ArrayBuffers to number arrays for JSON serialization
    const convertedRequest = convertArrayBuffersToArrays(
      request,
    ) as InterceptedRequest;

    window.requests.push(convertedRequest);

    this.enqueueRequest(windowId, convertedRequest);

    // Update overlay if visible
    if (window.overlayVisible) {
      this.updateOverlay(windowId).catch((error) => {
        logger.warn(
          `[WindowManager] Failed to update overlay for window ${windowId}:`,
          error,
        );
      });
    }

    // Enforce request limit per window to prevent unbounded memory growth
    if (window.requests.length > MAX_REQUESTS_PER_WINDOW) {
      const removed = window.requests.length - MAX_REQUESTS_PER_WINDOW;
      window.requests.splice(0, removed);
      logger.warn(
        `[WindowManager] Request limit reached for window ${windowId}. Removed ${removed} oldest request(s). Current: ${window.requests.length}/${MAX_REQUESTS_PER_WINDOW}`,
      );
    }
  }

  reRenderPluginUI(windowId: number): void {
    const window = this.windows.get(windowId);
    if (!window) {
      logger.error(
        `[WindowManager] Cannot re-render plugin UI for non-existent window: ${windowId}`,
      );
      return;
    }
    browser.runtime.sendMessage({
      type: 'RE_RENDER_PLUGIN_UI',
      windowId,
    });
  }

  addHeader(windowId: number, header: InterceptedRequestHeader): void {
    const window = this.windows.get(windowId);
    if (!window) {
      logger.error(
        `[WindowManager] Cannot add header to non-existent window: ${windowId}`,
      );
      return;
    }

    window.headers.push(header);

    this.enqueueHeader(windowId, header);

    // Enforce request limit per window to prevent unbounded memory growth
    if (window.headers.length > MAX_REQUESTS_PER_WINDOW) {
      const removed = window.headers.length - MAX_REQUESTS_PER_WINDOW;
      window.headers.splice(0, removed);
      logger.warn(
        `[WindowManager] Header limit reached for window ${windowId}. Removed ${removed} oldest request(s). Current: ${window.headers.length}/${MAX_REQUESTS_PER_WINDOW}`,
      );
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
   * logger.debug(`Window has ${requests.length} requests`);
   * ```
   */
  getWindowRequests(windowId: number): InterceptedRequest[] {
    const window = this.windows.get(windowId);
    return window?.requests || [];
  }

  getWindowHeaders(windowId: number): InterceptedRequestHeader[] {
    const window = this.windows.get(windowId);
    return window?.headers || [];
  }

  async showPluginUI(
    windowId: number,
    json: any,
    retryCount = 0,
  ): Promise<void> {
    const window = this.windows.get(windowId);
    if (!window) {
      logger.error(
        `[WindowManager] Cannot show plugin UI for non-existent window: ${windowId}`,
      );
      return;
    }

    try {
      await browser.tabs.sendMessage(window.tabId, {
        type: 'RENDER_PLUGIN_UI',
        json,
        windowId,
      });

      window.pluginUIVisible = true;
      logger.debug(`[WindowManager] Plugin UI shown for window ${windowId}`);
    } catch (error) {
      // Retry if content script not ready
      if (retryCount < MAX_OVERLAY_RETRY_ATTEMPTS) {
        logger.debug(
          `[WindowManager] Plugin UI display failed for window ${windowId}, retry ${retryCount + 1}/${MAX_OVERLAY_RETRY_ATTEMPTS} in ${OVERLAY_RETRY_DELAY_MS}ms`,
        );

        // Wait and retry
        await new Promise((resolve) =>
          setTimeout(resolve, OVERLAY_RETRY_DELAY_MS),
        );

        // Check if window still exists before retrying
        if (this.windows.has(windowId)) {
          return this.showPluginUI(windowId, json, retryCount + 1);
        } else {
          logger.warn(
            `[WindowManager] Window ${windowId} closed during retry, aborting plugin UI display`,
          );
        }
      } else {
        logger.warn(
          `[WindowManager] Failed to show plugin UI for window ${windowId} after ${MAX_OVERLAY_RETRY_ATTEMPTS} attempts:`,
          error,
        );
      }
    }
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
  async showOverlay(windowId: number, retryCount = 0): Promise<void> {
    const window = this.windows.get(windowId);
    if (!window) {
      logger.error(
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
      logger.debug(`[WindowManager] Overlay shown for window ${windowId}`);
    } catch (error) {
      // Retry if content script not ready
      if (retryCount < MAX_OVERLAY_RETRY_ATTEMPTS) {
        logger.debug(
          `[WindowManager] Overlay display failed for window ${windowId}, retry ${retryCount + 1}/${MAX_OVERLAY_RETRY_ATTEMPTS} in ${OVERLAY_RETRY_DELAY_MS}ms`,
        );

        // Wait and retry
        await new Promise((resolve) =>
          setTimeout(resolve, OVERLAY_RETRY_DELAY_MS),
        );

        // Check if window still exists before retrying
        if (this.windows.has(windowId)) {
          return this.showOverlay(windowId, retryCount + 1);
        } else {
          logger.warn(
            `[WindowManager] Window ${windowId} closed during retry, aborting overlay display`,
          );
        }
      } else {
        logger.warn(
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
      logger.error(
        `[WindowManager] Cannot hide overlay for non-existent window: ${windowId}`,
      );
      return;
    }

    try {
      await browser.tabs.sendMessage(window.tabId, {
        type: 'HIDE_TLSN_OVERLAY',
      });

      window.overlayVisible = false;
      logger.debug(`[WindowManager] Overlay hidden for window ${windowId}`);
    } catch (error) {
      logger.warn(
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
   *   logger.debug('Overlay is currently displayed');
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

      logger.debug(
        `[WindowManager] Overlay updated for window ${windowId} with ${window.requests.length} requests`,
      );
    } catch (error) {
      logger.warn(
        `[WindowManager] Failed to update overlay for window ${windowId}:`,
        error,
      );
    }
  }

  /**
   * Enqueue a request for batched emission.
   * First request for a window is sent immediately (leading edge).
   * Subsequent requests are accumulated and sent after REQUEST_BATCH_INTERVAL_MS.
   */
  private enqueueRequest(windowId: number, request: InterceptedRequest): void {
    let batch = this.requestBatches.get(windowId);

    if (!batch) {
      // First request — send immediately (leading edge), init batch state
      batch = { requests: [], timer: null };
      this.requestBatches.set(windowId, batch);

      browser.runtime.sendMessage({
        type: 'REQUEST_INTERCEPTED',
        request,
        windowId,
      });
      return;
    }

    batch.requests.push(request);

    if (batch.requests.length >= REQUEST_BATCH_MAX_SIZE) {
      this.flushRequestBatch(windowId);
      return;
    }

    if (batch.timer !== null) {
      clearTimeout(batch.timer);
    }
    batch.timer = setTimeout(() => {
      this.flushRequestBatch(windowId);
    }, REQUEST_BATCH_INTERVAL_MS);
  }

  private flushRequestBatch(windowId: number): void {
    const batch = this.requestBatches.get(windowId);
    if (!batch || batch.requests.length === 0) {
      if (batch && batch.timer !== null) {
        clearTimeout(batch.timer);
        batch.timer = null;
      }
      return;
    }

    const requests = batch.requests;
    batch.requests = [];

    if (batch.timer !== null) {
      clearTimeout(batch.timer);
      batch.timer = null;
    }

    if (requests.length === 1) {
      browser.runtime.sendMessage({
        type: 'REQUEST_INTERCEPTED',
        request: requests[0],
        windowId,
      });
    } else {
      browser.runtime.sendMessage({
        type: 'REQUESTS_BATCH',
        requests,
        windowId,
      });
    }
  }

  /**
   * Enqueue a header for batched emission.
   * Same leading-edge + trailing-edge pattern as requests.
   */
  private enqueueHeader(
    windowId: number,
    header: InterceptedRequestHeader,
  ): void {
    let batch = this.headerBatches.get(windowId);

    if (!batch) {
      batch = { headers: [], timer: null };
      this.headerBatches.set(windowId, batch);

      browser.runtime.sendMessage({
        type: 'HEADER_INTERCEPTED',
        header,
        windowId,
      });
      return;
    }

    batch.headers.push(header);

    if (batch.headers.length >= REQUEST_BATCH_MAX_SIZE) {
      this.flushHeaderBatch(windowId);
      return;
    }

    if (batch.timer !== null) {
      clearTimeout(batch.timer);
    }
    batch.timer = setTimeout(() => {
      this.flushHeaderBatch(windowId);
    }, REQUEST_BATCH_INTERVAL_MS);
  }

  private flushHeaderBatch(windowId: number): void {
    const batch = this.headerBatches.get(windowId);
    if (!batch || batch.headers.length === 0) {
      if (batch && batch.timer !== null) {
        clearTimeout(batch.timer);
        batch.timer = null;
      }
      return;
    }

    const headers = batch.headers;
    batch.headers = [];

    if (batch.timer !== null) {
      clearTimeout(batch.timer);
      batch.timer = null;
    }

    if (headers.length === 1) {
      browser.runtime.sendMessage({
        type: 'HEADER_INTERCEPTED',
        header: headers[0],
        windowId,
      });
    } else {
      browser.runtime.sendMessage({
        type: 'HEADERS_BATCH',
        headers,
        windowId,
      });
    }
  }

  /** Clear batch timers and state for a window */
  private clearBatchState(windowId: number): void {
    const reqBatch = this.requestBatches.get(windowId);
    if (reqBatch?.timer) clearTimeout(reqBatch.timer);
    this.requestBatches.delete(windowId);

    const hdrBatch = this.headerBatches.get(windowId);
    if (hdrBatch?.timer) clearTimeout(hdrBatch.timer);
    this.headerBatches.delete(windowId);
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
        this.clearBatchState(windowId);
        cleanedCount++;

        logger.debug(
          `[WindowManager] Cleaned up invalid window: ${window?.uuid} (ID: ${windowId})`,
        );
      }
    }

    if (cleanedCount > 0) {
      logger.debug(
        `[WindowManager] Cleanup complete: ${cleanedCount} window(s) removed`,
      );
    }
  }
}
