import * as Comlink from "comlink";
import init, { initThreadPool, greet, sum } from "../../../wasm/hello_wasm/hello_wasm";


const DATA = Array(10000000).fill(1);

class Test {
  constructor() {
    console.log('worker test module initiated.');
    this.test();
  }

  async test() {
    console.log('running worker test script');
    console.log('summing an Int32Array in javascript', DATA.reduce((sum, n) => sum + n, 0));

    console.log(`initializing thread pool with ${navigator.hardwareConcurrency} core.`);
    await init();
    await initThreadPool(navigator.hardwareConcurrency);

    console.log(`initialize thread pool with ${navigator.hardwareConcurrency} core.`);
    console.log('summing an Int32Array in wasm with rayon iterator', sum(new Int32Array(DATA)));
  }
}

Comlink.expose(Test);

