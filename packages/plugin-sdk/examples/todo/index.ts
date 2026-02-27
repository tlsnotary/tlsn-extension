import Host from '../../src/index';
import type { DomJson, WindowMessage } from '../../src/types';
import { todoPluginCode } from './plugin';

// ============================================================
// Console Logger
// ============================================================

type ConsoleEntryType = 'info' | 'error' | 'success' | 'event';

function getTimestamp(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function addConsoleEntry(message: string, type: ConsoleEntryType = 'info'): void {
  const output = document.getElementById('console-output');
  if (!output) return;

  const entry = document.createElement('div');
  entry.className = `console-entry ${type}`;

  const ts = document.createElement('span');
  ts.className = 'console-timestamp';
  ts.textContent = `[${getTimestamp()}]`;

  const msg = document.createElement('span');
  msg.className = 'console-message';
  msg.textContent = message;

  entry.appendChild(ts);
  entry.appendChild(msg);
  output.appendChild(entry);

  output.scrollTop = output.scrollHeight;
}

function clearConsole(): void {
  const output = document.getElementById('console-output');
  if (output) output.innerHTML = '';
  addConsoleEntry('Console cleared.', 'info');
}

// ============================================================
// Status Management
// ============================================================

type Status = 'idle' | 'running' | 'done' | 'error';

function setStatus(status: Status, detail?: string): void {
  const dot = document.getElementById('status-dot');
  const text = document.getElementById('status-text');
  const btn = document.getElementById('run-btn') as HTMLButtonElement | null;

  if (dot) {
    dot.className = status === 'idle' ? '' : status;
  }

  const labels: Record<Status, string> = {
    idle: 'Idle',
    running: 'Running...',
    done: detail ? `Done (${detail})` : 'Done',
    error: detail ? `Error: ${detail}` : 'Error',
  };
  if (text) text.textContent = labels[status];
  if (btn) btn.disabled = status === 'running';
}

// ============================================================
// Event Emitter (fresh per run, with logging)
// ============================================================

type EventListener = (msg: WindowMessage) => void;

function createEventEmitter() {
  const listeners: EventListener[] = [];

  const eventEmitter = {
    addListener: (fn: EventListener) => {
      listeners.push(fn);
    },
    removeListener: (fn: EventListener) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
    emit: (msg: WindowMessage) => {
      const msgType = (msg as any).type as string; // eslint-disable-line @typescript-eslint/no-explicit-any
      // Log events but skip noisy internal re-render bridge messages
      if (msgType !== 'TO_BG_RE_RENDER_PLUGIN_UI') {
        addConsoleEntry(`Event: ${msgType}`, 'event');
      }
      [...listeners].forEach((fn) => fn(msg));
    },
  };

  // Re-render bridge: converts setState's message into a re-render trigger
  eventEmitter.addListener(((msg: any) => {
    // eslint-disable-line @typescript-eslint/no-explicit-any
    if (msg.type === 'TO_BG_RE_RENDER_PLUGIN_UI') {
      addConsoleEntry('State changed, scheduling re-render...', 'info');
      setTimeout(() => {
        eventEmitter.emit({
          type: 'RE_RENDER_PLUGIN_UI',
          windowId: msg.windowId || 1,
        } as WindowMessage);
      }, 10);
    }
  }) as EventListener);

  return eventEmitter;
}

// ============================================================
// DOM Renderer
// ============================================================

let activeEventEmitter: ReturnType<typeof createEventEmitter> | null = null;

function createNode(json: DomJson, windowId: number): HTMLElement | Text {
  if (typeof json === 'string') {
    return document.createTextNode(json);
  }

  const node = document.createElement(json.type);

  if (json.options.className) node.className = json.options.className;
  if (json.options.id) node.id = json.options.id;
  if (json.options.style) {
    Object.entries(json.options.style).forEach(([key, value]) => {
      (node.style as any)[key] = value; // eslint-disable-line @typescript-eslint/no-explicit-any
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
      addConsoleEntry(`Click: ${onclickName}`, 'event');
      if (activeEventEmitter) {
        activeEventEmitter.emit({
          type: 'PLUGIN_UI_CLICK',
          onclick: onclickName,
          windowId,
        } as WindowMessage);
      }
    });
  }

  json.children.forEach((child) => {
    node.appendChild(createNode(child, windowId));
  });

  return node;
}

function renderPluginUI(_windowId: number, json: DomJson): void {
  const container = document.getElementById('plugin-container');
  if (!container) return;
  container.innerHTML = '';
  container.appendChild(createNode(json, 1));
  addConsoleEntry('Plugin UI rendered', 'info');
}

// ============================================================
// Run Plugin
// ============================================================

let runCount = 0;

async function runPlugin(): Promise<void> {
  runCount++;
  const runId = runCount;

  addConsoleEntry(`--- Run #${runId} ---`, 'success');
  addConsoleEntry('Initializing QuickJS sandbox...', 'info');
  setStatus('running');

  // Clear plugin container
  const container = document.getElementById('plugin-container');
  if (container) {
    container.innerHTML = '<div id="idle-message">Loading QuickJS sandbox...</div>';
  }

  // Create fresh event emitter
  const eventEmitter = createEventEmitter();
  activeEventEmitter = eventEmitter;

  const startTime = performance.now();

  // Create Host with logging wrappers
  const host = new Host({
    onProve: async (requestOptions) => {
      addConsoleEntry(`prove() called: ${requestOptions.method} ${requestOptions.url}`, 'event');
      return { proof: 'not-used-in-demo' };
    },
    onRenderPluginUi: renderPluginUI,
    onCloseWindow: (windowId) => {
      addConsoleEntry(`Window ${windowId} closed`, 'event');
    },
    onOpenWindow: async (url) => {
      addConsoleEntry(`openWindow("${url}") \u2192 windowId: 1`, 'event');
      return {
        type: 'WINDOW_OPENED' as const,
        payload: { windowId: 1, uuid: `todo-run-${runId}`, tabId: 1 },
      };
    },
  });

  // Inject getInputValue capability
  host.addCapability('getInputValue', (id: string): string => {
    const el = document.querySelector<HTMLInputElement>(`#${id}`);
    return el?.value || '';
  });

  addConsoleEntry('Executing plugin code...', 'info');

  try {
    const result = await host.executePlugin(todoPluginCode, { eventEmitter });
    const elapsed = (performance.now() - startTime).toFixed(0);

    // Plugin called done() — clear plugin UI
    if (container) {
      container.innerHTML =
        '<div id="idle-message">Plugin completed. Click "Run Plugin" to start again.</div>';
    }

    addConsoleEntry(`Plugin completed in ${elapsed}ms`, 'success');

    if (result !== undefined) {
      addConsoleEntry(`Result: ${JSON.stringify(result, null, 2)}`, 'success');
    }

    setStatus('done', `${elapsed}ms`);
  } catch (error: unknown) {
    const elapsed = (performance.now() - startTime).toFixed(0);
    const message = error instanceof Error ? error.message : String(error);

    if (container) {
      container.innerHTML =
        '<div id="idle-message" style="color: #ef5350;">Plugin error. Click "Run Plugin" to retry.</div>';
    }

    addConsoleEntry(`Plugin error after ${elapsed}ms: ${message}`, 'error');
    setStatus('error', message.slice(0, 60));
  }

  activeEventEmitter = null;
}

// ============================================================
// Initialization
// ============================================================

const runBtn = document.getElementById('run-btn');
if (runBtn) runBtn.addEventListener('click', runPlugin);

const clearBtn = document.getElementById('clear-btn');
if (clearBtn) clearBtn.addEventListener('click', clearConsole);

addConsoleEntry('Ready. Click "Run Plugin" to start.', 'success');
