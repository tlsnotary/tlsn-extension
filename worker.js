import * as Comlink from "comlink";
// import init, { initThreadPool, greet, sum, prover } from "./pkg/tlsn_extension_rs";
import init, { prover } from "./pkg/tlsn_extension_rs";

function hasSharedMemory() {
  const hasSharedArrayBuffer = "SharedArrayBuffer" in global;
  const notCrossOriginIsolated = global.crossOriginIsolated === false;

  return hasSharedArrayBuffer && !notCrossOriginIsolated;
}

const DATA = Array(20).fill(1);

class Test {
    constructor() {
        console.log('!@# test comlink');
        this.test();
    }

    async test() {
        console.log('start');
        console.log("!@# hasSharedMemory=", hasSharedMemory())
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