/**
 * Real ProverClient backed by the `tlsn-prover` Rust binary. Replaces the
 * stub `NullProverClient` once the binary is built and available on disk.
 *
 * Binary discovery (first match wins):
 *  1. `TLSN_PROVER_BIN` env var
 *  2. `./packages/tlsn-mobile/target/release/tlsn-prover` from process.cwd()
 *  3. `tlsn-prover` on $PATH (lets a globally-installed binary work)
 *
 * Wire protocol matches what the bin expects — see
 * `packages/tlsn-mobile/src/bin/tlsn_prover.rs`. We translate the SDK's
 * SCREAMING_SNAKE_CASE Handler descriptors to the NativeHandler PascalCase
 * shape the Rust side deserializes via serde.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

/** A spawned tlsn-prover with stdin (pipe) + stdout (pipe). Stderr is inherited. */
interface ChildIO extends ChildProcess {
  stdin: Writable;
  stdout: Readable;
}
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ProveProgressData,
  ProveRequest,
  ProverClient,
  ProverOptions,
  RevealPreparation,
} from '@tlsn/host-contracts';
import { translateHandlers } from '../handler-translation.js';

export interface RustProverClientOptions {
  /** Path to the tlsn-prover binary; defaults to TLSN_PROVER_BIN or the monorepo target dir. */
  binary?: string;
  /** Timeout for a single prove call (ms). Default 5 min. */
  timeoutMs?: number;
}

export class RustProverClient implements ProverClient {
  private readonly binary: string;
  private readonly timeoutMs: number;

  constructor(opts: RustProverClientOptions = {}) {
    this.binary = opts.binary ?? resolveBinary();
    this.timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  }

  /**
   * One-shot prove (single bin invocation, single command).
   */
  async prove(
    req: ProveRequest,
    opts: ProverOptions,
    _onProgress?: (p: ProveProgressData) => void,
  ): Promise<unknown> {
    const cmd = {
      command: 'prove',
      request: requestForWire(req),
      options: optionsForWire(opts),
    };
    return runSingleShot(this.binary, cmd, this.timeoutMs);
  }

  /**
   * Two-phase prove: starts a long-lived bin process, runs `prove_until_reveal`,
   * stashes the child so a subsequent `proveFinalize` can drive the same process.
   */
  async proveUntilReveal(
    req: ProveRequest,
    opts: ProverOptions,
    _onProgress?: (p: ProveProgressData) => void,
  ): Promise<RevealPreparation> {
    const child = spawn(this.binary, [], { stdio: ['pipe', 'pipe', 'inherit'] }) as ChildIO;
    const reader = new LineReader(child);

    const cmd = {
      command: 'prove_until_reveal',
      request: requestForWire(req),
      options: optionsForWire(opts),
    };
    child.stdin.write(JSON.stringify(cmd) + '\n');

    const line = await reader.readLine(this.timeoutMs);
    const parsed = JSON.parse(line) as
      | { status: 'reveal'; sessionId: string; response: unknown; descriptors: unknown[] }
      | { status: 'err'; error: string };
    if (parsed.status === 'err') {
      child.kill();
      throw new Error(`tlsn-prover: ${parsed.error}`);
    }

    // Park the child + reader on the session id so proveFinalize can find it.
    this.pendingSessions.set(parsed.sessionId, { child, reader });
    return {
      sessionId: parsed.sessionId,
      descriptors: (parsed.descriptors as unknown[]) as RevealPreparation['descriptors'],
      response: typeof parsed.response === 'string' ? parsed.response : JSON.stringify(parsed.response),
    };
  }

  async proveFinalize(sessionId: string, approved: boolean): Promise<unknown> {
    const slot = this.pendingSessions.get(sessionId);
    if (!slot) throw new Error(`tlsn-prover: no pending session ${sessionId}`);
    this.pendingSessions.delete(sessionId);

    const cmd = { command: 'prove_finalize', sessionId, approved };
    slot.child.stdin.write(JSON.stringify(cmd) + '\n');
    slot.child.stdin.end();

    const line = await slot.reader.readLine(this.timeoutMs);
    const parsed = JSON.parse(line) as { status: string; error?: string };
    if (parsed.status === 'err') throw new Error(`tlsn-prover: ${parsed.error}`);
    return parsed;
  }

  private pendingSessions = new Map<
    string,
    { child: ChildIO; reader: LineReader }
  >();
}

function requestForWire(req: ProveRequest) {
  return {
    url: req.url,
    method: req.method,
    headers: Object.entries(req.headers ?? {}).map(([name, value]) => ({ name, value })),
    body: req.body,
  };
}

function optionsForWire(opts: ProverOptions) {
  return {
    verifierUrl: opts.verifierUrl,
    maxSentData: opts.maxSentData ?? 4096,
    maxRecvData: opts.maxRecvData ?? 16384,
    handlers: translateHandlers(opts.handlers ?? []),
    mode: null,
  };
}

async function runSingleShot(
  binary: string,
  cmd: Record<string, unknown>,
  timeoutMs: number,
): Promise<unknown> {
  const stdout = await spawnAndCollect(binary, JSON.stringify(cmd) + '\n', timeoutMs);
  let parsed: { status: string; error?: string; [k: string]: unknown };
  try {
    parsed = JSON.parse(stdout) as { status: string; error?: string };
  } catch {
    throw new Error(
      `tlsn-prover returned non-JSON output (length ${stdout.length}): ${stdout.slice(0, 200)}`,
    );
  }
  if (parsed.status === 'err') throw new Error(`tlsn-prover: ${parsed.error}`);
  return parsed;
}

/**
 * Buffers child stdout into newline-delimited JSON lines.
 */
class LineReader {
  private buffer = '';
  private pending: Array<{ resolve: (line: string) => void; reject: (err: Error) => void }> = [];
  private done = false;
  private error: Error | null = null;

  constructor(child: ChildIO) {
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.drain();
    });
    child.once('exit', () => {
      this.done = true;
      this.drain();
    });
    child.once('error', (err) => {
      this.error = err;
      this.drain();
    });
  }

  readLine(timeoutMs: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`tlsn-prover line read timed out`)), timeoutMs);
      const wrappedResolve = (l: string) => {
        clearTimeout(timer);
        resolve(l);
      };
      const wrappedReject = (e: Error) => {
        clearTimeout(timer);
        reject(e);
      };
      this.pending.push({ resolve: wrappedResolve, reject: wrappedReject });
      this.drain();
    });
  }

  private drain(): void {
    if (this.error) {
      for (const p of this.pending.splice(0)) p.reject(this.error);
      return;
    }
    while (this.pending.length > 0) {
      const nl = this.buffer.indexOf('\n');
      if (nl === -1) {
        if (this.done) {
          for (const p of this.pending.splice(0)) p.reject(new Error('tlsn-prover exited without response'));
        }
        return;
      }
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      const p = this.pending.shift();
      if (p) p.resolve(line);
    }
  }
}

export function resolveBinary(): string {
  const env = process.env.TLSN_PROVER_BIN;
  if (env && existsSync(env)) return env;
  for (const candidate of candidatePaths()) {
    if (existsSync(candidate)) return candidate;
  }
  return 'tlsn-prover';
}

/**
 * Hunt for `tlsn-prover` in likely places. Checks (in order):
 *  - <cwd>/packages/tlsn-mobile/target/release/tlsn-prover (monorepo root)
 *  - relative to this file walking up to find a `packages/tlsn-mobile/target` dir
 *    (works when running from any monorepo subdirectory)
 */
function candidatePaths(): string[] {
  const out: string[] = [
    resolve(process.cwd(), 'packages/tlsn-mobile/target/release/tlsn-prover'),
  ];
  // Walk up from this source file until we find a packages/ sibling.
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8 && dir !== '/'; i++) {
    out.push(resolve(dir, 'packages/tlsn-mobile/target/release/tlsn-prover'));
    out.push(resolve(dir, '../tlsn-mobile/target/release/tlsn-prover'));
    dir = dirname(dir);
  }
  return out;
}

function spawnAndCollect(binary: string, input: string, timeoutMs: number): Promise<string> {
  return new Promise<string>((resolveResult, reject) => {
    const child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'inherit'] });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));

    const t = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`tlsn-prover timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.once('error', (err) => {
      clearTimeout(t);
      reject(err);
    });
    child.once('exit', (code) => {
      clearTimeout(t);
      if (code !== 0) {
        reject(new Error(`tlsn-prover exited with code ${code}; stdout: ${stdout.slice(0, 500)}`));
        return;
      }
      resolveResult(stdout.trim());
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}
