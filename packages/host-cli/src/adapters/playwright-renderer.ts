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
    this.maybeStartCloseCountdown(handle, dom);
  }

  /**
   * The SDK's doneWithOverlay renders a static "This window will close shortly."
   * message and fires onCloseWindow after `delayMs` (2s default). We swap the
   * static text for a ticking "Closing in Ns…" by mutating the DomJson and
   * re-firing render() each second. Detected by the presence of "close shortly"
   * anywhere in the tree.
   */
  private maybeStartCloseCountdown(handle: WindowHandle, dom: PluginDomJson): void {
    if (!containsText(dom, 'close shortly')) return;
    const windowId = handle.id;
    let remaining = 2;
    if (this.countdownTimers.has(windowId)) {
      clearInterval(this.countdownTimers.get(windowId));
    }
    const tick = () => {
      const decorated = replaceText(
        dom,
        'This window will close shortly.',
        `Closing in ${remaining}s…`,
      );
      const page = this.state.pages.get(windowId);
      if (!page || page.isClosed()) {
        const t = this.countdownTimers.get(windowId);
        if (t) clearInterval(t);
        this.countdownTimers.delete(windowId);
        return;
      }
      this.injectInto(page, windowId, decorated).catch(() => {});
      remaining--;
      if (remaining < 0) {
        const t = this.countdownTimers.get(windowId);
        if (t) clearInterval(t);
        this.countdownTimers.delete(windowId);
      }
    };
    tick();
    this.countdownTimers.set(windowId, setInterval(tick, 1000));
  }

  private countdownTimers = new Map<number, ReturnType<typeof setInterval>>();

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

/** Walk a DomJson tree and return true if any text node contains `needle`. */
function containsText(dom: unknown, needle: string): boolean {
  if (typeof dom === 'string') return dom.includes(needle);
  if (!dom || typeof dom !== 'object') return false;
  const node = dom as { children?: unknown[] };
  if (Array.isArray(node.children)) {
    for (const child of node.children) if (containsText(child, needle)) return true;
  }
  return false;
}

/** Return a deep-cloned copy of the DomJson tree with `from` text replaced by `to`. */
function replaceText(dom: unknown, from: string, to: string): unknown {
  if (typeof dom === 'string') return dom === from ? to : dom;
  if (!dom || typeof dom !== 'object') return dom;
  const node = dom as { type?: unknown; options?: unknown; children?: unknown[] };
  return {
    type: node.type,
    options: node.options,
    children: Array.isArray(node.children) ? node.children.map((c) => replaceText(c, from, to)) : node.children,
  };
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
        if (opts.draggable) {
          el.dataset.tlsnDraggable = '';
          makeDraggable(el);
        }
        return el;
      }

      // Port of the extension's makeDraggable (see packages/extension/src/entries/Content/index.ts).
      function makeDraggable(el) {
        const handle = el.firstElementChild;
        if (!handle) return;
        handle.style.cursor = 'grab';
        let offsetX = 0;
        let offsetY = 0;
        const onMouseMove = (e) => {
          const x = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth - el.offsetWidth));
          const y = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - el.offsetHeight));
          el.style.left = x + 'px';
          el.style.top = y + 'px';
        };
        const onMouseUp = () => {
          handle.style.cursor = 'grab';
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        };
        handle.addEventListener('mousedown', (e) => {
          if (e.button !== 0 || e.target.closest('button')) return;
          handle.style.cursor = 'grabbing';
          const rect = el.getBoundingClientRect();
          el.style.top = rect.top + 'px';
          el.style.left = rect.left + 'px';
          el.style.bottom = 'auto';
          el.style.right = 'auto';
          offsetX = e.clientX - rect.left;
          offsetY = e.clientY - rect.top;
          document.addEventListener('mousemove', onMouseMove);
          document.addEventListener('mouseup', onMouseUp);
        });
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
            setTimeout(apply, 30);
            return;
          }
          // Preserve drag position across re-renders (extension does the same).
          const prev = container.querySelector('[data-tlsn-draggable]');
          const savedPosition =
            prev && prev.style.bottom === 'auto'
              ? { top: prev.style.top, left: prev.style.left }
              : null;
          container.innerHTML = '';
          container.appendChild(createNode(dom, windowId));
          if (savedPosition) {
            const el = container.querySelector('[data-tlsn-draggable]');
            if (el) {
              el.style.top = savedPosition.top;
              el.style.left = savedPosition.left;
              el.style.bottom = 'auto';
              el.style.right = 'auto';
            }
          }
        };
        apply();
      };
    })();
  `;
}
