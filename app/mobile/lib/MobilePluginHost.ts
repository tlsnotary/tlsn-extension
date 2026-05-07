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
  RevealRangeDescriptor,
} from '@tlsn/plugin-sdk';

import { translateHandler, type NativeHandler } from './handlerTranslation';

// Re-export translation helpers and the native handler type so existing
// callers (PluginScreen) can continue importing them from here.
export { translateHandler, translateHandlers, type NativeHandler } from './handlerTranslation';

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

interface MobilePluginHostOptions {
  /**
   * Called when the plugin invokes prove(). Receives handlers in the *native*
   * (PascalCase) format ready to forward to the tlsn-native module.
   */
  onProve: (
    requestOptions: { url: string; method: string; headers: Record<string, string>; body?: string },
    proverOptions: NativeProverOptions,
  ) => Promise<unknown>;

  /** Called when the plugin renders UI. */
  onRenderPluginUi: (windowId: number, domJson: DomJson) => void;

  /** Called when the plugin opens a managed window. */
  onOpenWindow: (
    url: string,
    options?: { width?: number; height?: number; showOverlay?: boolean },
  ) => Promise<{ windowId: number; uuid: string; tabId: number }>;

  /** Called when the plugin completes or the host needs to close the window. */
  onCloseWindow: (windowId: number) => void;
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

  constructor(options: MobilePluginHostOptions) {
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
        return await options.onProve(requestOptions, {
          verifierUrl: proverOptions.verifierUrl,
          proxyUrl: proverOptions.proxyUrl,
          maxRecvData: proverOptions.maxRecvData,
          maxSentData: proverOptions.maxSentData,
          handlers: nativeHandlers,
        });
      } finally {
        this._activeOnProgress = null;
      }
    };

    this.core = new HostCore({
      evaluator: new NativeFunctionEvaluator(),
      reRenderEvent: 'RE_RENDER_PLUGIN_UI',
      enableTimeout: false,
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
    console.log(
      '[MobilePluginHost] emitHeaderIntercepted windowId=',
      windowId,
      'url=',
      header.url,
    );
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
   * Register a pending reveal-approval gate. Resolves once the user clicks
   * Approve in the overlay; rejects on Reject.
   */
  registerRevealApproval(
    resolve: () => void,
    reject: (err: Error) => void,
    descriptors: RevealRangeDescriptor[],
  ): void {
    this.core.registerRevealApproval(resolve, reject, descriptors);
  }
}
