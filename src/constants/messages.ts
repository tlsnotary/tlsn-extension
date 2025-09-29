/**
 * Message type constants for extension communication
 *
 * Defines all message types used for communication between:
 * - Page scripts → Content scripts → Background script
 * - Background script → Content scripts
 */

/**
 * Legacy message types (from existing implementation)
 */
export const PING = 'PING';
export const PONG = 'PONG';
export const CONTENT_SCRIPT_READY = 'CONTENT_SCRIPT_READY';
export const GET_PAGE_INFO = 'GET_PAGE_INFO';

/**
 * TLSN Content Script Messages (legacy)
 */
export const TLSN_CONTENT_SCRIPT_MESSAGE = 'TLSN_CONTENT_SCRIPT_MESSAGE';
export const TLSN_CONTENT_TO_EXTENSION = 'TLSN_CONTENT_TO_EXTENSION';

/**
 * Window Management Messages
 */

/**
 * Sent from content script to background to request opening a new window
 *
 * Payload: { url: string, width?: number, height?: number, showOverlay?: boolean }
 */
export const OPEN_WINDOW = 'OPEN_WINDOW';

/**
 * Response from background when window is successfully opened
 *
 * Payload: { windowId: number, uuid: string, tabId: number }
 */
export const WINDOW_OPENED = 'WINDOW_OPENED';

/**
 * Response from background when window opening fails
 *
 * Payload: { error: string, details?: string }
 */
export const WINDOW_ERROR = 'WINDOW_ERROR';

/**
 * Overlay Control Messages
 */

/**
 * Sent from background to content script to show TLSN overlay
 *
 * Payload: { requests: InterceptedRequest[] }
 */
export const SHOW_TLSN_OVERLAY = 'SHOW_TLSN_OVERLAY';

/**
 * Sent from background to content script to update overlay with new requests
 *
 * Payload: { requests: InterceptedRequest[] }
 */
export const UPDATE_TLSN_REQUESTS = 'UPDATE_TLSN_REQUESTS';

/**
 * Sent from background to content script to hide TLSN overlay
 *
 * Payload: none
 */
export const HIDE_TLSN_OVERLAY = 'HIDE_TLSN_OVERLAY';

/**
 * Type definitions for message payloads
 */

export interface OpenWindowPayload {
  url: string;
  width?: number;
  height?: number;
  showOverlay?: boolean;
}

export interface WindowOpenedPayload {
  windowId: number;
  uuid: string;
  tabId: number;
}

export interface WindowErrorPayload {
  error: string;
  details?: string;
}

export interface OverlayRequestsPayload {
  requests: Array<{
    id: string;
    method: string;
    url: string;
    timestamp: number;
    tabId: number;
  }>;
}

/**
 * Message wrapper types
 */

export interface OpenWindowMessage {
  type: typeof OPEN_WINDOW;
  url: string;
  width?: number;
  height?: number;
  showOverlay?: boolean;
}

export interface WindowOpenedMessage {
  type: typeof WINDOW_OPENED;
  payload: WindowOpenedPayload;
}

export interface WindowErrorMessage {
  type: typeof WINDOW_ERROR;
  payload: WindowErrorPayload;
}

export interface ShowOverlayMessage {
  type: typeof SHOW_TLSN_OVERLAY;
  requests: OverlayRequestsPayload['requests'];
}

export interface UpdateOverlayMessage {
  type: typeof UPDATE_TLSN_REQUESTS;
  requests: OverlayRequestsPayload['requests'];
}

export interface HideOverlayMessage {
  type: typeof HIDE_TLSN_OVERLAY;
}
