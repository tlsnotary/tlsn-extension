/**
 * Stub ProverClient. Returns a fake proof object so the rest of the adapter
 * (windowing, interception, plugin runtime, approval) can be exercised
 * end-to-end before the real Rust prover binary is wired in.
 *
 * The fake proof contains enough shape (`results: [{ value }]`) for plugins
 * that read `proof.results[0].value` to keep going.
 *
 * Replaced by `rust-prover.ts` once the binary spawn is implemented.
 */

import type {
  ProveRequest,
  ProverClient,
  ProverOptions,
  ProveProgressData,
  RevealPreparation,
} from '@tlsn/host-contracts';

export class NullProverClient implements ProverClient {
  async prove(
    _req: ProveRequest,
    _opts: ProverOptions,
    onProgress?: (p: ProveProgressData) => void,
  ): Promise<unknown> {
    onProgress?.({ step: 'STUB_PROVER', progress: 1.0 } as ProveProgressData);
    return {
      stub: true,
      results: [{ value: '<<stub-prover>>' }],
      note: 'NullProverClient — replace with rust-prover.ts for real proofs.',
    };
  }

  async proveUntilReveal(
    _req: ProveRequest,
    _opts: ProverOptions,
  ): Promise<RevealPreparation> {
    return {
      sessionId: 'stub-session',
      descriptors: [],
      response: '',
    };
  }

  async proveFinalize(_sessionId: string, _approved: boolean): Promise<unknown> {
    return { stub: true, results: [{ value: '<<stub-prover>>' }] };
  }
}
