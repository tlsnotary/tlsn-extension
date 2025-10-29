import Host, { Parser } from '@tlsn/plugin-sdk/src';
import { ProveManager } from './ProveManager';
import { Method } from 'tlsn-js';
import {
  DomJson,
  Handler,
  HandlerPart,
  HandlerType,
} from '@tlsn/plugin-sdk/src/types';

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

        // Extract ranges for revealing and build RangeWithHandler objects
        const sentRanges: { start: number; end: number }[] = [];
        const recvRanges: { start: number; end: number }[] = [];
        const sentRangesWithHandlers: {
          start: number;
          end: number;
          handler: Handler;
        }[] = [];
        const recvRangesWithHandlers: {
          start: number;
          end: number;
          handler: Handler;
        }[] = [];

        // Helper to add ranges with handler metadata
        const addRanges = (
          baseRanges: { start: number; end: number }[],
          newRanges: { start: number; end: number }[],
          rangesWithHandlers: {
            start: number;
            end: number;
            handler: Handler;
          }[],
          handler: Handler,
        ) => {
          baseRanges.push(...newRanges);
          newRanges.forEach((range) => {
            rangesWithHandlers.push({ ...range, handler });
          });
        };

        for (const handler of proverOptions.handlers) {
          const transcript =
            handler.type === HandlerType.SENT ? parsedSent : parsedRecv;
          const ranges =
            handler.type === HandlerType.SENT ? sentRanges : recvRanges;
          const rangesWithHandlers =
            handler.type === HandlerType.SENT
              ? sentRangesWithHandlers
              : recvRangesWithHandlers;

          switch (handler.part) {
            case HandlerPart.START_LINE:
              addRanges(
                ranges,
                transcript.ranges.startLine(),
                rangesWithHandlers,
                handler,
              );
              break;
            case HandlerPart.PROTOCOL:
              addRanges(
                ranges,
                transcript.ranges.protocol(),
                rangesWithHandlers,
                handler,
              );
              break;
            case HandlerPart.METHOD:
              addRanges(
                ranges,
                transcript.ranges.method(),
                rangesWithHandlers,
                handler,
              );
              break;
            case HandlerPart.REQUEST_TARGET:
              addRanges(
                ranges,
                transcript.ranges.requestTarget(),
                rangesWithHandlers,
                handler,
              );
              break;
            case HandlerPart.STATUS_CODE:
              addRanges(
                ranges,
                transcript.ranges.statusCode(),
                rangesWithHandlers,
                handler,
              );
              break;
            case HandlerPart.HEADERS: {
              if (!handler.params?.key) {
                transcript.json().headers.forEach((header: any) => {
                  if (handler.params?.hideKey && handler.params?.hideValue) {
                    throw new Error('Cannot hide both key and value');
                  } else if (handler.params?.hideKey) {
                    addRanges(
                      ranges,
                      transcript.ranges.headers(header.key, {
                        hideKey: true,
                      }),
                      rangesWithHandlers,
                      handler,
                    );
                  } else if (handler.params?.hideValue) {
                    addRanges(
                      ranges,
                      transcript.ranges.headers(header.key, {
                        hideValue: true,
                      }),
                      rangesWithHandlers,
                      handler,
                    );
                  } else {
                    addRanges(
                      ranges,
                      transcript.ranges.headers(header.key),
                      rangesWithHandlers,
                      handler,
                    );
                  }
                });
              } else {
                if (handler.params?.hideKey && handler.params?.hideValue) {
                  throw new Error('Cannot hide both key and value');
                } else if (handler.params?.hideKey) {
                  addRanges(
                    ranges,
                    transcript.ranges.headers(handler.params.key, {
                      hideKey: true,
                    }),
                    rangesWithHandlers,
                    handler,
                  );
                } else if (handler.params?.hideValue) {
                  addRanges(
                    ranges,
                    transcript.ranges.headers(handler.params.key, {
                      hideValue: true,
                    }),
                    rangesWithHandlers,
                    handler,
                  );
                } else {
                  addRanges(
                    ranges,
                    transcript.ranges.headers(handler.params.key),
                    rangesWithHandlers,
                    handler,
                  );
                }
              }
              break;
            }
            case HandlerPart.BODY: {
              if (!handler.params) {
                addRanges(
                  ranges,
                  transcript.ranges.body(),
                  rangesWithHandlers,
                  handler,
                );
              } else if (handler.params?.type === 'json') {
                console.log('json', handler.params.path);
                (global as any).transcript = transcript;
                addRanges(
                  ranges,
                  transcript.ranges.body(handler.params.path, {
                    type: 'json',
                    hideKey: handler.params?.hideKey,
                    hideValue: handler.params?.hideValue,
                  }),
                  rangesWithHandlers,
                  handler,
                );
              } else if (handler.params?.type === 'regex') {
                addRanges(
                  ranges,
                  transcript.ranges.body(handler.params.regex, {
                    type: 'regex',
                  }),
                  rangesWithHandlers,
                  handler,
                );
              }
              break;
            }
          }
        }

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
      },
    });
  }
}
