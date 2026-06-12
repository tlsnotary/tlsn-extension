/**
 * @tlsn/host-cli
 *
 * TLSNotary host adapter for Node CLI / CI. Implements `@tlsn/host-contracts`
 * via Playwright (window management + request interception) and a Rust prover
 * binary (TLS proof generation).
 *
 * Two entry points:
 *
 *  1. Library — `import { createCliAdapter } from '@tlsn/host-cli'`
 *     Use this from your own Node script to drive plugins programmatically.
 *
 *  2. CLI bin — `npx tlsn-cli run <plugin>`
 *     Use this for quick interactive runs and CI.
 */

export { createCliAdapter } from './adapters/index';
export type { CliAdapterOptions } from './adapters/index';
