import Host from '../../src/index';
import type { DomJson, WindowMessage } from '../../src/types';
import { todoPluginCode } from './plugin';

// --- Event emitter (same pattern as browser tests) ---

type EventListener = (msg: WindowMessage) => void;
const listeners: EventListener[] = [];
const eventEmitter = {
  addListener: (fn: EventListener) => listeners.push(fn),
  removeListener: (fn: EventListener) => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  },
  emit: (msg: WindowMessage) => {
    [...listeners].forEach((fn) => fn(msg));
  },
};

// Re-render bridge: converts setState's TO_BG_RE_RENDER_PLUGIN_UI → RE_RENDER_PLUGIN_UI
eventEmitter.addListener(((msg: any) => {
  if (msg.type === 'TO_BG_RE_RENDER_PLUGIN_UI') {
    setTimeout(() => {
      eventEmitter.emit({
        type: 'RE_RENDER_PLUGIN_UI',
        windowId: msg.windowId || 1,
      } as WindowMessage);
    }, 10);
  }
}) as EventListener);

// --- DOM renderer (mirrors Content script's createNode) ---

function createNode(json: DomJson, windowId: number): HTMLElement | Text {
  if (typeof json === 'string') {
    return document.createTextNode(json);
  }

  const node = document.createElement(json.type);

  if (json.options.className) node.className = json.options.className;
  if (json.options.id) node.id = json.options.id;
  if (json.options.style) {
    Object.entries(json.options.style).forEach(([key, value]) => {
      (node.style as any)[key] = value;
    });
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
      eventEmitter.emit({
        type: 'PLUGIN_UI_CLICK',
        onclick: onclickName,
        windowId,
      } as WindowMessage);
    });
  }

  json.children.forEach((child) => {
    node.appendChild(createNode(child, windowId));
  });

  return node;
}

function renderPluginUI(_windowId: number, json: DomJson) {
  const container = document.getElementById('plugin-container');
  if (!container) return;
  container.innerHTML = '';
  container.appendChild(createNode(json, 1));
}

// --- Host setup ---

const host = new Host({
  onProve: async () => ({ proof: 'not-used' }),
  onRenderPluginUi: renderPluginUI,
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onCloseWindow: () => {},
  onOpenWindow: async () => ({
    type: 'WINDOW_OPENED' as const,
    payload: { windowId: 1, uuid: 'standalone-todo', tabId: 1 },
  }),
});

// Inject getInputValue capability so the plugin can read text inputs from the DOM
host.addCapability('getInputValue', (id: string): string => {
  const el = document.querySelector<HTMLInputElement>(`#${id}`);
  return el?.value || '';
});

// --- Execute plugin ---

console.log('[todo] Starting plugin...');
host
  .executePlugin(todoPluginCode, { eventEmitter })
  .then((result) => {
    console.log('[todo] Plugin completed:', result);
  })
  .catch((error) => {
    console.error('[todo] Plugin error:', error);
  });
