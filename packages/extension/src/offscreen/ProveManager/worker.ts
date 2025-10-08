import * as Comlink from 'comlink';
import init, { Prover } from '../../../../tlsn-wasm-pkg/tlsn_wasm';

Comlink.expose({
  init,
  Prover,
});
