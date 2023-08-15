// import init from './pkg/tlsn_extension_rs.js';
import * as Comlink from "comlink";


window.addEventListener('load', async () => {
    console.log("!@# load: addEventListener");
    const Wasm = Comlink.wrap(new Worker(new URL("./worker.js", import.meta.url)));
    const instance = await new Wasm();
    console.log("!@# instance = ", instance);

    // // Regular wasm-bindgen initialization.
    // // await init('./pkg/tlsn_extension_rs_bg.wasm');
    // await init();
});
