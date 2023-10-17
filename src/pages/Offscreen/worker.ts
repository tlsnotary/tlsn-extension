import * as Comlink from 'comlink';
import init, {
  initThreadPool,
  prover,
} from '../../../wasm/prover/pkg/tlsn_extension_rs';

class TLSN {
  constructor() {
    console.log('worker test module initiated.');
  }

  async prover() {
    try {
      console.log('start');
      const numConcurrency = navigator.hardwareConcurrency;
      console.log('!@# navigator.hardwareConcurrency=', numConcurrency);
      const res = await init();
      console.log('!@# res.memory=', res.memory);
      // 6422528 ~= 6.12 mb
      console.log(
        '!@# res.memory.buffer.length=',
        res.memory.buffer.byteLength,
      );
      await initThreadPool(numConcurrency);

      const maxTranscriptSize = 16384;
      const notaryHost = "127.0.0.1";
      // const notaryHost : &str = "notary.efprivacyscaling.org";
      const notaryPort = 7047;

      const serverDomain = "api.twitter.com";
      const route = "1.1/account/settings.json";

      const userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36";

      const authToken = "";
      const accessToken = "";
      const csrfToken = "";
      const twitterId = "";
      const websocketProxyURL = "ws://127.0.0.1:55688";

      const resProver = await prover(
        maxTranscriptSize,
        notaryHost,
        notaryPort,
        serverDomain,
        route,
        userAgent,
        authToken,
        accessToken,
        csrfToken,
        twitterId,
        websocketProxyURL,
      );
      const resJSON = JSON.parse(resProver);
      console.log('!@# resProver=', resProver);
      console.log('!@# resAfter.memory=', res.memory);
      // 1105920000 ~= 1.03 gb
      console.log(
        '!@# resAfter.memory.buffer.length=',
        res.memory.buffer.byteLength,
      );

      return resJSON;
    } catch (e: any) {
      console.log(e);
      return e;
    }
  }
}

Comlink.expose(TLSN);
