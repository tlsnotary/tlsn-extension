import * as Comlink from "comlink";
import init, { initThreadPool, greet, sum } from "../../../wasm/hello_wasm/hello_wasm";


const DATA = Array(10000000).fill(1);

class Test {
  constructor() {
    console.log('worker loaded');
    this.test();
  }

  async test() {
    console.log('start');
    console.log('sync', DATA.reduce((sum, n) => sum + n, 0));
    console.log(navigator.hardwareConcurrency)
    await init();
    await initThreadPool(navigator.hardwareConcurrency);
    console.log(sum(new Int32Array(DATA)));
    console.log('hihihihi')
  }
}

Comlink.expose(Test);

