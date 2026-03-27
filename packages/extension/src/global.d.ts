declare module '*.png' {
  const value: string;
  export = value;
}

// Chrome Offscreen API (Chrome 109+, not yet in @types/chrome)
declare namespace chrome.offscreen {
  interface CreateDocumentOptions {
    url: string;
    reasons: string[];
    justification: string;
  }
  function createDocument(options: CreateDocumentOptions): Promise<void>;
}

// Chrome runtime.getContexts (Chrome 116+, not yet in @types/chrome)
declare namespace chrome.runtime {
  interface ContextFilter {
    contextTypes?: string[];
    documentUrls?: string[];
  }
  interface ExtensionContext {
    contextType: string;
    documentUrl?: string;
  }
  function getContexts(filter: ContextFilter): Promise<ExtensionContext[]>;
}

// URLPattern Web API (available in Chrome 95+)
// https://developer.mozilla.org/en-US/docs/Web/API/URLPattern
interface URLPatternInit {
  protocol?: string;
  username?: string;
  password?: string;
  hostname?: string;
  port?: string;
  pathname?: string;
  search?: string;
  hash?: string;
  baseURL?: string;
}

interface URLPatternComponentResult {
  input: string;
  groups: Record<string, string | undefined>;
}

interface URLPatternResult {
  inputs: [string | URLPatternInit];
  protocol: URLPatternComponentResult;
  username: URLPatternComponentResult;
  password: URLPatternComponentResult;
  hostname: URLPatternComponentResult;
  port: URLPatternComponentResult;
  pathname: URLPatternComponentResult;
  search: URLPatternComponentResult;
  hash: URLPatternComponentResult;
}

declare class URLPattern {
  constructor(input: string | URLPatternInit, baseURL?: string);

  test(input: string | URLPatternInit): boolean;
  exec(input: string | URLPatternInit): URLPatternResult | null;

  readonly protocol: string;
  readonly username: string;
  readonly password: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
}
