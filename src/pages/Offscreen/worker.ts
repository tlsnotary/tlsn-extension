import * as Comlink from 'comlink';
import init, { initThreadPool, prover } from '../../../wasm/prover/pkg/tlsn_extension_rs';

class TLSN {
  constructor() {
    console.log('worker test module initiated.');
  }

  async prover() {
    try {
      console.log('start');
      const numConcurrency = navigator.hardwareConcurrency;
      console.log(
        '!@# navigator.hardwareConcurrency=',
        numConcurrency,
      );
      const res = await init();
      console.log("!@# res.memory=", res.memory)
      // 6422528 ~= 6.12 mb
      console.log("!@# res.memory.buffer.length=", res.memory.buffer.byteLength)
      await initThreadPool(numConcurrency);
      const resProver = await prover();
      console.log("!@# resProver=", resProver)
      console.log("!@# resAfter.memory=", res.memory)
      // 1105920000 ~= 1.03 gb
      console.log("!@# resAfter.memory.buffer.length=", res.memory.buffer.byteLength)

      return resProver;
    } catch (e: any) {
      console.log(e);
      return e;
    }
  }
}

Comlink.expose(TLSN);
