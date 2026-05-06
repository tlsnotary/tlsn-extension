/**
 * Type definitions for extension message passing.
 *
 * Each entry point handles a subset of these messages via
 * browser.runtime.onMessage / sendMessage.
 */

import type { DomJson } from '@tlsn/plugin-sdk';

export type ApprovalMode = 'manual' | 'all-session' | 'rejected';

// ---------------------------------------------------------------------------
// Incoming messages (received by onMessage listeners)
// ---------------------------------------------------------------------------

/** Messages handled by the Background service worker */
export type BackgroundMessage =
  | { type: 'CONTENT_SCRIPT_READY' }
  | { type: 'PING' }
  | { type: 'RENDER_PLUGIN_UI'; json: DomJson; windowId: number }
  | { type: 'GET_PLUGIN_CODE'; requestId: string }
  | { type: 'PLUGIN_CONFIRM_RESPONSE'; requestId: string; mode: ApprovalMode }
  | {
      type: 'PROVE_PROGRESS';
      requestId: string;
      step: string;
      progress: number;
      message: string;
      source: string;
    }
  | {
      type: 'EXEC_CODE';
      code: string;
      requestId: string;
      sessionData?: Record<string, unknown>;
      pageOrigin?: string;
    }
  | { type: 'CLOSE_WINDOW'; windowId: number }
  | {
      type: 'OPEN_WINDOW';
      url: string;
      width?: number;
      height?: number;
      showOverlay?: boolean;
    }
  | { type: 'TO_BG_RE_RENDER_PLUGIN_UI'; windowId: number };

/** Messages handled by the Content script */
export type ContentMessage =
  | { type: 'OFFSCREEN_LOG'; level: string; message: string }
  | {
      type: 'PROVE_PROGRESS';
      requestId: string;
      step: string;
      progress: number;
      message: string;
      source: string;
    }
  | { type: 'GET_PAGE_INFO' }
  | { type: 'RENDER_PLUGIN_UI'; json: DomJson; windowId: number };

/** Messages handled by the Offscreen document */
export type OffscreenMessage =
  | { type: 'PROCESS_DATA' }
  | { type: 'EXTRACT_CONFIG'; code: string }
  | {
      type: 'EXEC_CODE_OFFSCREEN';
      code: string;
      requestId?: string;
      sessionData?: Record<string, unknown>;
    }
  | { type: 'GET_PLUGIN_STATS_OFFSCREEN'; code: string; pageOrigin: string };

// ---------------------------------------------------------------------------
// Responses returned from sendMessage calls
// ---------------------------------------------------------------------------

export interface ExecCodeResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  requestId?: string;
}

export interface PluginCodeResponse {
  code: string | null;
}
