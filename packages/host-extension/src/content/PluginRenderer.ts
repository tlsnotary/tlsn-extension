/// <reference lib="dom" />
/**
 * PluginRenderer — converts the plugin-sdk DomJson tree into actual DOM
 * elements inside a host container, with the same allowlist, draggable
 * support, and click-handler bridge the extension's content script has
 * always had.
 *
 * Click events on any node with `options.onclick` invoke the supplied
 * `onPluginAction(onclick, windowId)` callback — the content script decides
 * how that flows back to the host (in practice: `browser.runtime.sendMessage`
 * with `{type: 'PLUGIN_UI_CLICK', onclick, windowId}`).
 */

import type { DomJson } from '@tlsn/plugin-sdk';
import { logger } from '@tlsn/common';

const ALLOWED_ELEMENT_TYPES = new Set([
  'div',
  'span',
  'p',
  'button',
  'input',
  'label',
  'a',
  'img',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'table',
  'tr',
  'td',
  'th',
  'thead',
  'tbody',
  'form',
  'select',
  'option',
  'textarea',
  'pre',
  'code',
  'strong',
  'em',
  'br',
  'hr',
]);

export type PluginActionHandler = (onclick: string, windowId: number) => void;

export interface RenderPluginUIOptions {
  /** Where to mount the plugin UI. Default: `#tlsn-plugin-container` under `document.body`. */
  containerId?: string;
  /** Called when a node with `options.onclick` is clicked. */
  onPluginAction: PluginActionHandler;
}

/**
 * Mount the plugin's DomJson tree in a container under `document.body`.
 * Preserves a previously-dragged position (the user moving the overlay
 * sets `bottom: 'auto'`) across re-renders.
 */
export function renderPluginUI(json: DomJson, windowId: number, opts: RenderPluginUIOptions): void {
  const containerId = opts.containerId ?? 'tlsn-plugin-container';
  let container = document.getElementById(containerId);
  if (!container) {
    const el = document.createElement('div');
    el.id = containerId;
    document.body.appendChild(el);
    container = el;
  }

  // Preserve drag position across re-renders.
  const prev = container.querySelector('[data-tlsn-draggable]') as HTMLElement | null;
  const savedPosition =
    prev && prev.style.bottom === 'auto' ? { top: prev.style.top, left: prev.style.left } : null;

  container.innerHTML = '';
  container.appendChild(createNode(json, windowId, opts.onPluginAction));

  if (savedPosition) {
    const el = container.querySelector('[data-tlsn-draggable]') as HTMLElement | null;
    if (el) {
      el.style.top = savedPosition.top;
      el.style.left = savedPosition.left;
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }
  }
}

/** Remove the plugin container from the page. */
export function unmountPluginUI(containerId = 'tlsn-plugin-container'): void {
  const container = document.getElementById(containerId);
  if (container) container.remove();
}

/** Build the DOM element tree for a single DomJson node. */
export function createNode(
  json: DomJson,
  windowId: number,
  onPluginAction: PluginActionHandler,
): HTMLElement | Text {
  if (typeof json === 'string') {
    return document.createTextNode(json);
  }

  if (!ALLOWED_ELEMENT_TYPES.has(json.type)) {
    logger.warn(`[host-extension] Blocked disallowed element type: ${json.type}`);
    return document.createTextNode('');
  }

  const node = document.createElement(json.type);

  if (json.options.className) node.className = json.options.className;
  if (json.options.id) node.id = json.options.id;

  if (json.options.style) {
    for (const [key, value] of Object.entries(json.options.style)) {
      (node.style as unknown as Record<string, string>)[key] = value;
    }
  }

  if (json.options.inputType) (node as HTMLInputElement).type = json.options.inputType;
  if (json.options.checked !== undefined) (node as HTMLInputElement).checked = json.options.checked;
  if (json.options.value !== undefined) (node as HTMLInputElement).value = json.options.value;
  if (json.options.placeholder) (node as HTMLInputElement).placeholder = json.options.placeholder;
  if (json.options.disabled !== undefined)
    (node as HTMLInputElement).disabled = json.options.disabled;

  if (json.options.onclick) {
    const onclickName = json.options.onclick;
    node.addEventListener('click', () => {
      onPluginAction(onclickName, windowId);
    });
  }

  for (const child of json.children) {
    node.appendChild(createNode(child, windowId, onPluginAction));
  }

  if (json.options.draggable) {
    node.dataset.tlsnDraggable = '';
    makeDraggable(node);
  }

  return node;
}

/** Make an element draggable by its first child (the header bar). */
export function makeDraggable(el: HTMLElement): void {
  const handle = el.firstElementChild as HTMLElement | null;
  if (!handle) return;

  handle.style.cursor = 'grab';
  let offsetX = 0;
  let offsetY = 0;

  const onMouseMove = (e: MouseEvent) => {
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

  handle.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
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
    e.preventDefault();
  });
}

export { ALLOWED_ELEMENT_TYPES };
