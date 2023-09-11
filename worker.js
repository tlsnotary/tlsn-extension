import * as Comlink from "comlink";
// import init, { initThreadPool, greet, sum, prover } from "./pkg/tlsn_extension_rs";
import init, { initThreadPool, prover } from "./pkg/tlsn_extension_rs";

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
        const numConcurrency = navigator.hardwareConcurrency;
        console.log("!@# navigator.hardwareConcurrency=", numConcurrency)
        await init();
        await initThreadPool(numConcurrency);
        const resProver = await prover();
        console.log("!@# resProver=", resProver)
    }
}

Comlink.expose(Test);