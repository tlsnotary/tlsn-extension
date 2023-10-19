import * as Comlink from 'comlink';
import { urlify, devlog } from '../../utils/misc';
import init, {
  initThreadPool,
  prover,
  verify
} from '../../../wasm/prover/pkg/tlsn_extension_rs';

class TLSN {
  private startPromise: any;
  private resolveStart: any;

  constructor() {
    console.log('worker module initiated.');
    this.startPromise = new Promise((resolve) => {
      this.resolveStart = resolve;
    });
    this.start();
  }

  async start() {
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
    this.resolveStart();
  }

  async waitForStart() {
    return this.startPromise;
  }

  async prover(url: string, options?: {
    method?: string;
    headers?: { [key: string]: string };
    body?: string;
    maxTranscriptSize?: number;
    notaryUrl?: string;
    websocketProxyUrl?: string;
  }) {
    try {
      await this.waitForStart();
      console.log('worker', url,
        {
          ...options,
          notaryUrl: options.notaryUrl,
          websocketProxyUrl: options.websocketProxyUrl,
        })
      const resProver = await prover(
        url,
        {
          ...options,
          notaryUrl: options.notaryUrl,
          websocketProxyUrl: options.websocketProxyUrl,
        },
      );
      const resJSON = JSON.parse(resProver);
      devlog('!@# resProver,resJSON=', {resProver, resJSON});
      devlog('!@# resAfter.memory=', resJSON.memory);
      // 1105920000 ~= 1.03 gb
      devlog(
        '!@# resAfter.memory.buffer.length=',
        resJSON.memory?.buffer?.byteLength,
      );

      return resJSON;
    } catch (e: any) {
      devlog(e);
      return e;
    }
  }

  async verify(proof: any, pubkey: string) {
    await this.waitForStart();
    await verify(JSON.stringify(proof), pubkey);
  }
}

Comlink.expose(TLSN);
