import * as Comlink from 'comlink';
import init, { Prover, verify_attestation } from '@eternis/tlsn-js';

Comlink.expose({
  init,
  Prover,
  verify_attestation,
});
