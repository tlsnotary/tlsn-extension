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
      bytes?: ArrayBuffer;
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
      effects: unknown[][];
      selectors: unknown[][];
    };
  };
  stateStore: Record<string, unknown>;
  currentContext: string;
  sandbox: {
    eval: (code: string) => Promise<unknown>;
    dispose: () => void;
  };
  main: (force?: boolean) => DomJson | null;
  callbacks: {
    [callbackName: string]: () => Promise<void>;
  };
};

export type DomOptions = {
  className?: string;
  id?: string;
  style?: { [key: string]: string };
  onclick?: string;
  inputType?: string;
  checked?: boolean;
  value?: string;
  placeholder?: string;
  disabled?: boolean;
};

export type DomJson =
  | {
      type: 'div' | 'button' | 'input';
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
      type: 'REQUESTS_BATCH';
      requests: InterceptedRequest[];
      windowId: number;
    }
  | {
      type: 'HEADER_INTERCEPTED';
      header: InterceptedRequestHeader;
      windowId: number;
    }
  | {
      type: 'HEADERS_BATCH';
      headers: InterceptedRequestHeader[];
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
    }
  | {
      type: 'TO_BG_RE_RENDER_PLUGIN_UI';
      windowId: number;
    };

export interface ProveProgressData {
  step: string;
  progress: number;
  message: string;
}

export type HandlerType = 'SENT' | 'RECV';

export type HandlerPart =
  | 'START_LINE'
  | 'PROTOCOL'
  | 'METHOD'
  | 'REQUEST_TARGET'
  | 'STATUS_CODE'
  | 'HEADERS'
  | 'BODY'
  | 'ALL';

export type HandlerAction = 'REVEAL' | 'PEDERSEN';

export type StartLineHandler = {
  type: HandlerType;
  part: 'START_LINE' | 'PROTOCOL' | 'METHOD' | 'REQUEST_TARGET' | 'STATUS_CODE';
  action: HandlerAction;
};

export type HeadersHandler = {
  type: HandlerType;
  part: 'HEADERS';
  action: HandlerAction;
  params?: {
    key: string;
    hideKey?: boolean;
    hideValue?: boolean;
  };
};

export type BodyHandler = {
  type: HandlerType;
  part: 'BODY';
  action: HandlerAction;
  params?: {
    type: 'json';
    path: string;
    hideKey?: boolean;
    hideValue?: boolean;
  };
};

export type AllHandler = {
  type: HandlerType;
  part: 'ALL';
  action: HandlerAction;
  params?: {
    type: 'regex';
    regex: string;
    flags?: string;
  };
};

export type Handler = StartLineHandler | HeadersHandler | BodyHandler | AllHandler;

/**
 * Permission for making HTTP requests via prove()
 */
export interface RequestPermission {
  /** HTTP method (GET, POST, etc.) */
  method: string;

  /** Host name (e.g., "api.x.com") */
  host: string;

  /**
   * URL pathname pattern (URLPattern syntax, e.g., "/1.1/users/*")
   * Supports wildcards: * matches any single segment, ** matches multiple segments
   */
  pathname: string;

  /** Verifier URL to use for this request */
  verifierUrl: string;

  /**
   * Proxy URL for WebSocket connection.
   * Defaults to ws/wss of verifierUrl's /proxy endpoint if not specified.
   * e.g., verifierUrl "https://verifier.example.com" -> "wss://verifier.example.com/proxy?token={host}"
   */
  proxyUrl?: string;
}

/**
 * Plugin configuration object that all plugins must export
 */
export interface PluginConfig {
  /** Display name of the plugin */
  name: string;
  /** Description of what the plugin does */
  description: string;
  /** Optional version string */
  version?: string;
  /** Optional author name */
  author?: string;

  /**
   * Allowed HTTP requests the plugin can make via prove().
   * Empty array or undefined means no prove() calls allowed.
   */
  requests?: RequestPermission[];

  /**
   * Allowed URLs the plugin can open via openWindow().
   * Supports URLPattern syntax (e.g., "https://x.com/*").
   * Empty array or undefined means no openWindow() calls allowed.
   */
  urls?: string[];

  /**
   * OAuth provider hostnames that require system browser handoff (mobile only).
   * When the WebView navigates to one of these hosts, the navigation is
   * intercepted and opened in the system browser instead (SFSafariViewController
   * on iOS, Chrome Custom Tabs on Android), since OAuth providers like Google
   * block sign-in from embedded WebViews.
   * Supports subdomain matching (e.g., "google.com" matches "accounts.google.com").
   */
  oauthHosts?: string[];
}
