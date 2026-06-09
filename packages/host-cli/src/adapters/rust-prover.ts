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

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ProveProgressData,
  ProveRequest,
  ProverClient,
  ProverOptions,
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

  async prove(
    req: ProveRequest,
    opts: ProverOptions,
    _onProgress?: (p: ProveProgressData) => void,
  ): Promise<unknown> {
    const input = {
      request: {
        url: req.url,
        method: req.method,
        headers: Object.entries(req.headers ?? {}).map(([name, value]) => ({ name, value })),
        body: req.body,
      },
      options: {
        verifierUrl: opts.verifierUrl,
        maxSentData: opts.maxSentData ?? 4096,
        maxRecvData: opts.maxRecvData ?? 16384,
        handlers: translateHandlers(opts.handlers ?? []),
        mode: null,
      },
    };

    const stdout = await spawnAndCollect(this.binary, JSON.stringify(input), this.timeoutMs);
    let parsed: { status: string; error?: string; [k: string]: unknown };
    try {
      parsed = JSON.parse(stdout) as { status: string; error?: string };
    } catch (e) {
      throw new Error(
        `tlsn-prover returned non-JSON output (length ${stdout.length}): ${stdout.slice(0, 200)}`,
      );
    }
    if (parsed.status === 'err') {
      throw new Error(`tlsn-prover: ${parsed.error}`);
    }
    return parsed;
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
