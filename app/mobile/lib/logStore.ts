/**
 * logStore
 *
 * In-memory ring buffer of log entries that backs the in-app Logs screen.
 * Everything that should be visible to a user debugging a failed prove writes
 * here: patched `console.*` calls (see `installLogCapture`) and native Rust
 * `tracing` lines drained from the native buffer (see `NativeProver`).
 *
 * The store is a module singleton so logs survive screen navigation — the
 * Logs screen mounts/unmounts but the buffer persists. It exposes a
 * `useSyncExternalStore`-compatible (`subscribe` + `getSnapshot`) API.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource = 'js' | 'native';

export interface LogEntry {
  /** Monotonically increasing id, stable list key. */
  id: number;
  /** Epoch ms when the entry was recorded. */
  ts: number;
  level: LogLevel;
  /** Origin: JS (patched console) or native Rust (tracing bridge). */
  source: LogSource;
  /** Optional tag, e.g. `NativeProver` parsed from a `[NativeProver]` prefix,
   *  or the Rust tracing target for native logs. */
  tag?: string;
  text: string;
}

/** Keep the buffer bounded so a long-running session can't exhaust memory. */
export const MAX_ENTRIES = 1000;

let entries: LogEntry[] = [];
let snapshot: readonly LogEntry[] = entries;
let nextId = 1;

const listeners = new Set<() => void>();

function emitToListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

let notifyScheduled = false;

/**
 * Coalesce notifications: a burst of `addLog` calls — draining many native
 * lines in one tick, or a console-warning storm — schedules a single re-render
 * on the next tick instead of one per entry. This bounds render frequency and
 * breaks any render→console→capture→render feedback loop.
 */
function scheduleNotify(): void {
  if (notifyScheduled) return;
  notifyScheduled = true;
  setTimeout(() => {
    notifyScheduled = false;
    emitToListeners();
  }, 0);
}

/** Append a log entry, dropping the oldest once the buffer is full. */
export function addLog(entry: Omit<LogEntry, 'id' | 'ts'> & { ts?: number }): void {
  const next: LogEntry = {
    id: nextId++,
    ts: entry.ts ?? Date.now(),
    level: entry.level,
    source: entry.source,
    tag: entry.tag,
    text: entry.text,
  };
  // New array reference (not in-place mutation) so the snapshot identity changes.
  entries = entries.length >= MAX_ENTRIES ? [...entries.slice(1), next] : [...entries, next];
  snapshot = entries; // keep getSnapshot current immediately; re-render is coalesced
  scheduleNotify();
}

/** Remove all entries (immediate). */
export function clearLogs(): void {
  entries = [];
  snapshot = entries;
  emitToListeners();
}

/** Current immutable snapshot — safe to use as a `useSyncExternalStore` getSnapshot. */
export function getLogs(): readonly LogEntry[] {
  return snapshot;
}

/** Subscribe to changes; returns an unsubscribe fn. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
};

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Render one entry as a single log line. */
export function formatEntry(e: LogEntry): string {
  const tag = e.tag ? ` [${e.tag}]` : '';
  const src = e.source === 'native' ? ' [native]' : '';
  return `[${formatTimestamp(e.ts)}] [${LEVEL_LABEL[e.level]}]${src}${tag} ${e.text}`;
}

/** Render the given entries as plain text, for Copy / Share. */
export function formatLogs(list: readonly LogEntry[]): string {
  return list.map(formatEntry).join('\n');
}
