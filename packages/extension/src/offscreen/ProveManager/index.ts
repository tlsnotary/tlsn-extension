import * as Comlink from 'comlink';
import { v4 as uuidv4 } from 'uuid';
import type {
  Prover as TProver,
  Method,
} from '../../../../tlsn-wasm-pkg/tlsn_wasm';
import { Reveal } from '../../../../tlsn-wasm-pkg/tlsn_wasm';

const { init, Prover } = Comlink.wrap<{
  init: any;
  Prover: typeof TProver;
}>(new Worker(new URL('./worker.ts', import.meta.url)));

export class ProveManager {
  private provers: Map<string, TProver> = new Map();

  async init() {
    await init({
      loggingLevel: 'Debug',
      hardwareConcurrency: navigator.hardwareConcurrency,
      crateFilters: [
        { name: 'yamux', level: 'Info' },
        { name: 'uid_mux', level: 'Info' },
      ],
    });

    console.log('ProveManager initialized');
  }

  private async getVerifierSessionUrl(
    verifierUrl: string,
    maxRecvData = 16384,
    maxSentData = 4096,
  ) {
    const resp = await fetch(`${verifierUrl}/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        maxRecvData,
        maxSentData,
      }),
    });
    const { sessionId } = await resp.json();
    const _url = new URL(verifierUrl);
    const protocol = _url.protocol === 'https:' ? 'wss' : 'ws';
    const pathname = _url.pathname;
    const sessionUrl = `${protocol}://${_url.host}${pathname === '/' ? '' : pathname}/verifier?sessionId=${sessionId!}`;
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
      maxRecvData,
      maxSentData,
    );

    console.log('[ProveManager] Creating prover with config:', {
      server_name: serverDns,
      max_recv_data: maxRecvData,
      max_sent_data: maxSentData,
      network: 'Bandwidth',
    });

    try {
      const prover = await new Prover({
        server_name: serverDns,
        max_recv_data: maxRecvData,
        max_sent_data: maxSentData,
        network: 'Bandwidth',
        max_sent_records: undefined,
        max_recv_data_online: undefined,
        max_recv_records_online: undefined,
        defer_decryption_from_start: undefined,
        client_auth: undefined,
      });
      console.log('[ProveManager] Prover instance created, calling setup...');

      await prover.setup(sessionUrl as string);
      console.log('[ProveManager] Prover setup completed');

      this.provers.set(proverId, prover as any);
      console.log('[ProveManager] Prover registered with ID:', proverId);
      return proverId;
    } catch (error) {
      console.error('[ProveManager] Failed to create prover:', error);
      throw error;
    }
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
    await prover.send_request(proxyUrl, {
      uri: options.url,
      method: options.method as Method,
      headers: new Map(
        Object.entries(options.headers || {}).map(([key, value]) => [
          key,
          value.split('\n').map((line) => line.length),
        ]),
      ),
      body: options.body,
    });
  }

  async transcript(proverId: string) {
    const prover = await this.getProver(proverId);
    const transcript = await prover.transcript();
    return transcript;
  }

  async reveal(
    proverId: string,
    commit: {
      sent: { start: number; end: number }[];
      recv: { start: number; end: number }[];
    },
  ) {
    const prover = await this.getProver(proverId);
    await prover.reveal({ ...commit, server_identity: true });
  }
}
