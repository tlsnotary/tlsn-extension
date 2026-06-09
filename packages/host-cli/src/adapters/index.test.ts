/**
 * Contract-wiring smoke test for the CLI adapter.
 *
 * Goal: validate that every contract in @tlsn/host-contracts is wired through
 * createCliAdapter end-to-end, without depending on a real TLS prover. Uses
 * the bundled NullProverClient.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createCliAdapter } from './index.js';
import { NullProverClient } from './null-prover.js';
import type { HostAdapter, InterceptedRequestHeader } from '@tlsn/host-contracts';

describe('createCliAdapter — contract wiring', () => {
  let fixtureServer: Server;
  let fixtureUrl: string;

  beforeAll(async () => {
    fixtureServer = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body>fixture</body></html>');
    });
    await new Promise<void>((resolve) => fixtureServer.listen(0, '127.0.0.1', () => resolve()));
    const addr = fixtureServer.address() as AddressInfo;
    fixtureUrl = `http://127.0.0.1:${addr.port}/`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
  });

  it('exposes all five contract instances', async () => {
    const adapter = await createCliAdapter({ mode: 'replay' });
    try {
      expect(adapter.prover).toBeDefined();
      expect(adapter.windows).toBeDefined();
      expect(adapter.interceptor).toBeDefined();
      expect(adapter.renderer).toBeDefined();
      expect(adapter.approval).toBeDefined();
    } finally {
      await adapter.dispose();
    }
  });

  it('opens a Playwright window and tracks it via windows.list()', async () => {
    const adapter = await createCliAdapter({ mode: 'replay' });
    try {
      const handle = await adapter.windows.open(fixtureUrl);
      expect(handle.id).toBeGreaterThan(0);
      expect(adapter.windows.list()).toHaveLength(1);
      await adapter.windows.close(handle);
    } finally {
      await adapter.dispose();
    }
  });

  it('captures request headers via the interceptor', async () => {
    const adapter = await createCliAdapter({ mode: 'replay' });
    const headers: InterceptedRequestHeader[] = [];
    try {
      const handle = await adapter.windows.open(fixtureUrl);
      const unsub = adapter.interceptor.subscribe(handle, (h) => headers.push(h));

      // Give the navigation a moment to fire the document request through the route handler.
      await waitFor(() => headers.length > 0, 5000);
      unsub();

      expect(headers.length).toBeGreaterThan(0);
      const first = headers[0];
      expect(first.url).toContain(fixtureUrl);
      expect(first.tabId).toBe(handle.id);
      expect(first.method).toBe('GET');
      // Playwright doesn't expose pseudo-headers like `:host`; just confirm
      // we got *some* headers (e.g. user-agent, accept).
      expect(first.requestHeaders.length).toBeGreaterThan(0);
    } finally {
      await adapter.dispose();
    }
  });

  it('createHost wires through to the stub prover when invoked', async () => {
    // Pin to NullProverClient so this test passes regardless of whether the
    // Rust binary is built on the dev's machine.
    const adapter: HostAdapter = await createCliAdapter({
      mode: 'replay',
      prover: new NullProverClient(),
    });
    try {
      const host = await adapter.createHost({
        verifierUrl: 'http://localhost:7047',
        proxyUrl: '',
        approvalMode: 'all-session',
      });
      expect(host).toBeDefined();
      const proof = await adapter.prover.prove(
        { url: 'https://example.com/', method: 'GET', headers: {} },
        { verifierUrl: 'http://localhost:7047', proxyUrl: '', handlers: [] },
      );
      expect(proof).toEqual(expect.objectContaining({ stub: true }));
    } finally {
      await adapter.dispose();
    }
  });
});

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timeout after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 50));
  }
}
