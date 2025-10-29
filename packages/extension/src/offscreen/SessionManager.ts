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
          reveal: Handler[];
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

        const { sent, recv } = await prover.transcript();

        const parsedSent = new Parser(Buffer.from(sent));
        const parsedRecv = new Parser(Buffer.from(recv));

        console.log('parsedSent', parsedSent.json());
        console.log('parsedRecv', parsedRecv.json());

        const sentRanges: { start: number; end: number }[] = [];
        const recvRanges: { start: number; end: number }[] = [];

        for (const handler of proverOptions.reveal) {
          const transcript =
            handler.type === HandlerType.SENT ? parsedSent : parsedRecv;
          const ranges =
            handler.type === HandlerType.SENT ? sentRanges : recvRanges;
          switch (handler.part) {
            case HandlerPart.START_LINE:
              ranges.push(...transcript.ranges.startLine());
              break;
            case HandlerPart.PROTOCOL:
              ranges.push(...transcript.ranges.protocol());
              break;
            case HandlerPart.METHOD:
              ranges.push(...transcript.ranges.method());
              break;
            case HandlerPart.REQUEST_TARGET:
              ranges.push(...transcript.ranges.requestTarget());
              break;
            case HandlerPart.STATUS_CODE:
              ranges.push(...transcript.ranges.statusCode());
              break;
            case HandlerPart.HEADERS: {
              if (!handler.params?.key) {
                transcript.json().headers.forEach((header: any) => {
                  if (handler.params?.hideKey && handler.params?.hideValue) {
                    throw new Error('Cannot hide both key and value');
                  } else if (handler.params?.hideKey) {
                    ranges.push(
                      ...transcript.ranges.headers(header.key, {
                        hideKey: true,
                      }),
                    );
                  } else if (handler.params?.hideValue) {
                    ranges.push(
                      ...transcript.ranges.headers(header.key, {
                        hideValue: true,
                      }),
                    );
                  } else {
                    ranges.push(...transcript.ranges.headers(header.key));
                  }
                });
              } else {
                if (handler.params?.hideKey && handler.params?.hideValue) {
                  throw new Error('Cannot hide both key and value');
                } else if (handler.params?.hideKey) {
                  ranges.push(
                    ...transcript.ranges.headers(handler.params.key, {
                      hideKey: true,
                    }),
                  );
                } else if (handler.params?.hideValue) {
                  ranges.push(
                    ...transcript.ranges.headers(handler.params.key, {
                      hideValue: true,
                    }),
                  );
                } else {
                  ranges.push(...transcript.ranges.headers(handler.params.key));
                }
              }
              break;
            }
            case HandlerPart.BODY: {
              if (!handler.params) {
                ranges.push(...transcript.ranges.body());
              } else if (handler.params?.type === 'json') {
                console.log('json', handler.params.path);
                (global as any).transcript = transcript;
                ranges.push(
                  ...transcript.ranges.body(handler.params.path, {
                    type: 'json',
                    hideKey: handler.params?.hideKey,
                    hideValue: handler.params?.hideValue,
                  }),
                );
              } else if (handler.params?.type === 'regex') {
                ranges.push(
                  ...transcript.ranges.body(handler.params.regex, {
                    type: 'regex',
                  }),
                );
              }
              break;
            }
          }
        }

        console.log('sentRanges', sentRanges);
        console.log('recvRanges', recvRanges);

        await prover.reveal({
          sent: sentRanges,
          recv: recvRanges,
          server_identity: true,
        });

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
