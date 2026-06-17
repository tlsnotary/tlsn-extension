/**
 * Type definitions for extension message passing.
 *
 * Each entry point handles a subset of these messages via
 * browser.runtime.onMessage / sendMessage.
 */

import type { DomJson } from '@tlsn/plugin-sdk';

/**
 * Controls how reveal approvals are handled during a plugin execution.
 * - `'manual'`      — user approves each `prove()` call before data is sent
 * - `'all-session'` — all reveals in this session are auto-approved
 * - `'rejected'`    — user denied the plugin; it does not run
 */
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
  | { type: 'TO_BG_RE_RENDER_PLUGIN_UI'; windowId: number }
  // Relay: page→extension inbound MPC bytes, and offscreen→tab outbound.
  | { type: 'RELAY_IN'; requestId: string; data: string }
  | { type: 'RELAY_OUT'; requestId: string; data: string }
  | { type: 'RELAY_CLOSED'; requestId: string };

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
  | { type: 'RENDER_PLUGIN_UI'; json: DomJson; windowId: number }
  | { type: 'RELAY_OUT'; requestId: string; data: string };

/** Messages handled by the Offscreen document */
export type OffscreenMessage =
  | { type: 'PROCESS_DATA' }
  | {
      type: 'EXEC_CODE_OFFSCREEN';
      code: string;
      requestId?: string;
      sessionData?: Record<string, unknown>;
    }
  | { type: 'GET_PLUGIN_STATS_OFFSCREEN'; code: string; pageOrigin: string }
  // Forwarded by the background (distinct type so the offscreen handles each
  // inbound chunk exactly once — a content script's runtime.sendMessage is also
  // broadcast directly to the offscreen, which would otherwise double-deliver).
  | { type: 'RELAY_DELIVER'; data: string }
  | { type: 'RELAY_DELIVER_CLOSED' };

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
