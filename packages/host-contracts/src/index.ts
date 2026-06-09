/**
 * @tlsn/host-contracts
 *
 * Platform-agnostic interfaces every TLSNotary host adapter implements.
 *
 * An adapter (e.g. @tlsn/host-cli, @tlsn/host-react-native, @tlsn/host-extension)
 * plugs platform-specific implementations of these contracts into
 * `@tlsn/plugin-sdk`'s `Host` class so plugin code can run unchanged across
 * platforms.
 */

import type {
  Handler,
  InterceptedRequest,
  InterceptedRequestHeader,
  PluginConfig,
  ProveProgressData,
  RevealRangeDescriptor,
} from '@tlsn/plugin-sdk';

export type { Handler, InterceptedRequest, InterceptedRequestHeader, PluginConfig, ProveProgressData, RevealRangeDescriptor };

export { translateHandler, translateHandlers } from './handler-translation.js';
export type { NativeHandler } from './handler-translation.js';

/** Returned by subscribe/listener APIs. Calling it removes the listener. */
export type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// Window management
// ---------------------------------------------------------------------------

/**
 * Opaque handle the adapter returns to identify a managed window/tab/page.
 * Adapters can stash platform-specific state inside; the plugin-sdk only
 * references the `id`.
 */
export interface WindowHandle {
  /** Stable id used as the `windowId` the plugin-sdk threads through callbacks. */
  readonly id: number;
  /** URL the window currently points at (may change on navigation). */
  readonly url: string;
}

export interface OpenWindowOptions {
  width?: number;
  height?: number;
  /** Browser-extension-only: whether to overlay the request list. Ignored elsewhere. */
  showOverlay?: boolean;
}

export interface WindowManager {
  open(url: string, opts?: OpenWindowOptions): Promise<WindowHandle>;
  close(handle: WindowHandle): Promise<void>;
  list(): WindowHandle[];
  onClose(handle: WindowHandle, cb: () => void): Unsubscribe;
}

// ---------------------------------------------------------------------------
// Request / header interception
// ---------------------------------------------------------------------------

export interface RequestInterceptor {
  /** Subscribe to request headers captured inside a managed window. */
  subscribe(handle: WindowHandle, cb: (h: InterceptedRequestHeader) => void): Unsubscribe;
  /** Optional: subscribe to full intercepted requests (with body). */
  subscribeRequests?(handle: WindowHandle, cb: (r: InterceptedRequest) => void): Unsubscribe;
}

// ---------------------------------------------------------------------------
// Prover client
// ---------------------------------------------------------------------------

export interface ProveRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface ProverOptions {
  verifierUrl: string;
  proxyUrl: string;
  maxRecvData?: number;
  maxSentData?: number;
  handlers: Handler[];
}

/**
 * Two-phase prove preparation (mobile uses this so the user can approve each
 * reveal byte-range before the proof is finalized). Returned by
 * `ProverClient.proveUntilReveal()`.
 */
export interface RevealPreparation {
  sessionId: string;
  /** Bytes that will be revealed per handler. */
  descriptors: RevealRangeDescriptor[];
  /** Raw response body the descriptors index into (for preview rendering). */
  response?: string;
}

export interface ProverClient {
  /**
   * One-shot prove. Adapters without per-reveal approval implement only this.
   */
  prove(req: ProveRequest, opts: ProverOptions, onProgress?: (p: ProveProgressData) => void): Promise<unknown>;

  /**
   * Two-phase prove: stops just before reveal so the approval UI can inspect
   * descriptors. Adapters that gate reveals (mobile) implement this pair.
   */
  proveUntilReveal?(
    req: ProveRequest,
    opts: ProverOptions,
    onProgress?: (p: ProveProgressData) => void,
  ): Promise<RevealPreparation>;

  proveFinalize?(sessionId: string, approved: boolean): Promise<unknown>;

  /** Adapters may expose a global progress channel separate from per-call onProgress. */
  onProgress?(cb: (p: ProveProgressData) => void): Unsubscribe;
}

// ---------------------------------------------------------------------------
// Plugin DomJson renderer
// ---------------------------------------------------------------------------

/**
 * The plugin-sdk's DomJson is a recursive tag/props/children tree. Adapters
 * convert it to whatever the platform speaks (HTML DOM, React Native
 * primitives, terminal print, …). Typed as `unknown` here because each
 * adapter wants its own narrowing.
 */
export type PluginDomJson = unknown;

export interface PluginRenderer {
  render(handle: WindowHandle, dom: PluginDomJson): void;
  unmount(handle: WindowHandle): void;
}

// ---------------------------------------------------------------------------
// Approval UI
// ---------------------------------------------------------------------------

export type ApprovalMode = 'all-session' | 'manual' | 'rejected';

export interface PluginApprovalRequest {
  config: PluginConfig;
  /** Raw plugin source (for the dev-readable inline viewer). */
  source?: string;
}

export interface RevealApprovalRequest {
  request: ProveRequest;
  descriptors: RevealRangeDescriptor[];
  /** Reference back to the prepared session, if the prover uses two-phase. */
  sessionId?: string;
  /** Raw response body the descriptors index into. */
  response?: string;
}

export interface ApprovalUi {
  requestPluginApproval(req: PluginApprovalRequest): Promise<ApprovalMode>;
  /** Only invoked when the active mode is `manual`. */
  requestRevealApproval?(req: RevealApprovalRequest): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// HostAdapter — the umbrella every adapter exports
// ---------------------------------------------------------------------------

/**
 * Minimal event emitter shape — `@tlsn/plugin-sdk`'s `executePlugin` takes
 * one in its options bag. Adapters use it to push intercepted headers and
 * window events into the running plugin.
 */
export interface HostEventEmitter {
  emit(message: { type: string; [k: string]: unknown }): void;
}

export interface HostAdapterOptions {
  /**
   * Default verifier URL used when the plugin doesn't specify one.
   * Plugin code may override this per `prove()` call.
   */
  verifierUrl: string;
  /** Default WebSocket proxy URL used when the plugin doesn't specify one. */
  proxyUrl?: string;
  /** Optional log-level override forwarded to the plugin-sdk's HostCore. */
  logLevel?: number;
  /**
   * Approval mode in effect for prove() calls made by this Host. Typically
   * computed by the caller via `adapter.approval.requestPluginApproval()`
   * before this Host is created.
   */
  approvalMode?: ApprovalMode;
  /** Manifest the plugin shipped (used by the adapter's reveal-approval UI). */
  pluginConfig?: PluginConfig;
  /**
   * Event emitter the adapter pushes intercepted headers / window events into
   * (`{type: 'HEADER_INTERCEPTED', header, windowId}`, etc.). The same emitter
   * must be passed to `Host.executePlugin({eventEmitter})` so the SDK can
   * deliver the events to plugin hooks like `useHeaders` / `useRequests`.
   */
  eventEmitter?: HostEventEmitter;
}

export interface HostAdapter {
  readonly prover: ProverClient;
  readonly windows: WindowManager;
  readonly interceptor: RequestInterceptor;
  readonly renderer: PluginRenderer;
  readonly approval: ApprovalUi;

  /**
   * Build a `@tlsn/plugin-sdk` Host (or HostCore — they share `executePlugin`)
   * with every callback wired to this adapter's primitives. The adapter is
   * responsible for routing approval decisions into `onProve` (e.g. swapping
   * in `proveUntilReveal` when the active mode is `manual`).
   */
  createHost(opts: HostAdapterOptions): Promise<import('@tlsn/plugin-sdk').HostCore>;

  /**
   * Release any platform resources (browsers, native bindings, subscriptions).
   */
  dispose(): Promise<void>;
}
