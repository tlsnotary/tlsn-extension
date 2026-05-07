import Host from '@tlsn/plugin-sdk';
import { ProveManager } from './ProveManager';
import type { Method } from '../../../tlsn-wasm-pkg/tlsn_wasm';
import type {
  DomJson,
  Handler,
  OpenWindowResponse,
  PluginConfig,
  ProveProgressData,
  WindowMessage,
} from '@tlsn/plugin-sdk';
import { logger } from '@tlsn/common';

/**
 * Minimal interface for the Chrome runtime API surface used by SessionManager.
 * Avoids depending on the full `typeof chrome.runtime` which requires exact
 * callback signatures that conflict with our simplified listeners.
 */
interface ChromeRuntimeLike {
  sendMessage: (message: unknown) => Promise<unknown>;
  onMessage: {
    addListener: (listener: (...args: unknown[]) => void) => void;
    removeListener: (listener: (...args: unknown[]) => void) => void;
  };
}
import { validateProvePermission, validateOpenWindowPermission } from './permissionValidator';

export class SessionManager {
  /** Shared Host instance — only used for config extraction (stateless). */
  private configHost: Host;
  private proveManager: ProveManager;
  private initPromise: Promise<void>;

  constructor() {
    // Lightweight Host for config extraction only (no execution-scoped state)
    this.configHost = new Host({
      onProve: async () => {
        throw new Error('Config host should not be used for proving');
      },
      onRenderPluginUi: () => {},
      onCloseWindow: () => {},
      onOpenWindow: async () => {
        throw new Error('Config host should not be used for opening windows');
      },
    });
    this.proveManager = new ProveManager();
    this.initPromise = this.proveManager.init();
  }

  private static getChromeRuntime(): ChromeRuntimeLike {
    const chromeRuntime = (global as unknown as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome
      ?.runtime;
    if (!chromeRuntime?.sendMessage) {
      throw new Error('Chrome runtime not available');
    }
    return chromeRuntime;
  }

  /**
   * Create a per-execution Host with callbacks that close over execution-scoped
   * state (config, requestId, sessionData). This prevents concurrent plugin
   * executions from contaminating each other's permission validation.
   */
  private createExecutionHost(
    pluginConfig: PluginConfig | null,
    requestId: string | null,
    execSessionData: Record<string, string> | null,
  ): Host {
    const proveManager = this.proveManager;

    const emitProgress = (step: string, progress: number, message: string, source = 'js') => {
      if (!requestId) return;
      const chromeRuntime = SessionManager.getChromeRuntime();
      chromeRuntime
        .sendMessage({
          type: 'PROVE_PROGRESS',
          requestId,
          step,
          progress,
          message,
          source,
        })
        .catch((err: unknown) => logger.warn('[SessionManager] emitProgress failed:', err));
    };

    return new Host({
      onProve: async (
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
          sessionData?: Record<string, string>;
        },
        onProgress?: (data: ProveProgressData) => void,
      ) => {
        let url;

        try {
          url = new URL(requestOptions.url);
        } catch (_error) {
          throw new Error('Invalid URL');
        }

        // Validate permissions using this execution's config (not shared state)
        validateProvePermission(requestOptions, proverOptions, pluginConfig);

        // Build sessionData with defaults + execCode-level data + plugin-provided data
        const sessionData: Record<string, string> = {
          ...execSessionData,
          ...proverOptions.sessionData,
        };

        // Helper: emit to both the page (via background) and the plugin UI
        const emitBoth = (step: string, progress: number, message: string) => {
          emitProgress(step, progress, message);
          onProgress?.({ step, progress, message });
        };

        // Mode is a user/platform decision, not a plugin decision.
        // Read from sessionData provided by the caller of execCode().
        const mode = (sessionData.mode as 'Mpc' | 'Proxy') ?? 'Mpc';
        const modeLabel = mode === 'Proxy' ? 'Proxy' : 'MPC';
        logger.debug('[SessionManager] Prove mode:', mode, 'sessionData:', sessionData);

        emitBoth('CONNECTING', 0.0, `Connecting to verifier (${modeLabel} mode)...`);

        const proverId = await proveManager.createProver(
          url.hostname,
          proverOptions.verifierUrl,
          proverOptions.maxRecvData,
          proverOptions.maxSentData,
          sessionData,
          mode,
        );

        // Register per-prover WASM progress callback
        if (requestId) {
          proveManager.setProgressCallbackForProver(proverId, (data) => {
            emitProgress(data.step, data.progress, data.message, data.source);
          });
        }

        try {
          emitBoth('SESSION_SETUP', 0.15, `${modeLabel} session established`);

          // In Proxy mode the prover↔server traffic is tunneled through the
          // verifier session multiplexer, so no separate WebSocket to the
          // websockify proxy is opened. In MPC mode we pass the websockify URL
          // through to the worker, which will create a JsIo channel for it.
          const workerProxyUrl = mode === 'Proxy' ? undefined : proverOptions.proxyUrl;

          // Send request via ProveManager which handles IoChannel creation in the worker.
          emitBoth('SENDING_REQUEST', 0.3, 'Sending request...');
          await this.proveManager.sendRequest(proverId, workerProxyUrl, {
            url: requestOptions.url,
            method: requestOptions.method as Method,
            headers: requestOptions.headers,
            body: requestOptions.body,
          });

          // Compute reveal ranges via WASM (parses HTTP transcripts + maps handlers to byte ranges)
          emitBoth('PROCESSING_TRANSCRIPT', 0.5, 'Processing transcript...');
          const { sentRanges, recvRanges, sentRangesWithHandlers, recvRangesWithHandlers, commit } =
            await proveManager.computeReveal(proverId, proverOptions.handlers);

          logger.debug('sentRanges', sentRanges);
          logger.debug('recvRanges', recvRanges);
          if (commit) {
            logger.debug('commitRanges', commit);
          }

          // Send reveal config (ranges + handlers) to verifier BEFORE calling reveal()
          emitBoth('SENDING_REVEAL_CONFIG', 0.6, 'Configuring selective disclosure...');
          await proveManager.sendRevealConfig(proverId, {
            sent: sentRangesWithHandlers,
            recv: recvRangesWithHandlers,
          });

          // Reveal the ranges (and hash-commit ranges if any handlers use action: HASH)
          emitBoth('GENERATING_PROOF', 0.7, 'Generating proof...');
          await proveManager.reveal(proverId, { sent: sentRanges, recv: recvRanges }, commit);

          // Get structured response from verifier (now includes handler results)
          emitBoth('WAITING_FOR_VERIFICATION', 0.85, 'Waiting for verification...');
          const response = await proveManager.getResponse(proverId);

          emitBoth('COMPLETE', 1.0, 'Complete');

          return response;
        } finally {
          // Always clean up prover resources to prevent memory leaks
          await proveManager.cleanupProver(proverId);
        }
      },
      onRenderPluginUi: (windowId: number, result: DomJson) => {
        const chromeRuntime = SessionManager.getChromeRuntime();
        chromeRuntime.sendMessage({
          type: 'RENDER_PLUGIN_UI',
          json: result,
          windowId: windowId,
        });
      },
      onCloseWindow: (windowId: number) => {
        const chromeRuntime = SessionManager.getChromeRuntime();
        logger.debug('onCloseWindow', windowId);
        return chromeRuntime.sendMessage({
          type: 'CLOSE_WINDOW',
          windowId,
        });
      },
      onOpenWindow: async (
        url: string,
        options?: { width?: number; height?: number; showOverlay?: boolean },
      ) => {
        // Validate permissions using this execution's config (not shared state)
        validateOpenWindowPermission(url, pluginConfig);

        const chromeRuntime = SessionManager.getChromeRuntime();
        return chromeRuntime.sendMessage({
          type: 'OPEN_WINDOW',
          url,
          width: options?.width,
          height: options?.height,
          showOverlay: options?.showOverlay,
        }) as Promise<OpenWindowResponse>;
      },
    });
  }

  async awaitInit(): Promise<SessionManager> {
    await this.initPromise;
    return this;
  }

  async executePlugin(
    code: string,
    requestId?: string,
    sessionData?: Record<string, string>,
  ): Promise<unknown> {
    const chromeRuntime = SessionManager.getChromeRuntime();
    if (!chromeRuntime.onMessage) {
      throw new Error('Chrome runtime not available');
    }

    const execRequestId = requestId || null;

    // Extract plugin config for permission validation (scoped to this execution)
    const pluginConfig = await this.extractConfig(code);
    logger.debug('[SessionManager] Extracted plugin config:', pluginConfig);

    // Create a per-execution Host with callbacks that close over this execution's state
    const host = this.createExecutionHost(pluginConfig, execRequestId, sessionData || null);

    // Wrap the plugin's event listener so it does NOT return a Promise to
    // Chrome's messaging API. The plugin listener (makeOpenWindow's onMessage)
    // is async, so it always returns a Promise. If added directly to
    // chrome.runtime.onMessage, Chrome may use its Promise<undefined> as the
    // response to unrelated messages (e.g. EXTRACT_CONFIG), racing with the
    // offscreen's main listener that returns the actual result.
    const listenerWrappers = new Map<
      (message: WindowMessage) => void,
      (message: unknown) => void
    >();

    return host.executePlugin(code, {
      eventEmitter: {
        addListener: (listener: (message: WindowMessage) => void) => {
          const wrapper = (message: unknown) => {
            // Fire-and-forget: don't return the Promise so Chrome doesn't
            // treat it as a messaging response.
            listener(message as WindowMessage);
          };
          listenerWrappers.set(listener, wrapper);
          chromeRuntime.onMessage.addListener(wrapper);
        },
        removeListener: (listener: (message: WindowMessage) => void) => {
          const wrapper = listenerWrappers.get(listener);
          if (wrapper) {
            chromeRuntime.onMessage.removeListener(wrapper);
            listenerWrappers.delete(listener);
          }
        },
        emit: (message: WindowMessage) => {
          chromeRuntime.sendMessage(message);
        },
      },
    });
  }

  /**
   * Extract plugin config using QuickJS sandbox (more reliable than regex)
   */
  async extractConfig(code: string): Promise<PluginConfig | null> {
    return (await this.configHost.getPluginConfig(code)) ?? null;
  }
}
