/**
 * Type definitions for WindowManager
 *
 * These types define the core data structures for managing multiple
 * browser windows with request interception and TLSN overlay functionality.
 */

/**
 * Configuration for registering a new window with the WindowManager
 */
export interface WindowRegistration {
  /** Chrome window ID */
  id: number;

  /** Primary tab ID within the window */
  tabId: number;

  /** Target URL for the window */
  url: string;

  /** Whether to show the TLSN overlay on creation (default: true) */
  showOverlay?: boolean;
}

/**
 * An intercepted HTTP request captured by the webRequest API
 */
export interface InterceptedRequest {
  /** Unique request ID from webRequest API */
  id: string;

  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  method: string;

  /** Full request URL */
  url: string;

  /** Unix timestamp (milliseconds) when request was intercepted */
  timestamp: number;

  /** Tab ID where the request originated */
  tabId: number;
}

/**
 * A managed browser window tracked by WindowManager
 */
export interface ManagedWindow {
  /** Chrome window ID */
  id: number;

  /** Internal unique identifier (UUID v4) */
  uuid: string;

  /** Primary tab ID */
  tabId: number;

  /** Current or initial URL */
  url: string;

  /** Creation timestamp */
  createdAt: Date;

  /** Array of intercepted HTTP requests for this window */
  requests: InterceptedRequest[];

  /** Whether the TLSN overlay is currently visible */
  overlayVisible: boolean;
}

/**
 * WindowManager interface defining all window management operations
 */
export interface IWindowManager {
  /**
   * Register a new window with the manager
   * @param config - Window registration configuration
   * @returns The created ManagedWindow object
   */
  registerWindow(config: WindowRegistration): Promise<ManagedWindow>;

  /**
   * Close and cleanup a window
   * @param windowId - Chrome window ID
   */
  closeWindow(windowId: number): Promise<void>;

  /**
   * Get a managed window by ID
   * @param windowId - Chrome window ID
   * @returns The ManagedWindow or undefined if not found
   */
  getWindow(windowId: number): ManagedWindow | undefined;

  /**
   * Get a managed window by tab ID
   * @param tabId - Chrome tab ID
   * @returns The ManagedWindow or undefined if not found
   */
  getWindowByTabId(tabId: number): ManagedWindow | undefined;

  /**
   * Get all managed windows
   * @returns Map of window IDs to ManagedWindow objects
   */
  getAllWindows(): Map<number, ManagedWindow>;

  /**
   * Add an intercepted request to a window
   * @param windowId - Chrome window ID
   * @param request - The intercepted request to add
   */
  addRequest(windowId: number, request: InterceptedRequest): void;

  /**
   * Get all requests for a window
   * @param windowId - Chrome window ID
   * @returns Array of intercepted requests
   */
  getWindowRequests(windowId: number): InterceptedRequest[];

  /**
   * Show the TLSN overlay in a window
   * @param windowId - Chrome window ID
   */
  showOverlay(windowId: number): Promise<void>;

  /**
   * Hide the TLSN overlay in a window
   * @param windowId - Chrome window ID
   */
  hideOverlay(windowId: number): Promise<void>;

  /**
   * Check if overlay is visible in a window
   * @param windowId - Chrome window ID
   * @returns true if overlay is visible, false otherwise
   */
  isOverlayVisible(windowId: number): boolean;

  /**
   * Cleanup windows that are no longer valid
   * Removes windows from tracking if they've been closed in the browser
   */
  cleanupInvalidWindows(): Promise<void>;
}