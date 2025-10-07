import * as Comlink from 'comlink';
import { PresentationJSON } from 'tlsn-js/build/types';
import TInit, {
  mapStringToRange,
  NotaryServer,
  Method,
  Presentation as TPresentation,
  Prover as TProver,
  subtractRanges,
  Transcript,
  Verifier as TVerifier,
  Commit,
} from 'tlsn-js';
import { v4 as uuidv4 } from 'uuid';

const {
  init,
  Prover,
  Presentation,
  Verifier,
}: {
  init: typeof TInit;
  Prover: typeof TProver;
  Presentation: typeof TPresentation;
  Verifier: typeof TVerifier;
} = Comlink.wrap(new Worker(new URL('./worker.ts', import.meta.url)));

export class ProveManager {
  private provers: Map<string, TProver> = new Map();
  async init() {
    await init({
      loggingLevel: 'Debug',
      hardwareConcurrency: navigator.hardwareConcurrency,
    });

    console.log('ProveManager initialized');
  }

  private async getVerifierSessionUrl(
    verifierUrl: string,
    plugin: string,
    maxRecvData = 16384,
    maxSentData = 4096,
  ) {
    const resp = await fetch(`${verifierUrl}/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientType: 'Websocket',
        maxRecvData,
        maxSentData,
        plugin,
      }),
    });
    const { sessionId } = await resp.json();
    const _url = new URL(verifierUrl);
    const protocol = _url.protocol === 'https:' ? 'wss' : 'ws';
    const pathname = _url.pathname;
    const sessionUrl = `${protocol}://${_url.host}${pathname === '/' ? '' : pathname}/notarize?sessionId=${sessionId!}`;
    return sessionUrl;
  }

  async createProver(
    serverDns: string,
    verifierUrl: string,
    maxRecvData = 16384,
    maxSentData = 4096,
  ) {
    const proverId = uuidv4();

    const sessionUrl = await this.getVerifierSessionUrl(
      verifierUrl,
      'plugin-js',
      maxRecvData,
      maxSentData,
    );

    const prover = await new Prover({
      serverDns,
      maxRecvData,
      maxSentData,
    });
    await prover.setup(sessionUrl);
    this.provers.set(proverId, prover);
    return proverId;
  }

  async getProver(proverId: string) {
    const prover = this.provers.get(proverId);
    if (!prover) {
      throw new Error('Prover not found');
    }
    return prover;
  }

  async sendRequest(
    proverId: string,
    proxyUrl: string,
    options: {
      url: string;
      method?: Method;
      headers?: Record<string, string>;
      body?: string;
    },
  ) {
    const prover = await this.getProver(proverId);
    await prover.sendRequest(proxyUrl, options);
  }

  async transcript(proverId: string) {
    const prover = await this.getProver(proverId);
    const transcript = await prover.transcript();
    return transcript;
  }

  async reveal(proverId: string, commit: Commit) {
    const prover = await this.getProver(proverId);
    await prover.reveal({ ...commit, server_identity: true });
  }
}
