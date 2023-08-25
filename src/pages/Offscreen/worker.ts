import * as Comlink from 'comlink';
import init, { prover } from '../../../wasm/prover/pkg/tlsn_extension_rs';

class TLSN {
  constructor() {
    console.log('worker test module initiated.');
  }

  async prover() {
    try {
      console.log('start');
      console.log(
        '!@# navigator.hardwareConcurrency=',
        navigator.hardwareConcurrency,
      );
      await init();
      // await initThreadPool(2);
      // console.log("!@# result js=", DATA.reduce((sum, n) => sum + n, 0));
      // console.log("!@# result rs=", sum(new Int32Array(DATA)));
      console.log('!@# reqProver=');
      const resProver = await prover();
      console.log('!@# resProver=', resProver);

      return resProver;
    } catch (e: any) {
      console.log(e);
      return e;
    }
  }
}

Comlink.expose(TLSN);
