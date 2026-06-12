/**
 * installLogCapture
 *
 * Patches the global `console.*` methods so every log the app (or any library,
 * including the `@tlsn/common` logger which writes through `console.*`) emits
 * is also teed into `logStore` for the in-app Logs screen. The original
 * console methods are always called too, so Metro / Xcode / logcat output is
 * unchanged.
 *
 * Call once, as early as possible (top of the root layout module).
 */
import { addLog, type LogLevel } from './logStore';

let installed = false;

/** Pull a leading `[Tag]` off the first string arg, returning [tag, rest]. */
function extractTag(first: unknown): [string | undefined, string | undefined] {
  if (typeof first !== 'string') return [undefined, undefined];
  const match = first.match(/^\s*\[([^\]]+)\]\s*(.*)$/s);
  if (!match) return [undefined, first];
  return [match[1], match[2]];
}

/** Stringify a single console argument for display. */
function stringifyArg(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
  if (arg === undefined) return 'undefined';
  if (arg === null) return 'null';
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function formatArgs(args: unknown[]): { tag?: string; text: string } {
  if (args.length === 0) return { text: '' };
  const [tag, rest] = extractTag(args[0]);
  const head = rest !== undefined ? rest : stringifyArg(args[0]);
  const tail = args.slice(1).map(stringifyArg);
  const parts = head ? [head, ...tail] : tail;
  return { tag, text: parts.join(' ') };
}

export function installLogCapture(): void {
  if (installed) return;
  installed = true;

  const wrap =
    (level: LogLevel, original: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      try {
        const { tag, text } = formatArgs(args);
        addLog({ source: 'js', level, tag, text });
      } catch {
        // Never let log capture break the app or swallow the real log.
      }
      original(...args);
    };

  console.log = wrap('info', console.log.bind(console));
  console.info = wrap('info', console.info.bind(console));
  console.warn = wrap('warn', console.warn.bind(console));
  console.error = wrap('error', console.error.bind(console));
  console.debug = wrap('debug', console.debug.bind(console));
}
