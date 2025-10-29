export interface InterceptedRequest {
  /** Unique request ID from webRequest API */
  id: string;

  /** HTTP method (GET, POST, PUT, DELETE, etc.) */
  method: string;

  /** Full request URL */
  url: string;

  /** Unix timestamp (milliseconds) when request was intercepted */
  timestamp: number;

  /** Tab ID where the request originated */
  tabId: number;
}

export interface InterceptedRequestHeader {
  id: string;
  method: string;
  url: string;
  timestamp: number;
  type: string;
  requestHeaders: { name: string; value?: string }[];
  tabId: number;
}

export type ExecutionContext = {
  id: string;
  pluginUrl: string;
  plugin: string;
  requests?: InterceptedRequest[];
  headers?: InterceptedRequestHeader[];
  windowId?: number;
  context: {
    [functionName: string]: {
      effects: any[][];
      selectors: any[][];
    };
  };
  currentContext: string;
  sandbox: {
    eval: (code: string) => Promise<unknown>;
    dispose: () => void;
  };
  main: () => any;
  callbacks: {
    [callbackName: string]: () => Promise<void>;
  };
};

export type DomOptions = {
  className?: string;
  id?: string;
  style?: { [key: string]: string };
  onclick?: string;
};

export type DomJson =
  | {
      type: 'div' | 'button';
      options: DomOptions;
      children: DomJson[];
    }
  | string;

export type OpenWindowResponse =
  | {
      type: 'WINDOW_OPENED';
      payload: {
        windowId: number;
        uuid: string;
        tabId: number;
      };
    }
  | {
      type: 'WINDOW_ERROR';
      payload: {
        error: string;
        details: string;
      };
    };

export type WindowMessage =
  | {
      type: 'REQUEST_INTERCEPTED';
      request: InterceptedRequest;
      windowId: number;
    }
  | {
      type: 'HEADER_INTERCEPTED';
      header: InterceptedRequestHeader;
      windowId: number;
    }
  | {
      type: 'PLUGIN_UI_CLICK';
      onclick: string;
      windowId: number;
    }
  | {
      type: 'WINDOW_CLOSED';
      windowId: number;
    };
