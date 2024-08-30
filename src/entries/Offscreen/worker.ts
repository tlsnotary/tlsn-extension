import * as Comlink from 'comlink';
import init, { Prover, NotarizedSession, TlsProof, Verifier } from 'tlsn-js';

Comlink.expose({
  init,
  Prover,
  Verifier,
  NotarizedSession,
  TlsProof,
});
