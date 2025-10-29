import * as Comlink from 'comlink';
import { v4 as uuidv4 } from 'uuid';
import type {
  Prover as TProver,
  Method,
} from '../../../../tlsn-wasm-pkg/tlsn_wasm';

const { init, Prover } = Comlink.wrap<{
  init: any;
  Prover: typeof TProver;
}>(new Worker(new URL('./worker.ts', import.meta.url)));

export class ProveManager {
  private provers: Map<string, TProver> = new Map();
  private proverToSessionId: Map<string, string> = new Map();

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

  private sessionWebSocket: WebSocket | null = null;
  private currentSessionId: string | null = null;
  private sessionResponses: Map<
    string,
    { sentData: string; receivedData: string }
  > = new Map();

  async getVerifierSessionUrl(
    verifierUrl: string,
    maxRecvData = 16384,
    maxSentData = 4096,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log('[ProveManager] Getting verifier session URL:', verifierUrl);
      const _url = new URL(verifierUrl);
      const protocol = _url.protocol === 'https:' ? 'wss' : 'ws';
      const pathname = _url.pathname;
      const sessionWsUrl = `${protocol}://${_url.host}${pathname === '/' ? '' : pathname}/session`;

      console.log(
        '[ProveManager] Connecting to session WebSocket:',
        sessionWsUrl,
      );

      const ws = new WebSocket(sessionWsUrl);
      this.sessionWebSocket = ws;

      ws.onopen = () => {
        console.log('[ProveManager] Session WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // First message: session ID
          if (data.sessionId) {
            const sessionId = data.sessionId;
            console.log('[ProveManager] Received session ID:', sessionId);

            // Store the current session ID
            this.currentSessionId = sessionId;

            // Send configuration
            const config = {
              maxRecvData,
              maxSentData,
            };
            console.log('[ProveManager] Sending config:', config);
            ws.send(JSON.stringify(config));

            // Construct verifier URL for prover
            const verifierUrl = `${protocol}://${_url.host}${pathname === '/' ? '' : pathname}/verifier?sessionId=${sessionId}`;
            console.log('[ProveManager] Prover will connect to:', verifierUrl);

            resolve(verifierUrl);
          }
          // Second message: verification result
          else if (
            data.sentData !== undefined &&
            data.receivedData !== undefined
          ) {
            console.log(
              '[ProveManager] ✅ Received verification result from verifier',
            );
            console.log(
              '[ProveManager] Sent data length:',
              data.sentData.length,
            );
            console.log(
              '[ProveManager] Received data length:',
              data.receivedData.length,
            );

            // Store the response with the session ID
            if (this.currentSessionId) {
              this.sessionResponses.set(this.currentSessionId, {
                sentData: data.sentData,
                receivedData: data.receivedData,
              });
              console.log(
                '[ProveManager] Stored response for session:',
                this.currentSessionId,
              );
            }

            // WebSocket will be closed by the server
          }
        } catch (error) {
          console.error(
            '[ProveManager] Error parsing WebSocket message:',
            error,
          );
        }
      };

      ws.onerror = (error) => {
        console.error('[ProveManager] WebSocket error:', error);
        reject(new Error('WebSocket connection failed'));
      };

      ws.onclose = () => {
        console.log('[ProveManager] Session WebSocket closed');
        this.sessionWebSocket = null;
        this.currentSessionId = null;
      };
    });
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

    // Store the mapping from proverId to sessionId
    if (this.currentSessionId) {
      this.proverToSessionId.set(proverId, this.currentSessionId);
      console.log(
        '[ProveManager] Mapped proverId',
        proverId,
        'to sessionId',
        this.currentSessionId,
      );
    }

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
      console.log(
        '[ProveManager] Prover instance created, calling setup...',
        sessionUrl,
      );

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

    const headerMap: Map<string, number[]> = new Map();
    Object.entries(options.headers || {}).forEach(([key, value]) => {
      headerMap.set(key, Buffer.from(value).toJSON().data);
    });
    await prover.send_request(proxyUrl, {
      uri: options.url,
      method: options.method as Method,
      headers: headerMap,
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

  /**
   * Get the verification response for a given prover ID.
   * Returns null if no response is available yet, otherwise returns the sent and received data.
   */
  async getResponse(
    proverId: string,
    retry = 60,
  ): Promise<{ sentData: string; receivedData: string } | null> {
    const sessionId = this.proverToSessionId.get(proverId);
    if (!sessionId) {
      console.warn(
        '[ProveManager] No session ID found for proverId:',
        proverId,
      );
      return null;
    }

    const response = this.sessionResponses.get(sessionId);

    if (!response) {
      if (retry > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return this.getResponse(proverId, retry - 1);
      }
      return null;
    }

    return response;
  }

  /**
   * Close the session WebSocket if it's still open.
   */
  closeSession() {
    if (this.sessionWebSocket) {
      console.log('[ProveManager] Closing session WebSocket');
      this.sessionWebSocket.close();
      this.sessionWebSocket = null;
    }
  }
}
