import React, { useEffect } from "react";
import * as Comlink from "comlink";

const Offscreen = () => {
  useEffect(() => {
    (async function offscreenloaded() {
      console.log("offscreen loaded - spawning worker from worker.ts");
      const Wasm: any = Comlink.wrap(
        new Worker(new URL("./worker.ts", import.meta.url))
      );
      await new Wasm();
    })();
  }, []);

  return <div className="App" />;
};

export default Offscreen;
