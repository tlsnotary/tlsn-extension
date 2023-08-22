import * as Comlink from "comlink";
import init, { prover } from "../../../wasm/prover/pkg/tlsn_extension_rs";

class Test {
  constructor() {
    console.log("worker test module initiated.");
    this.test();
  }

  async test() {
    console.log('start');
    console.log("!@# navigator.hardwareConcurrency=", navigator.hardwareConcurrency)
    await init();
    // await initThreadPool(2);
    // console.log("!@# result js=", DATA.reduce((sum, n) => sum + n, 0));
    // console.log("!@# result rs=", sum(new Int32Array(DATA)));
    const resProver = await prover();
    console.log("!@# resProver=", resProver)
  }
}

Comlink.expose(Test);
