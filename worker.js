<<<<<<< HEAD
<<<<<<< HEAD
import * as Comlink from 'comlink';
// import init, { prover } from "./pkg/tlsn_extension_rs";
import init, { initThreadPool, prover } from './pkg/tlsn_extension_rs';

function hasSharedMemory() {
  const hasSharedArrayBuffer = 'SharedArrayBuffer' in global;
=======
import * as Comlink from "comlink";
=======
import * as Comlink from 'comlink';
>>>>>>> 07ac764 (lint)
// import init, { prover } from "./pkg/tlsn_extension_rs";
import init, { initThreadPool, prover } from './pkg/tlsn_extension_rs';

function hasSharedMemory() {
<<<<<<< HEAD
  const hasSharedArrayBuffer = "SharedArrayBuffer" in global;
>>>>>>> 7462ae9 (Use the latest tlsn@8b163540 with patch)
=======
  const hasSharedArrayBuffer = 'SharedArrayBuffer' in global;
>>>>>>> 07ac764 (lint)
  const notCrossOriginIsolated = global.crossOriginIsolated === false;

  return hasSharedArrayBuffer && !notCrossOriginIsolated;
}

const DATA = Array(20).fill(1);

class Test {
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 07ac764 (lint)
  constructor() {
    console.log('!@# test comlink');
    this.test();
  }
<<<<<<< HEAD

  async test() {
    console.log('start');
    console.log('!@# hasSharedMemory=', hasSharedMemory());
    const numConcurrency = navigator.hardwareConcurrency;
    console.log('!@# numConcurrency=', numConcurrency);
    const res = await init();
    console.log('!@# res.memory=', res.memory);
    // 6422528 ~= 6.12 mb
    console.log('!@# res.memory.buffer.length=', res.memory.buffer.byteLength);
    await initThreadPool(numConcurrency);
    const resProver = await prover();
    console.log('!@# resProver=', resProver);
    console.log('!@# resAfter.memory=', res.memory);
    // 1105920000 ~= 1.03 gb
    console.log(
      '!@# resAfter.memory.buffer.length=',
      res.memory.buffer.byteLength,
    );
  }
}

Comlink.expose(Test);
=======
    constructor() {
        console.log('!@# test comlink');
        this.test();
    }
=======
>>>>>>> 07ac764 (lint)

  async test() {
    console.log('start');
    console.log('!@# hasSharedMemory=', hasSharedMemory());
    const numConcurrency = navigator.hardwareConcurrency;
    console.log('!@# numConcurrency=', numConcurrency);
    const res = await init();
    console.log('!@# res.memory=', res.memory);
    // 6422528 ~= 6.12 mb
    console.log('!@# res.memory.buffer.length=', res.memory.buffer.byteLength);
    await initThreadPool(numConcurrency);
    const resProver = await prover();
    console.log('!@# resProver=', resProver);
    console.log('!@# resAfter.memory=', res.memory);
    // 1105920000 ~= 1.03 gb
    console.log(
      '!@# resAfter.memory.buffer.length=',
      res.memory.buffer.byteLength,
    );
  }
}

Comlink.expose(Test);
<<<<<<< HEAD
>>>>>>> 7462ae9 (Use the latest tlsn@8b163540 with patch)
=======
>>>>>>> 07ac764 (lint)
