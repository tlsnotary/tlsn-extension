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
  revealApproval?: { resolve: () => void; reject: (err: Error) => void } | null;
  revealApprovalDescriptors?: RevealRangeDescriptor[] | null;
  revealWasRejected?: boolean;
};

export type DomOptions = {
  className?: string;
  id?: string;
  style?: { [key: string]: string };
  onclick?: string;
  draggable?: boolean;
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

export type HashAlgorithm = 'BLAKE3' | 'SHA256' | 'KECCAK256';

export type RevealRangeDescriptor = {
  direction: 'SENT' | 'RECV';
  label: string;
  action: 'REVEAL' | 'HASH';
  algorithm?: HashAlgorithm;
  preview: string;
};

/**
 * What to do with the matched ranges.
 *
 * - REVEAL sends plaintext. Accepts the string shorthand `'REVEAL'` or the
 *   object form `{ kind: 'REVEAL' }`.
 * - HASH sends a hash commitment with the specified algorithm; the algorithm
 *   must be chosen explicitly, so only the object form is valid.
 *
 * The object form is the canonical representation that crosses the WASM and
 * native Rust boundaries. Plugin code is canonicalized before leaving the
 * host.
 */
export type HandlerAction =
  | 'REVEAL'
  | { kind: 'REVEAL' }
  | { kind: 'HASH'; algorithm: HashAlgorithm };

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
 * Action in its canonical object form (never the string shorthand).
 */
export type CanonicalHandlerAction = Exclude<HandlerAction, string>;

/** Handler with `action` guaranteed to be in object form. */
export type CanonicalHandler = Handler & { action: CanonicalHandlerAction };

/**
 * Expand the `action: 'REVEAL'` shorthand into its object form. Serialization
 * boundaries (WASM, native Rust) only accept the object form, so callers must
 * canonicalize before handing handlers off.
 */
export function canonicalizeHandler(handler: Handler): CanonicalHandler {
  if (typeof handler.action === 'string') {
    return { ...handler, action: { kind: handler.action } } as CanonicalHandler;
  }
  return handler as CanonicalHandler;
}

export function canonicalizeHandlers(handlers: Handler[]): CanonicalHandler[] {
  return handlers.map(canonicalizeHandler);
}

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

  /**
   * Maximum execution timeout in milliseconds.
   * When 1 minute remains, a warning modal is shown to the user
   * with an option to extend by 5 minutes.
   * Clamped to [2 minutes, 60 minutes]. Defaults to 15 minutes.
   */
  timeout?: number;
}
