import React, {useEffect} from 'react';
import * as Comlink from "comlink";

const Offscreen = () => {

  useEffect(() => {
    (async function offscreenloaded() {
      console.log('offscreen loaded')
      const Wasm: any = Comlink.wrap(new Worker(new URL("./worker.ts", import.meta.url)));
      console.log('hihihih')
      const instance = await new Wasm();
      console.log(instance);
    })();
  }, []);

  return (
    <div className="App" />
  );
};

export default Offscreen;
