/**
 * MobilePluginHost
 *
 * Thin React Native adapter over `HostCore` from `@tlsn/plugin-sdk/host-core`.
 *
 * The plugin engine itself (hooks, reactive main loop, state store, lifecycle,
 * reveal approval, …) lives in HostCore. This file only handles the things
 * specific to the mobile environment:
 *
 *   1. Picking the JS evaluator — `NativeFunctionEvaluator` (Hermes-safe;
 *      no QuickJS WASM since Hermes lacks the WASM features the WASM build
 *      depends on).
 *   2. Wiring the host callbacks (onProve / onRenderPluginUi / openWindow /
 *      closeWindow) supplied by the React layer.
 *   3. Translating canonical plugin-sdk handlers to the PascalCase shape the
 *      tlsn-native module expects, before invoking native prove().
 *   4. Forwarding native progress events into the running plugin via the
 *      `onProgress` callback HostCore exposes through `onProve`.
 */

import { HostCore, NativeFunctionEvaluator } from '@tlsn/plugin-sdk/host-core';
import type {
  Handler,
  DomJson,
  WindowMessage,
  InterceptedRequestHeader,
  InterceptedRequest,
  ProveProgressData,
  RevealRangeDescriptor as PluginSdkRevealRangeDescriptor,
} from '@tlsn/plugin-sdk';
// Mobile reveal-approval descriptors come from the native two-phase prove
// (with real transcript byte previews), so we use the native type — distinct
// from plugin-sdk's RevealRangeDescriptor which uses SCREAMING_SNAKE_CASE
// algorithm names.
import type { RevealRangeDescriptor } from 'tlsn-native';

import { translateHandler, type NativeHandler } from '@tlsn/host-contracts';

// Re-export translation helpers and the native handler type so existing
// callers (PluginScreen) can continue importing them from here.
export { translateHandler, translateHandlers, type NativeHandler } from '@tlsn/host-contracts';

// Re-export types used by other mobile modules so consumers don't need to
// reach into @tlsn/plugin-sdk directly.
export type {
  DomJson,
  DomOptions,
  Handler,
  Handler as PluginHandler,
  InterceptedRequest,
  InterceptedRequestHeader,
  PluginConfig,
  WindowMessage,
} from '@tlsn/plugin-sdk';

export type { RevealRangeDescriptor } from 'tlsn-native';

// ---------------------------------------------------------------------------
// EventEmitter shape — mobile owns its emitter implementation, so we just
// describe the interface HostCore consumes.
// ---------------------------------------------------------------------------

type EventListener = (message: WindowMessage) => void;

export interface EventEmitter {
  addListener: (listener: EventListener) => void;
  removeListener: (listener: EventListener) => void;
  emit: (message: WindowMessage) => void;
}

// ---------------------------------------------------------------------------
// MobilePluginHost options — accepts handlers in the *native* format. The
// host translates the plugin-sdk format to the native format internally.
// ---------------------------------------------------------------------------

interface NativeProverOptions {
  verifierUrl: string;
  proxyUrl: string;
  maxRecvData?: number;
  maxSentData?: number;
  handlers: NativeHandler[];
}

/**
 * Pre-execution approval modes — mirrors the extension's `ApprovalMode` and
 * the plugin-approval bottom sheet. Set via `setApprovalMode()` after the
 * user picks one. Must be set before the plugin's first `prove()` call.
 */
export type ApprovalMode = 'manual' | 'all-session' | 'rejected';

interface RevealApprovalRequest {
  descriptors: RevealRangeDescriptor[];
  approve: () => void;
  reject: (err: Error) => void;
}

interface MobilePluginHostOptions {
  /**
   * Phase A of the prove split. Called when the plugin invokes prove().
   * Should run the native prover up through `compute_reveal` and return
   * the descriptors + opaque session id. Receives handlers in the *native*
   * (PascalCase) format ready to forward to the tlsn-native module.
   */
  onProveUntilReveal: (
    requestOptions: { url: string; method: string; headers: Record<string, string>; body?: string },
    proverOptions: NativeProverOptions,
  ) => Promise<{ sessionId: string; descriptors: RevealRangeDescriptor[] }>;

  /**
   * Phase B of the prove split. Approve or reject the session prepared by
   * `onProveUntilReveal`. On approve, returns the proof result. On reject,
   * rejects with "User rejected reveal".
   */
  onProveFinalize: (sessionId: string, approved: boolean) => Promise<unknown>;

  /** Called when the plugin renders UI. */
  onRenderPluginUi: (windowId: number, domJson: DomJson) => void;

  /** Called when the plugin opens a managed window. */
  onOpenWindow: (
    url: string,
    options?: { width?: number; height?: number; showOverlay?: boolean },
  ) => Promise<{ windowId: number; uuid: string; tabId: number }>;

  /** Called when the plugin completes or the host needs to close the window. */
  onCloseWindow: (windowId: number) => void;

  /**
   * Called when HostCore's timeout interval fires its 60-second warning.
   * The platform should show its own UI; resolve via `extend` (push the
   * deadline back 5 minutes) or `dismiss` (treat as user-acknowledged but
   * let the deadline run out).
   */
  onTimeoutWarning?: (callbacks: { extend: () => void; dismiss: () => void }) => void;

  /**
   * Called from the prove pipeline (between `onProveUntilReveal` and
   * `onProveFinalize`) when the user must approve the reveal. The platform
   * shows its own UI; resolve `approve()` to continue, or `reject(err)` to
   * abort. If unset, all reveals are auto-approved.
   */
  onRevealApproval?: (request: RevealApprovalRequest) => void;
}

// ---------------------------------------------------------------------------
// MobilePluginHost
// ---------------------------------------------------------------------------

export class MobilePluginHost {
  private core: HostCore;

  /**
   * Captured by the onProve wrapper so external native progress events
   * (delivered via setProveProgress) can be routed back into the running
   * plugin's UI state.
   */
  private _activeOnProgress: ((step: string, progress: number, message: string) => void) | null =
    null;

  /** Set by `setApprovalMode()` after the plugin-approval sheet resolves. */
  private _approvalMode: ApprovalMode = 'manual';

  /** External callback to display the reveal-approval sheet. */
  private _onRevealApproval?: MobilePluginHostOptions['onRevealApproval'];

  constructor(options: MobilePluginHostOptions) {
    this._onRevealApproval = options.onRevealApproval;

    const wrappedOnProve = async (
      requestOptions: {
        url: string;
        method: string;
        headers: Record<string, string>;
        body?: string;
      },
      proverOptions: {
        verifierUrl: string;
        proxyUrl: string;
        maxRecvData?: number;
        maxSentData?: number;
        handlers: Handler[];
      },
      onProgress?: (data: ProveProgressData) => void,
    ): Promise<unknown> => {
      this._activeOnProgress = onProgress
        ? (step: string, progress: number, message: string) =>
            onProgress({ step, progress, message })
        : null;

      try {
        const nativeHandlers = (proverOptions.handlers ?? []).map(translateHandler);
        const nativeProverOptions: NativeProverOptions = {
          verifierUrl: proverOptions.verifierUrl,
          proxyUrl: proverOptions.proxyUrl,
          maxRecvData: proverOptions.maxRecvData,
          maxSentData: proverOptions.maxSentData,
          handlers: nativeHandlers,
        };

        // Phase A: run the protocol up through compute_reveal natively.
        const prep = await options.onProveUntilReveal(requestOptions, nativeProverOptions);

        // Decide whether the user must approve this reveal.
        const skipApprovalGate = this._approvalMode === 'all-session';

        let approved = true;
        if (!skipApprovalGate && this._onRevealApproval) {
          try {
            await new Promise<void>((resolve, reject) => {
              this._onRevealApproval!({
                descriptors: prep.descriptors,
                approve: resolve,
                reject,
              });
            });
          } catch (e) {
            approved = false;
            // Surface the rejection up-stack after we drop the native session.
            void options.onProveFinalize(prep.sessionId, false).catch(() => {});
            throw e instanceof Error ? e : new Error(String(e));
          }
        }

        // Phase B: complete the proof.
        return await options.onProveFinalize(prep.sessionId, approved);
      } finally {
        this._activeOnProgress = null;
      }
    };

    this.core = new HostCore({
      evaluator: new NativeFunctionEvaluator(),
      reRenderEvent: 'RE_RENDER_PLUGIN_UI',
      enableTimeout: true,
      onTimeoutWarning: options.onTimeoutWarning,
      onProve: wrappedOnProve,
      onRenderPluginUi: options.onRenderPluginUi,
      onOpenWindow: async (url, opts) => {
        const response = await options.onOpenWindow(url, opts);
        return {
          type: 'WINDOW_OPENED',
          payload: response,
        };
      },
      onCloseWindow: options.onCloseWindow,
    });
  }

  /**
   * Set the approval mode chosen on the pre-execution approval sheet.
   * Must be called before the plugin's first prove() call. Setting
   * `'rejected'` is informational on this side (the caller is expected to
   * not start the plugin at all in that case).
   */
  setApprovalMode(mode: ApprovalMode): void {
    this._approvalMode = mode;
  }

  /**
   * Push a progress update from the native prover into the active plugin.
   *
   * The mobile layer subscribes to native progress events on the tlsn-native
   * module and forwards them here. While a prove() call is in flight, this
   * routes through the `onProgress` callback HostCore wired into the prove
   * pipeline (which updates `_proveProgress` in the plugin's state store and
   * triggers a UI re-render). Outside of an active prove() call, this is a
   * no-op.
   */
  setProveProgress(data: { step: string; progress: number; message: string } | null): void {
    if (this._activeOnProgress && data) {
      this._activeOnProgress(data.step, data.progress, data.message);
    }
  }

  /**
   * Execute a plugin in the host environment.
   *
   * Resolves with the value the plugin passes to `done()`, or rejects when
   * the plugin throws or terminates abnormally.
   */
  async executePlugin(
    code: string,
    { eventEmitter }: { eventEmitter: EventEmitter },
  ): Promise<unknown> {
    return this.core.executePlugin(code, { eventEmitter });
  }

  /**
   * Feed an intercepted header into a running plugin's execution context.
   */
  emitHeaderIntercepted(
    eventEmitter: EventEmitter,
    windowId: number,
    header: InterceptedRequestHeader,
  ): void {
    eventEmitter.emit({ type: 'HEADER_INTERCEPTED', header, windowId });
  }

  /**
   * Feed an intercepted request into a running plugin's execution context.
   */
  emitRequestIntercepted(
    eventEmitter: EventEmitter,
    windowId: number,
    request: InterceptedRequest,
  ): void {
    eventEmitter.emit({ type: 'REQUEST_INTERCEPTED', request, windowId });
  }

  /**
   * Dispatch a plugin UI button click into the running plugin.
   */
  emitPluginAction(eventEmitter: EventEmitter, windowId: number, onclick: string): void {
    eventEmitter.emit({ type: 'PLUGIN_UI_CLICK', onclick, windowId });
  }

  /**
   * Legacy: register a pending reveal-approval gate via HostCore's DomJson
   * overlay (used by extension parity). Mobile's native flow uses the
   * `onRevealApproval` constructor option instead, which renders a real
   * native bottom sheet with byte-level previews.
   */
  registerRevealApproval(
    resolve: () => void,
    reject: (err: Error) => void,
    descriptors: PluginSdkRevealRangeDescriptor[],
  ): void {
    this.core.registerRevealApproval(resolve, reject, descriptors);
  }
}
