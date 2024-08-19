import * as Comlink from 'comlink';
import init, { Prover } from 'tlsn-js';

Comlink.expose({
  init,
  Prover,
});
