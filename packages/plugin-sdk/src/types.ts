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

  /** Request Body */
  requestBody?: {
    error?: string;
    formData?: Record<string, string>;
    raw?: {
      bytes?: any;
      file?: string;
    }[];
  };
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
  stateStore: {[key: string]: any};
  currentContext: string;
  sandbox: {
    eval: (code: string) => Promise<unknown>;
    dispose: () => void;
  };
  main: (force?: boolean) => any;
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
    }
  | {
      type: 'RE_RENDER_PLUGIN_UI';
      windowId: number;
    };

export enum HandlerType {
  SENT = 'SENT',
  RECV = 'RECV',
}

export enum HandlerPart {
  START_LINE = 'START_LINE',
  PROTOCOL = 'PROTOCOL',
  METHOD = 'METHOD',
  REQUEST_TARGET = 'REQUEST_TARGET',
  STATUS_CODE = 'STATUS_CODE',
  HEADERS = 'HEADERS',
  BODY = 'BODY',
  ALL = 'ALL',
}

export enum HandlerAction {
  REVEAL = 'REVEAL',
  PEDERSEN = 'PEDERSEN',
}

export type StartLineHandler = {
  type: HandlerType;
  part:
    | HandlerPart.START_LINE
    | HandlerPart.PROTOCOL
    | HandlerPart.METHOD
    | HandlerPart.REQUEST_TARGET
    | HandlerPart.STATUS_CODE;
  action: HandlerAction.REVEAL | HandlerAction.PEDERSEN;
};

export type HeadersHandler = {
  type: HandlerType;
  part: HandlerPart.HEADERS;
  action: HandlerAction.REVEAL | HandlerAction.PEDERSEN;
  params?: {
    key: string;
    hideKey?: boolean;
    hideValue?: boolean;
  };
};

export type BodyHandler = {
  type: HandlerType;
  part: HandlerPart.BODY;
  action: HandlerAction.REVEAL | HandlerAction.PEDERSEN;
  params?: {
    type: 'json';
    path: string;
    hideKey?: boolean;
    hideValue?: boolean;
  };
};

export type AllHandler = {
  type: HandlerType;
  part: HandlerPart.ALL; // Not used for regex handlers
  action: HandlerAction.REVEAL | HandlerAction.PEDERSEN;
  params?: {
    type: 'regex';
    regex: string;
    flags?: string;
  };
};

export type Handler = StartLineHandler | HeadersHandler | BodyHandler | AllHandler;
