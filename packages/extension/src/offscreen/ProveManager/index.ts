import * as Comlink from 'comlink';
import { v4 as uuidv4 } from 'uuid';
import type Tinit from '../../../../tlsn-wasm-pkg/tlsn_wasm';
import type {
  Prover as TProver,
  Method,
} from '../../../../tlsn-wasm-pkg/tlsn_wasm';
import { Reveal } from '../../../../tlsn-wasm-pkg/tlsn_wasm';

const { init, Prover } = Comlink.wrap<{
  init: typeof Tinit;
  Prover: typeof TProver;
}>(new Worker(new URL('./worker.ts', import.meta.url)));

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
      server_name: serverDns,
      max_recv_data: maxRecvData,
      max_sent_data: maxSentData,
      max_sent_records: undefined,
      max_recv_data_online: undefined,
      max_recv_records_online: undefined,
      defer_decryption_from_start: undefined,
      network: 'Bandwidth',
      client_auth: undefined,
    });
    await prover.setup(sessionUrl);
    this.provers.set(proverId, prover as any);
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
      method: Method;
      headers?: Map<string, number[]>;
      body?: string;
    },
  ) {
    const prover = await this.getProver(proverId);
    await prover.send_request(proxyUrl, {
      uri: options.url,
      method: options.method as Method,
      headers: options.headers || new Map(),
      body: options.body,
    });
  }

  async transcript(proverId: string) {
    const prover = await this.getProver(proverId);
    const transcript = await prover.transcript();
    return transcript;
  }

  async reveal(proverId: string, commit: Reveal) {
    const prover = await this.getProver(proverId);
    await prover.reveal({ ...commit, server_identity: true });
  }
}
