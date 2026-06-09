/**
 * Integration test for RustProverClient ↔ tlsn-prover binary.
 *
 * Skipped automatically when the binary isn't built (e.g. on the JS-only CI
 * lane). Locally, run `cargo build --bin tlsn-prover --release` from
 * packages/tlsn-mobile first.
 */

import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { RustProverClient, resolveBinary } from './rust-prover.js';

const binary = resolveBinary();
const binaryAvailable = binary !== 'tlsn-prover' && existsSync(binary);

describe.skipIf(!binaryAvailable)('RustProverClient → tlsn-prover binary', () => {
  it('spawns the binary and surfaces structured errors when the verifier is unreachable', async () => {
    const client = new RustProverClient({ binary, timeoutMs: 30_000 });
    await expect(
      client.prove(
        { url: 'https://example.com/', method: 'GET', headers: {} },
        {
          verifierUrl: 'http://127.0.0.1:1', // port 1 — guaranteed unreachable
          proxyUrl: '',
          handlers: [],
        },
      ),
    ).rejects.toThrow(/tlsn-prover/);
  }, 60_000);
});
