import * as Comlink from 'comlink';
import { v4 as uuidv4 } from 'uuid';
import type {
  Prover as TProver,
  Method,
} from '../../../../tlsn-wasm-pkg/tlsn_wasm';
import { logger } from '@tlsn/common';

const { init, Prover } = Comlink.wrap<{
  init: any;
  Prover: typeof TProver;
}>(new Worker(new URL('./worker.ts', import.meta.url)));

// ============================================================================
// WebSocket Message Types (matching Rust verifier)
// ============================================================================

/** Client message types (sent to server) */
type ClientMessage =
  | {
      type: 'register';
      maxRecvData: number;
      maxSentData: number;
      sessionData?: Record<string, string>;
    }
  | {
      type: 'reveal_config';
      sent: Array<{ start: number; end: number; handler: any }>;
      recv: Array<{ start: number; end: number; handler: any }>;
    };

/** Server message types (received from server) */
type ServerMessage =
  | { type: 'session_registered'; sessionId: string }
  | { type: 'session_completed'; results: any[] }
  | { type: 'error'; message: string };

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

    logger.debug('ProveManager initialized');
  }

  private sessionWebSocket: WebSocket | null = null;
  private currentSessionId: string | null = null;
  private sessionResponses: Map<string, any> = new Map();

  async getVerifierSessionUrl(
    verifierUrl: string,
    maxRecvData = 16384,
    maxSentData = 4096,
    sessionData: Record<string, string> = {},
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      logger.debug('[ProveManager] Getting verifier session URL:', verifierUrl);
      const _url = new URL(verifierUrl);
      const protocol = _url.protocol === 'https:' ? 'wss' : 'ws';
      const pathname = _url.pathname;
      const sessionWsUrl = `${protocol}://${_url.host}${pathname === '/' ? '' : pathname}/session`;

      logger.debug(
        '[ProveManager] Connecting to session WebSocket:',
        sessionWsUrl,
      );

      const ws = new WebSocket(sessionWsUrl);
      this.sessionWebSocket = ws;

      ws.onopen = () => {
        logger.debug('[ProveManager] Session WebSocket connected');

        // Send "register" message immediately on connect
        const registerMsg: ClientMessage = {
          type: 'register',
          maxRecvData,
          maxSentData,
          sessionData,
        };
        logger.debug('[ProveManager] Sending register message:', registerMsg);
        ws.send(JSON.stringify(registerMsg));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ServerMessage;

          switch (data.type) {
            case 'session_registered': {
              const sessionId = data.sessionId;
              logger.debug(
                '[ProveManager] Received session_registered:',
                sessionId,
              );

              // Store the current session ID
              this.currentSessionId = sessionId;

              // Construct verifier URL for prover
              const verifierWsUrl = `${protocol}://${_url.host}${pathname === '/' ? '' : pathname}/verifier?sessionId=${sessionId}`;
              logger.debug(
                '[ProveManager] Prover will connect to:',
                verifierWsUrl,
              );

              resolve(verifierWsUrl);
              break;
            }

            case 'session_completed': {
              logger.debug(
                '[ProveManager] ✅ Received session_completed from verifier',
              );
              logger.debug(
                '[ProveManager] Handler results count:',
                data.results.length,
              );

              // Store the response with the session ID
              if (this.currentSessionId) {
                this.sessionResponses.set(this.currentSessionId, {
                  results: data.results,
                });
                logger.debug(
                  '[ProveManager] Stored response for session:',
                  this.currentSessionId,
                );
              }

              // WebSocket will be closed by the server
              break;
            }

            case 'error': {
              logger.error('[ProveManager] Server error:', data.message);
              reject(new Error(data.message));
              break;
            }

            default: {
              // Handle legacy format for backward compatibility during transition
              const legacyData = data as any;
              if (legacyData.sessionId) {
                // Old format: { sessionId: "..." }
                logger.warn(
                  '[ProveManager] Received legacy sessionId format, falling back',
                );
                this.currentSessionId = legacyData.sessionId;
                const verifierWsUrl = `${protocol}://${_url.host}${pathname === '/' ? '' : pathname}/verifier?sessionId=${legacyData.sessionId}`;
                resolve(verifierWsUrl);
              } else if (legacyData.results !== undefined) {
                // Old format: { results: [...] }
                logger.warn(
                  '[ProveManager] Received legacy results format, falling back',
                );
                if (this.currentSessionId) {
                  this.sessionResponses.set(this.currentSessionId, legacyData);
                }
              } else {
                logger.warn(
                  '[ProveManager] Unknown message type:',
                  (data as any).type,
                );
              }
            }
          }
        } catch (error) {
          logger.error(
            '[ProveManager] Error parsing WebSocket message:',
            error,
          );
        }
      };

      ws.onerror = (error) => {
        logger.error('[ProveManager] WebSocket error:', error);
        reject(new Error('WebSocket connection failed'));
      };

      ws.onclose = () => {
        logger.debug('[ProveManager] Session WebSocket closed');
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
    sessionData: Record<string, string> = {},
  ) {
    const proverId = uuidv4();

    const sessionUrl = await this.getVerifierSessionUrl(
      verifierUrl,
      maxRecvData,
      maxSentData,
      sessionData,
    );

    // Store the mapping from proverId to sessionId
    if (this.currentSessionId) {
      this.proverToSessionId.set(proverId, this.currentSessionId);
      logger.debug(
        '[ProveManager] Mapped proverId',
        proverId,
        'to sessionId',
        this.currentSessionId,
      );
    }

    logger.debug('[ProveManager] Creating prover with config:', {
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
      logger.debug(
        '[ProveManager] Prover instance created, calling setup...',
        sessionUrl,
      );

      await prover.setup(sessionUrl as string);
      logger.debug('[ProveManager] Prover setup completed');

      this.provers.set(proverId, prover as any);
      logger.debug('[ProveManager] Prover registered with ID:', proverId);
      return proverId;
    } catch (error) {
      logger.error('[ProveManager] Failed to create prover:', error);
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

  /**
   * Send reveal configuration (ranges + handlers) to verifier before calling reveal()
   */
  async sendRevealConfig(
    proverId: string,
    revealConfig: {
      sent: Array<{ start: number; end: number; handler: any }>;
      recv: Array<{ start: number; end: number; handler: any }>;
    },
  ) {
    if (!this.sessionWebSocket) {
      throw new Error('Session WebSocket not available');
    }

    const sessionId = this.proverToSessionId.get(proverId);
    if (!sessionId) {
      throw new Error('Session ID not found for prover');
    }

    // Send as typed message
    const message: ClientMessage = {
      type: 'reveal_config',
      sent: revealConfig.sent,
      recv: revealConfig.recv,
    };

    logger.debug('[ProveManager] Sending reveal_config message:', {
      sessionId,
      sentRanges: revealConfig.sent.length,
      recvRanges: revealConfig.recv.length,
    });

    this.sessionWebSocket.send(JSON.stringify(message));
    logger.debug('[ProveManager] ✅ reveal_config sent to verifier');
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
   * Returns null if no response is available yet, otherwise returns the structured handler results.
   */
  async getResponse(proverId: string, retry = 60): Promise<any | null> {
    const sessionId = this.proverToSessionId.get(proverId);
    if (!sessionId) {
      logger.warn('[ProveManager] No session ID found for proverId:', proverId);
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
      logger.debug('[ProveManager] Closing session WebSocket');
      this.sessionWebSocket.close();
      this.sessionWebSocket = null;
    }
  }
}
