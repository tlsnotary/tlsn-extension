/// <reference lib="dom" />
/**
 * Inject the plugin's DomJson into the actual Playwright page (mirrors the
 * extension's content-script renderer in
 * `packages/extension/src/entries/Content/index.ts`).
 *
 * Two persistence tricks to survive in-page navigations (e.g. the user signing
 * in and the page jumping to a different URL):
 *
 *  1. `context.addInitScript` installs a script on every page load that
 *     creates the plugin container and defines `window.__tlsnRenderPluginUI`.
 *     So even after a fresh navigation, the rendering primitives are
 *     available before any plugin code runs.
 *
 *  2. The renderer caches the last DomJson per window and re-fires it on
 *     `framenavigated` so the plugin UI re-appears once the new page is
 *     loaded, even if the plugin's own re-render hasn't fired yet.
 *
 * Clicks on plugin UI elements are forwarded back to the host via Playwright's
 * `context.exposeFunction` mechanism, which the renderer calls
 * `__tlsnPluginClick(onclick, windowId)`. The host emits a
 * `PLUGIN_UI_CLICK` event so the SDK can route to the plugin's click handler.
 */

import type { BrowserContext, Page } from 'playwright';
import type {
  HostEventEmitter,
  PluginDomJson,
  PluginRenderer,
  WindowHandle,
} from '@tlsn/host-contracts';
import type { PlaywrightState } from './playwright-state.js';

const EXPOSED_FN = '__tlsnPluginClick';
const RENDER_FN = '__tlsnRenderPluginUI';

export class PlaywrightDomRenderer implements PluginRenderer {
  private exposed = false;
  private emitter: HostEventEmitter | null = null;
  private lastDom = new Map<number, PluginDomJson>();
  private navListenerInstalled = new WeakSet<Page>();

  constructor(private readonly state: PlaywrightState) {}

  /** Set the emitter that should receive PLUGIN_UI_CLICK events. */
  setEmitter(emitter: HostEventEmitter): void {
    this.emitter = emitter;
  }

  async ensureExposed(context: BrowserContext): Promise<void> {
    if (this.exposed) return;
    this.exposed = true;

    await context.exposeFunction(EXPOSED_FN, (onclick: string, windowId: number) => {
      this.emitter?.emit({ type: 'PLUGIN_UI_CLICK', onclick, windowId });
    });

    // This script runs as the very first thing on every new page in the
    // context — even before <body> exists. It defines `__tlsnRenderPluginUI`
    // and a tiny createNode helper, then waits for the document to be ready
    // before mounting the container.
    await context.addInitScript({ content: pageInitScript(RENDER_FN, EXPOSED_FN) });
  }

  render(handle: WindowHandle, dom: PluginDomJson): void {
    this.lastDom.set(handle.id, dom);
    const page = this.state.pages.get(handle.id);
    if (!page) return;
    this.installNavListener(page, handle.id);
    this.injectInto(page, handle.id, dom).catch(() => {
      // Best-effort — the page may be mid-navigation. The framenavigated
      // listener will re-fire the cached DomJson once it settles.
    });
  }

  unmount(handle: WindowHandle): void {
    this.lastDom.delete(handle.id);
    const page = this.state.pages.get(handle.id);
    if (!page) return;
    page
      .evaluate(() => {
        const c = document.getElementById('tlsn-plugin-container');
        if (c) c.remove();
      })
      .catch(() => {});
  }

  private installNavListener(page: Page, windowId: number): void {
    if (this.navListenerInstalled.has(page)) return;
    this.navListenerInstalled.add(page);
    page.on('framenavigated', async (frame) => {
      if (frame !== page.mainFrame()) return;
      const last = this.lastDom.get(windowId);
      if (!last) return;
      try {
        // Wait until the new page can run scripts before trying to inject.
        await page.waitForLoadState('domcontentloaded', { timeout: 10_000 });
        await this.injectInto(page, windowId, last);
      } catch {
        // Page navigated again or closed; leave it.
      }
    });
  }

  private async injectInto(page: Page, windowId: number, dom: PluginDomJson): Promise<void> {
    await page.evaluate(
      ({ dom: domArg, windowId: wid, fnName }: { dom: unknown; windowId: number; fnName: string }) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const render = (window as any)[fnName];
        if (typeof render === 'function') render(domArg, wid);
      },
      { dom, windowId, fnName: RENDER_FN },
    );
  }
}

function pageInitScript(renderFnName: string, clickFnName: string): string {
  // Self-contained script. Runs in the page context before any other script.
  return `
    (function() {
      const ALLOWED = new Set(['div', 'button', 'input', 'p', 'span', 'h1', 'h2', 'h3']);

      function createNode(json, wid) {
        if (typeof json === 'string') return document.createTextNode(json);
        if (!json || typeof json !== 'object' || !ALLOWED.has(json.type)) {
          return document.createTextNode('');
        }
        const el = document.createElement(json.type);
        const opts = json.options || {};
        if (opts.className) el.className = opts.className;
        if (opts.id) el.id = opts.id;
        if (opts.style) {
          for (const k of Object.keys(opts.style)) {
            el.style[k] = opts.style[k];
          }
        }
        if (opts.inputType) el.type = opts.inputType;
        if (opts.checked !== undefined) el.checked = opts.checked;
        if (opts.value !== undefined) el.value = opts.value;
        if (opts.placeholder) el.placeholder = opts.placeholder;
        if (opts.disabled !== undefined) el.disabled = opts.disabled;
        if (opts.onclick) {
          el.addEventListener('click', function() {
            if (typeof window['${clickFnName}'] === 'function') {
              window['${clickFnName}'](opts.onclick, wid);
            }
          });
        }
        if (Array.isArray(json.children)) {
          for (const child of json.children) el.appendChild(createNode(child, wid));
        }
        return el;
      }

      function ensureContainer() {
        if (!document.body) return null;
        let container = document.getElementById('tlsn-plugin-container');
        if (!container) {
          container = document.createElement('div');
          container.id = 'tlsn-plugin-container';
          document.body.appendChild(container);
        }
        return container;
      }

      window['${renderFnName}'] = function(dom, windowId) {
        const apply = () => {
          const container = ensureContainer();
          if (!container) {
            // body not ready yet; retry shortly
            setTimeout(apply, 30);
            return;
          }
          container.innerHTML = '';
          container.appendChild(createNode(dom, windowId));
        };
        apply();
      };
    })();
  `;
}
