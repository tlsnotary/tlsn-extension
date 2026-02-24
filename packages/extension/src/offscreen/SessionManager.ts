import Host from '@tlsn/plugin-sdk/src';
import { ProveManager } from './ProveManager';
import type { Method } from '../../../tlsn-wasm-pkg/tlsn_wasm';
import { DomJson, Handler, PluginConfig, ProveProgressData } from '@tlsn/plugin-sdk/src/types';
import { logger } from '@tlsn/common';
import {
  validateProvePermission,
  validateOpenWindowPermission,
} from './permissionValidator';

export class SessionManager {
  private host: Host;
  private proveManager: ProveManager;
  private initPromise: Promise<void>;
  private currentConfig: PluginConfig | null = null;
  private currentRequestId: string | null = null;

  constructor() {
    this.host = new Host({
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
        } catch (error) {
          throw new Error('Invalid URL');
        }

        // Validate permissions before proceeding
        validateProvePermission(
          requestOptions,
          proverOptions,
          this.currentConfig,
        );

        // Build sessionData with defaults + user-provided data
        const sessionData: Record<string, string> = {
          ...proverOptions.sessionData,
        };

        // Helper: emit to both the page (via background) and the plugin UI
        const emitBoth = (step: string, progress: number, message: string) => {
          this.emitProgress(step, progress, message);
          onProgress?.({ step, progress, message });
        };

        emitBoth('CONNECTING', 0.0, 'Connecting to verifier...');

        const proverId = await this.proveManager.createProver(
          url.hostname,
          proverOptions.verifierUrl,
          proverOptions.maxRecvData,
          proverOptions.maxSentData,
          sessionData,
        );

        try {
          emitBoth('MPC_SETUP', 0.15, 'MPC session established');

          // Send request via ProveManager which handles IoChannel creation in the worker.
          emitBoth('SENDING_REQUEST', 0.3, 'Sending request...');
          await this.proveManager.sendRequest(
            proverId,
            proverOptions.proxyUrl,
            {
              url: requestOptions.url,
              method: requestOptions.method as Method,
              headers: requestOptions.headers,
              body: requestOptions.body,
            },
          );

          // Compute reveal ranges via WASM (parses HTTP transcripts + maps handlers to byte ranges)
          emitBoth('PROCESSING_TRANSCRIPT', 0.5, 'Processing transcript...');
          const {
            sentRanges,
            recvRanges,
            sentRangesWithHandlers,
            recvRangesWithHandlers,
          } = await this.proveManager.computeReveal(
            proverId,
            proverOptions.handlers,
          );

          logger.debug('sentRanges', sentRanges);
          logger.debug('recvRanges', recvRanges);

          // Send reveal config (ranges + handlers) to verifier BEFORE calling reveal()
          emitBoth('SENDING_REVEAL_CONFIG', 0.6, 'Configuring selective disclosure...');
          await this.proveManager.sendRevealConfig(proverId, {
            sent: sentRangesWithHandlers,
            recv: recvRangesWithHandlers,
          });

          // Reveal the ranges
          emitBoth('GENERATING_PROOF', 0.7, 'Generating proof...');
          await this.proveManager.reveal(proverId, {
            sent: sentRanges,
            recv: recvRanges,
          });

          // Get structured response from verifier (now includes handler results)
          emitBoth('WAITING_FOR_VERIFICATION', 0.85, 'Waiting for verification...');
          const response = await this.proveManager.getResponse(proverId);

          emitBoth('COMPLETE', 1.0, 'Complete');

          return response;
        } finally {
          // Always clean up prover resources to prevent memory leaks
          this.proveManager.cleanupProver(proverId);
        }
      },
      onRenderPluginUi: (windowId: number, result: DomJson) => {
        const chromeRuntime = (
          global as unknown as { chrome?: { runtime?: any } }
        ).chrome?.runtime;
        if (!chromeRuntime?.sendMessage) {
          throw new Error('Chrome runtime not available');
        }
        chromeRuntime.sendMessage({
          type: 'RENDER_PLUGIN_UI',
          json: result,
          windowId: windowId,
        });
      },
      onCloseWindow: (windowId: number) => {
        const chromeRuntime = (
          global as unknown as { chrome?: { runtime?: any } }
        ).chrome?.runtime;
        if (!chromeRuntime?.sendMessage) {
          throw new Error('Chrome runtime not available');
        }
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
        // Validate permissions before proceeding
        validateOpenWindowPermission(url, this.currentConfig);

        const chromeRuntime = (
          global as unknown as { chrome?: { runtime?: any } }
        ).chrome?.runtime;
        if (!chromeRuntime?.sendMessage) {
          throw new Error('Chrome runtime not available');
        }
        return chromeRuntime.sendMessage({
          type: 'OPEN_WINDOW',
          url,
          width: options?.width,
          height: options?.height,
          showOverlay: options?.showOverlay,
        });
      },
    });
    this.proveManager = new ProveManager();
    this.initPromise = new Promise(async (resolve) => {
      await this.proveManager.init();
      resolve();
    });
  }

  /** Send a progress event to the background script for routing to the page. */
  private emitProgress(
    step: string,
    progress: number,
    message: string,
    source: string = 'js',
  ) {
    if (!this.currentRequestId) return;
    const chromeRuntime = (global as unknown as { chrome?: { runtime?: any } })
      .chrome?.runtime;
    if (chromeRuntime?.sendMessage) {
      chromeRuntime.sendMessage({
        type: 'PROVE_PROGRESS',
        requestId: this.currentRequestId,
        step,
        progress,
        message,
        source,
      });
    }
  }

  async awaitInit(): Promise<SessionManager> {
    await this.initPromise;
    return this;
  }

  async executePlugin(code: string, requestId?: string): Promise<unknown> {
    const chromeRuntime = (global as unknown as { chrome?: { runtime?: any } })
      .chrome?.runtime;
    if (!chromeRuntime?.onMessage) {
      throw new Error('Chrome runtime not available');
    }

    // Store requestId and wire up WASM progress callback
    this.currentRequestId = requestId || null;
    this.proveManager.setProgressCallback(
      this.currentRequestId
        ? (data) => {
            this.emitProgress(data.step, data.progress, data.message, data.source);
          }
        : null,
    );

    // Extract and store plugin config before execution for permission validation
    this.currentConfig = await this.extractConfig(code);
    logger.debug(
      '[SessionManager] Extracted plugin config:',
      this.currentConfig,
    );

    return this.host.executePlugin(code, {
      eventEmitter: {
        addListener: (listener: (message: any) => void) => {
          chromeRuntime.onMessage.addListener(listener);
        },
        removeListener: (listener: (message: any) => void) => {
          chromeRuntime.onMessage.removeListener(listener);
        },
        emit: (message: any) => {
          chromeRuntime.sendMessage(message);
        },
      },
    });
  }

  /**
   * Extract plugin config using QuickJS sandbox (more reliable than regex)
   */
  async extractConfig(code: string): Promise<any> {
    return this.host.getPluginConfig(code);
  }
}
