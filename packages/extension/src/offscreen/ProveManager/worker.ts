import * as Comlink from 'comlink';
import init, { Prover, Presentation, Verifier } from 'tlsn-js';

Comlink.expose({
  init,
  Prover,
  Presentation,
  Verifier,
});
