import * as Comlink from 'comlink';
import init, { Prover, Presentation, Verifier } from 'tlsn-js-v9';

Comlink.expose({
  init,
  Prover,
  Presentation,
  Verifier,
});
