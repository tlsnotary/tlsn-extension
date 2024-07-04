import { deferredPromise, PromiseResolvers } from '../../utils/promise';

export enum ContentScriptTypes {
  connect = 'tlsn/cs/connect',
  get_history = 'tlsn/cs/get_history',
  get_proof = 'tlsn/cs/get_proof',
  notarize = 'tlsn/cs/notarize',
  install_plugin = 'tlsn/cs/install_plugin',
  get_plugins = 'tlsn/cs/get_plugins',
  run_plugin = 'tlsn/cs/run_plugin',
}

export type ContentScriptRequest<params> = {
  tlsnrpc: string;
} & RPCRequest<ContentScriptTypes, params>;

export type ContentScriptResponse = {
  tlsnrpc: string;
} & RPCResponse;

export type RPCRequest<method, params> = {
  id: number;
  method: method;
  params?: params;
};

export type RPCResponse = {
  id: number;
  result?: never;
  error?: never;
};

export class RPCServer {
  #handlers: Map<
    ContentScriptTypes,
    (message: ContentScriptRequest<any>) => Promise<any>
  > = new Map();

  constructor() {
    window.addEventListener(
      'message',
      async (event: MessageEvent<ContentScriptRequest<never>>) => {
        const data = event.data;

        if (data.tlsnrpc !== '1.0') return;
        if (!data.method) return;

        const handler = this.#handlers.get(data.method);

        if (handler) {
          try {
            const result = await handler(data);
            window.postMessage({
              tlsnrpc: '1.0',
              id: data.id,
              result,
            });
          } catch (error) {
            window.postMessage({
              tlsnrpc: '1.0',
              id: data.id,
              error,
            });
          }
        } else {
          throw new Error(`unknown method - ${data.method}`);
        }
      },
    );
  }

  on(
    method: ContentScriptTypes,
    handler: (message: ContentScriptRequest<any>) => Promise<any>,
  ) {
    this.#handlers.set(method, handler);
  }
}

export class RPCClient {
  #requests: Map<number, PromiseResolvers> = new Map();
  #id = 0;

  get id() {
    return this.#id++;
  }

  constructor() {
    window.addEventListener(
      'message',
      (event: MessageEvent<ContentScriptResponse>) => {
        const data = event.data;

        if (data.tlsnrpc !== '1.0') return;

        const promise = this.#requests.get(data.id);

        if (promise) {
          if (typeof data.result !== 'undefined') {
            promise.resolve(data.result);
            this.#requests.delete(data.id);
          } else if (typeof data.error !== 'undefined') {
            promise.reject(data.error);
            this.#requests.delete(data.id);
          }
        }
      },
    );
  }

  async call(method: ContentScriptTypes, params?: any): Promise<never> {
    const request = { tlsnrpc: '1.0', id: this.id, method, params };
    const defer = deferredPromise();
    this.#requests.set(request.id, defer);
    window.postMessage(request, '*');
    return defer.promise;
  }
}
