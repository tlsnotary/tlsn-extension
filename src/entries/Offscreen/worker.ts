import * as Comlink from 'comlink';
import init, { Prover, NotarizedSession, TlsProof } from 'tlsn-js';

Comlink.expose({
  init,
  Prover,
  NotarizedSession,
  TlsProof,
});
