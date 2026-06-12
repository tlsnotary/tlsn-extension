/**
 * Shared state between PlaywrightWindowManager and PlaywrightRequestInterceptor.
 *
 * Both implement separate `@tlsn/host-contracts` interfaces but must agree on
 * which Playwright `Page` corresponds to which `WindowHandle.id`, so we lift
 * that bookkeeping into one place and inject it into both.
 */

import type { Browser, BrowserContext, Page } from 'playwright';
import type { InterceptedRequestHeader } from '@tlsn/plugin-sdk';
import type { WindowHandle } from '@tlsn/host-contracts';

type HeaderSubscriber = (h: InterceptedRequestHeader) => void;
type CloseListener = () => void;

export interface PlaywrightStateOptions {
  /** A pre-built Browser instance (chromium.launch()). Owned by the adapter. */
  browser: Browser;
  /** A BrowserContext (browser.newContext({...})). Owned by the adapter. */
  context: BrowserContext;
}

export class PlaywrightState {
  readonly browser: Browser;
  readonly context: BrowserContext;

  private nextId = 1;
  readonly pages = new Map<number, Page>();
  readonly subscribers = new Map<number, Set<HeaderSubscriber>>();
  readonly closeListeners = new Map<number, Set<CloseListener>>();

  constructor(opts: PlaywrightStateOptions) {
    this.browser = opts.browser;
    this.context = opts.context;
  }

  assignId(): number {
    return this.nextId++;
  }

  registerPage(id: number, page: Page, url: string): WindowHandle {
    this.pages.set(id, page);
    this.subscribers.set(id, new Set());
    this.closeListeners.set(id, new Set());

    // Single page-wide route handler fans out to every subscriber. We use
    // `allHeaders()` so cookies that Chromium adds late in the network stack
    // are included, and we canonicalize header names (Title-Case) so plugin
    // filters that look for `Cookie` / `User-Agent` / etc. match the way
    // they do in the Chrome extension's `webRequest` API.
    page.route('**/*', async (route, request) => {
      const subs = this.subscribers.get(id);
      if (subs && subs.size > 0) {
        const all = await request.allHeaders();
        const requestHeaders = Object.entries(all)
          .filter(([name]) => !name.startsWith(':')) // strip HTTP/2 pseudo-headers
          .map(([name, value]) => ({ name: canonicalizeHeaderName(name), value }));
        const header: InterceptedRequestHeader = {
          id: cryptoRandomId(),
          method: request.method(),
          url: request.url(),
          timestamp: Date.now(),
          type: request.resourceType(),
          requestHeaders,
          tabId: id,
        };
        for (const cb of subs) {
          try {
            cb(header);
          } catch {
            // Swallow subscriber errors — one bad listener shouldn't drop the request.
          }
        }
      }
      await route.continue();
    });

    page.on('close', () => {
      const listeners = this.closeListeners.get(id);
      if (listeners) for (const l of listeners) l();
      this.pages.delete(id);
      this.subscribers.delete(id);
      this.closeListeners.delete(id);
    });

    return { id, url };
  }

  getPage(handle: WindowHandle): Page {
    const page = this.pages.get(handle.id);
    if (!page) throw new Error(`Window ${handle.id} is not open`);
    return page;
  }

  listHandles(): WindowHandle[] {
    return [...this.pages.entries()].map(([id, page]) => ({ id, url: page.url() }));
  }

  async dispose(): Promise<void> {
    await this.context.close().catch(() => {});
    await this.browser.close().catch(() => {});
    this.pages.clear();
    this.subscribers.clear();
    this.closeListeners.clear();
  }
}

function cryptoRandomId(): string {
  // node crypto.randomUUID is available since Node 14.17; we'll just use it
  // unconditionally — the CLI requires Node 20+ via @types/node and our build.
  return crypto.randomUUID();
}

/**
 * `cookie` → `Cookie`, `user-agent` → `User-Agent`, `accept-encoding` → `Accept-Encoding`.
 * Matches the canonical casing the Chrome extension's `webRequest` API
 * surfaces, which is what plugin filters expect.
 */
function canonicalizeHeaderName(name: string): string {
  return name
    .split('-')
    .map((part) => (part.length === 0 ? part : part[0].toUpperCase() + part.slice(1).toLowerCase()))
    .join('-');
}
