import Host, { Parser } from '@tlsn/plugin-sdk/src';
import { ProveManager } from './ProveManager';
import { Method } from 'tlsn-js';
import { DomJson, Handler } from '@tlsn/plugin-sdk/src/types';
import { processHandlers } from './rangeExtractor';

export class SessionManager {
  private host: Host;
  private proveManager: ProveManager;
  private initPromise: Promise<void>;

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
        },
      ) => {
        let url;

        try {
          url = new URL(requestOptions.url);
        } catch (error) {
          throw new Error('Invalid URL');
        }

        const proverId = await this.proveManager.createProver(
          url.hostname,
          proverOptions.verifierUrl,
          proverOptions.maxRecvData,
          proverOptions.maxSentData,
        );

        const prover = await this.proveManager.getProver(proverId);

        const headerMap: Map<string, number[]> = new Map();
        Object.entries(requestOptions.headers).forEach(([key, value]) => {
          headerMap.set(key, Buffer.from(value).toJSON().data);
        });

        await prover.send_request(proverOptions.proxyUrl, {
          uri: requestOptions.url,
          method: requestOptions.method as Method,
          headers: headerMap,
          body: requestOptions.body,
        });

        // Get transcripts for parsing
        const { sent, recv } = await prover.transcript();

        const parsedSent = new Parser(Buffer.from(sent));
        const parsedRecv = new Parser(Buffer.from(recv));

        console.log('parsedSent', parsedSent.json());
        console.log('parsedRecv', parsedRecv.json());

        // Use refactored range extraction logic
        const {
          sentRanges,
          recvRanges,
          sentRangesWithHandlers,
          recvRangesWithHandlers,
        } = processHandlers(proverOptions.handlers, parsedSent, parsedRecv);

        console.log('sentRanges', sentRanges);
        console.log('recvRanges', recvRanges);

        // Send reveal config (ranges + handlers) to verifier BEFORE calling reveal()
        await this.proveManager.sendRevealConfig(proverId, {
          sent: sentRangesWithHandlers,
          recv: recvRangesWithHandlers,
        });

        // Reveal the ranges
        await prover.reveal({
          sent: sentRanges,
          recv: recvRanges,
          server_identity: true,
        });

        // Get structured response from verifier (now includes handler results)
        const response = await this.proveManager.getResponse(proverId);

        return response;
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
        console.log('onCloseWindow', windowId);
        return chromeRuntime.sendMessage({
          type: 'CLOSE_WINDOW',
          windowId,
        });
      },
      onOpenWindow: async (
        url: string,
        options?: { width?: number; height?: number; showOverlay?: boolean },
      ) => {
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

  async awaitInit(): Promise<SessionManager> {
    await this.initPromise;
    return this;
  }

  async executePlugin(code: string): Promise<unknown> {
    const chromeRuntime = (global as unknown as { chrome?: { runtime?: any } })
      .chrome?.runtime;
    if (!chromeRuntime?.onMessage) {
      throw new Error('Chrome runtime not available');
    }
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
}
