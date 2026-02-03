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

/** Session state tracked per prover */
interface SessionState {
  sessionId: string;
  webSocket: WebSocket;
  response: any | null;
  responseReceived: boolean;
}

export class ProveManager {
  private provers: Map<string, TProver> = new Map();
  /** Maps proverId to its session state - each prover has isolated session */
  private sessions: Map<string, SessionState> = new Map();

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

  /**
   * Create a session WebSocket and register with the verifier.
   * Each prover gets its own isolated session.
   */
  private async createSession(
    proverId: string,
    verifierUrl: string,
    maxRecvData: number,
    maxSentData: number,
    sessionData: Record<string, string>,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      logger.debug('[ProveManager] Creating session for prover:', proverId);
      const _url = new URL(verifierUrl);
      const protocol = _url.protocol === 'https:' ? 'wss' : 'ws';
      const pathname = _url.pathname;
      const sessionWsUrl = `${protocol}://${_url.host}${pathname === '/' ? '' : pathname}/session`;

      logger.debug(
        '[ProveManager] Connecting to session WebSocket:',
        sessionWsUrl,
      );

      const ws = new WebSocket(sessionWsUrl);

      ws.onopen = () => {
        logger.debug(
          '[ProveManager] Session WebSocket connected for prover:',
          proverId,
        );

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
                '[ProveManager] Session registered for prover:',
                proverId,
                'sessionId:',
                sessionId,
              );

              // Store session state for this prover
              this.sessions.set(proverId, {
                sessionId,
                webSocket: ws,
                response: null,
                responseReceived: false,
              });

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
                '[ProveManager] ✅ Session completed for prover:',
                proverId,
              );
              logger.debug(
                '[ProveManager] Handler results count:',
                data.results.length,
              );

              // Store response in the session state
              const session = this.sessions.get(proverId);
              if (session) {
                session.response = { results: data.results };
                session.responseReceived = true;
              }
              break;
            }

            case 'error': {
              logger.error(
                '[ProveManager] Server error for prover:',
                proverId,
                data.message,
              );
              reject(new Error(data.message));
              break;
            }

            default: {
              // Handle legacy format for backward compatibility
              const legacyData = data as any;
              if (legacyData.sessionId) {
                logger.warn(
                  '[ProveManager] Received legacy sessionId format for prover:',
                  proverId,
                );
                this.sessions.set(proverId, {
                  sessionId: legacyData.sessionId,
                  webSocket: ws,
                  response: null,
                  responseReceived: false,
                });
                const verifierWsUrl = `${protocol}://${_url.host}${pathname === '/' ? '' : pathname}/verifier?sessionId=${legacyData.sessionId}`;
                resolve(verifierWsUrl);
              } else if (legacyData.results !== undefined) {
                logger.warn(
                  '[ProveManager] Received legacy results format for prover:',
                  proverId,
                );
                const session = this.sessions.get(proverId);
                if (session) {
                  session.response = legacyData;
                  session.responseReceived = true;
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
        logger.error(
          '[ProveManager] WebSocket error for prover:',
          proverId,
          error,
        );
        reject(new Error('WebSocket connection failed'));
      };

      ws.onclose = () => {
        logger.debug(
          '[ProveManager] Session WebSocket closed for prover:',
          proverId,
        );
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

    // Create isolated session for this prover
    const sessionUrl = await this.createSession(
      proverId,
      verifierUrl,
      maxRecvData,
      maxSentData,
      sessionData,
    );

    logger.debug('[ProveManager] Creating prover with config:', {
      proverId,
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
      // Clean up session state on failure
      this.cleanupProver(proverId);
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
    const session = this.sessions.get(proverId);
    if (!session) {
      throw new Error('Session not found for prover: ' + proverId);
    }

    if (session.webSocket.readyState !== WebSocket.OPEN) {
      throw new Error('Session WebSocket not open for prover: ' + proverId);
    }

    const message: ClientMessage = {
      type: 'reveal_config',
      sent: revealConfig.sent,
      recv: revealConfig.recv,
    };

    logger.debug('[ProveManager] Sending reveal_config message:', {
      proverId,
      sessionId: session.sessionId,
      sentRanges: revealConfig.sent.length,
      recvRanges: revealConfig.recv.length,
    });

    session.webSocket.send(JSON.stringify(message));
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
   * After successful retrieval, the response is kept for potential re-reads but can be cleaned up
   * via cleanupProver().
   */
  async getResponse(proverId: string, retry = 60): Promise<any | null> {
    const session = this.sessions.get(proverId);
    if (!session) {
      logger.warn('[ProveManager] No session found for proverId:', proverId);
      return null;
    }

    if (session.responseReceived && session.response) {
      logger.debug('[ProveManager] Returning response for prover:', proverId);
      return session.response;
    }

    if (retry > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return this.getResponse(proverId, retry - 1);
    }

    logger.warn('[ProveManager] Response timeout for prover:', proverId);
    return null;
  }

  /**
   * Close the session WebSocket for a specific prover.
   */
  closeSession(proverId: string) {
    const session = this.sessions.get(proverId);
    if (session && session.webSocket.readyState === WebSocket.OPEN) {
      logger.debug(
        '[ProveManager] Closing session WebSocket for prover:',
        proverId,
      );
      session.webSocket.close();
    }
  }

  /**
   * Clean up all resources for a prover (session state, prover instance).
   * Call this after proof generation is complete to prevent memory leaks.
   */
  cleanupProver(proverId: string) {
    logger.debug('[ProveManager] Cleaning up prover:', proverId);

    // Close WebSocket if open
    this.closeSession(proverId);

    // Remove session state
    this.sessions.delete(proverId);

    // Remove prover instance
    this.provers.delete(proverId);

    logger.debug('[ProveManager] Prover cleanup complete:', proverId);
  }

  /**
   * Get count of active sessions (for debugging/monitoring).
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}
