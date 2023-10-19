import * as Comlink from 'comlink';
import { urlify, devlog } from '../../utils/misc';
import init, {
  initThreadPool,
  prover,
} from '../../../wasm/prover/pkg/tlsn_extension_rs';

class TLSN {
  notaryUrl: string;
  websocketProxyUrl: string;

  constructor(options: {
    notaryUrl: string;
    websocketProxyUrl: string;
  }) {
    this.notaryUrl = options.notaryUrl;
    this.websocketProxyUrl = options.websocketProxyUrl;
    console.log('worker module initiated.');
  }

  async prover(url: string, options?: {
    method?: string;
    headers?: { [key: string]: string };
    body?: string;
    maxTranscriptSize?: number;
  }) {
    try {
      devlog('start');
      const numConcurrency = navigator.hardwareConcurrency;
      devlog('!@# navigator.hardwareConcurrency=', numConcurrency);
      const res = await init();
      devlog('!@# res.memory=', res.memory);
      // 6422528 ~= 6.12 mb
      devlog(
        '!@# res.memory.buffer.length=',
        res.memory.buffer.byteLength,
      );
      await initThreadPool(numConcurrency);

      const resProver = await prover(
        url,
        {
          ...options,
          notaryUrl: this.notaryUrl,
          websocketProxyUrl: this.websocketProxyUrl,
        },
      );
      const resJSON = JSON.parse(resProver);
      devlog('!@# resProver=', resProver);
      devlog('!@# resAfter.memory=', res.memory);
      // 1105920000 ~= 1.03 gb
      devlog(
        '!@# resAfter.memory.buffer.length=',
        res.memory.buffer.byteLength,
      );

      return resJSON;
    } catch (e: any) {
      devlog(e);
      return e;
    }
  }
}

Comlink.expose(TLSN);
