/**
 * Vitest global setup: starts the Rust verifier server before browser tests
 * and kills it after all tests complete.
 *
 * Environment variables:
 *   VERIFIER_BIN    - Path to pre-built verifier binary. If set, uses it
 *                     directly instead of `cargo run`.
 *   VERIFIER_PORT   - Port for the verifier server (default: 17147).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERIFIER_PORT = parseInt(process.env.VERIFIER_PORT || '17147', 10);
const HEALTH_URL = `http://127.0.0.1:${VERIFIER_PORT}/health`;
const STARTUP_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 500;

let serverProcess: ChildProcess | null = null;

async function waitForHealth(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const text = await resp.text();
        if (text === 'ok') return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    `Verifier server did not become healthy at ${url} within ${timeoutMs}ms`,
  );
}

/**
 * Finds the verifier binary. Priority:
 * 1. VERIFIER_BIN env var (explicit path)
 * 2. Pre-built binary in target/release or target/debug
 * 3. Falls back to `cargo run`
 */
function findVerifierBin(
  verifierDir: string,
): { cmd: string; args: string[] } | null {
  if (process.env.VERIFIER_BIN) {
    const bin = process.env.VERIFIER_BIN;
    if (fs.existsSync(bin)) {
      return { cmd: bin, args: [] };
    }
    console.warn(
      `[globalSetup] VERIFIER_BIN=${bin} does not exist, falling back`,
    );
  }

  // Check for pre-built binaries.
  // Prefer the binary whose mtime is newer (most likely to include latest code changes).
  const releaseBin = path.join(
    verifierDir,
    'target/release/tlsn-verifier-server',
  );
  const debugBin = path.join(verifierDir, 'target/debug/tlsn-verifier-server');

  const releaseExists = fs.existsSync(releaseBin);
  const debugExists = fs.existsSync(debugBin);

  if (releaseExists && debugExists) {
    const releaseMtime = fs.statSync(releaseBin).mtimeMs;
    const debugMtime = fs.statSync(debugBin).mtimeMs;
    return debugMtime > releaseMtime
      ? { cmd: debugBin, args: [] }
      : { cmd: releaseBin, args: [] };
  }
  if (releaseExists) return { cmd: releaseBin, args: [] };
  if (debugExists) return { cmd: debugBin, args: [] };

  return null; // Will use cargo run
}

export async function setup(): Promise<void> {
  // Check if the server is already running (handles double-invocation by Vitest)
  try {
    const resp = await fetch(HEALTH_URL);
    if (resp.ok && (await resp.text()) === 'ok') {
      console.log(
        `[globalSetup] Verifier already running on port ${VERIFIER_PORT}, skipping start`,
      );
      return;
    }
  } catch {
    // Not running yet — proceed to start it
  }

  const verifierDir = path.resolve(__dirname, '../../../verifier');

  console.log(
    `[globalSetup] Starting verifier server on port ${VERIFIER_PORT}...`,
  );

  const bin = findVerifierBin(verifierDir);

  const env = {
    ...process.env,
    PORT: String(VERIFIER_PORT),
    RUST_LOG: process.env.RUST_LOG || 'info',
  };

  if (bin) {
    console.log(`[globalSetup] Using binary: ${bin.cmd}`);
    serverProcess = spawn(bin.cmd, bin.args, {
      cwd: verifierDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } else {
    console.log('[globalSetup] No pre-built binary found, using cargo run');
    serverProcess = spawn('cargo', ['run'], {
      cwd: verifierDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  // Forward server output for debugging
  serverProcess.stdout?.on('data', (data: Buffer) => {
    process.stdout.write(`[verifier] ${data}`);
  });
  serverProcess.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[verifier] ${data}`);
  });

  serverProcess.on('error', (err) => {
    console.error('[globalSetup] Failed to start verifier:', err);
  });

  serverProcess.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`[globalSetup] Verifier exited with code ${code}`);
    } else if (signal) {
      console.log(`[globalSetup] Verifier killed with signal ${signal}`);
    }
  });

  // Wait for server to be ready
  await waitForHealth(HEALTH_URL, STARTUP_TIMEOUT_MS);
  console.log('[globalSetup] Verifier server is ready');
}

export async function teardown(): Promise<void> {
  if (serverProcess && !serverProcess.killed) {
    console.log('[globalSetup] Stopping verifier server...');
    serverProcess.kill('SIGTERM');

    // Give it a moment to shut down gracefully
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          serverProcess.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      serverProcess!.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    console.log('[globalSetup] Verifier server stopped');
  }
}
