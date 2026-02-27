import * as Comlink from 'comlink';
import type {
  ProverConfig,
  HttpRequest,
  Reveal,
  Method,
} from '../../../../tlsn-wasm-pkg/tlsn_wasm';
import { logger } from '@tlsn/common';

// Extract worker reference so we can listen for progress messages alongside Comlink.
const worker = new Worker(new URL('./worker.ts', import.meta.url));
const workerApi = Comlink.wrap<{
  init: (config?: {
    loggingLevel?: string;
    hardwareConcurrency?: number;
    crateFilters?: { name: string; level: string }[];
  }) => Promise<void>;
  createProver: (config: ProverConfig) => Promise<string>;
  setupProver: (proverId: string, verifierUrl: string) => Promise<void>;
  sendRequest: (
    proverId: string,
    proxyUrl: string,
    request: HttpRequest,
  ) => Promise<void>;
  getTranscript: (proverId: string) => { sent: number[]; recv: number[] };
  computeReveal: (
    proverId: string,
    handlers: any[],
  ) => {
    sentRanges: any[];
    recvRanges: any[];
    sentRangesWithHandlers: any[];
    recvRangesWithHandlers: any[];
  };
  reveal: (proverId: string, revealConfig: Reveal) => Promise<void>;
  freeProver: (proverId: string) => void;
}>(worker);

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

/** Progress callback signature for WASM and JS-side progress events. */
export type ProgressCallback = (data: {
  step: string;
  progress: number;
  message: string;
  source: string;
}) => void;

export class ProveManager {
  /** Maps proverId to its session state - each prover has isolated session */
  private sessions: Map<string, SessionState> = new Map();
  private onProgress: ProgressCallback | null = null;
  private listenerAdded = false;

  /** Set a callback to receive WASM-side progress events from the worker. */
  setProgressCallback(cb: ProgressCallback | null) {
    this.onProgress = cb;
  }

  async init() {
    // Guard against duplicate listener registration if init() is called more than once.
    if (!this.listenerAdded) {
      this.listenerAdded = true;
      worker.addEventListener('message', (event: MessageEvent) => {
        if (event.data?.type === 'WASM_PROGRESS' && this.onProgress) {
          this.onProgress({
            step: event.data.step,
            progress: event.data.progress,
            message: event.data.message,
            source: 'wasm',
          });
        }
      });
    }

    await workerApi.init({
      loggingLevel: 'Info',
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

              resolve(verifierWsUrl);
              break;
            }

            case 'session_completed': {
              logger.debug(
                '[ProveManager] Session completed for prover:',
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
    // Create prover in the worker first to get the ID.
    const proverId = await workerApi.createProver({
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

    try {
      // Create isolated session for this prover.
      const sessionUrl = await this.createSession(
        proverId,
        verifierUrl,
        maxRecvData,
        maxSentData,
        sessionData,
      );

      // Setup prover with verifier - IoChannel created in worker.
      await workerApi.setupProver(proverId, sessionUrl);

      return proverId;
    } catch (error) {
      logger.error('[ProveManager] Failed to create prover:', error);
      await this.cleanupProver(proverId);
      throw error;
    }
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

    try {
      session.webSocket.send(JSON.stringify(message));
    } catch (err) {
      throw new Error(
        `Reveal config send failed for prover ${proverId}: verifier connection was closed`,
      );
    }
    logger.debug('[ProveManager] reveal_config sent to verifier');
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
    // Convert headers to the format expected by the worker.
    const headerMap: Map<string, number[]> = new Map();
    Object.entries(options.headers || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        headerMap.set(key, Buffer.from(String(value)).toJSON().data);
      }
    });

    // Send request via worker - IoChannel created in worker.
    await workerApi.sendRequest(proverId, proxyUrl, {
      uri: options.url,
      method: options.method as Method,
      headers: headerMap,
      body: options.body,
    });
  }

  async transcript(proverId: string) {
    return workerApi.getTranscript(proverId);
  }

  /**
   * Compute reveal ranges by parsing transcripts and mapping handlers to byte ranges.
   * Runs in the WASM worker — no transcript bytes transferred to the main thread.
   */
  async computeReveal(proverId: string, handlers: any[]) {
    return workerApi.computeReveal(proverId, handlers);
  }

  async reveal(
    proverId: string,
    commit: {
      sent: { start: number; end: number }[];
      recv: { start: number; end: number }[];
    },
  ) {
    await workerApi.reveal(proverId, { ...commit, server_identity: true });
  }

  /** Hard timeout for getResponse polling (60 seconds). */
  private static readonly GET_RESPONSE_TIMEOUT_MS = 60_000;

  /**
   * Get the verification response for a given prover ID.
   * Polls with a hard deadline — throws if the deadline is exceeded.
   */
  async getResponse(proverId: string, retry = 60): Promise<any | null> {
    const deadline = Date.now() + ProveManager.GET_RESPONSE_TIMEOUT_MS;

    const poll = async (remaining: number): Promise<any | null> => {
      const session = this.sessions.get(proverId);
      if (!session) {
        logger.warn('[ProveManager] No session found for proverId:', proverId);
        return null;
      }

      if (session.responseReceived && session.response) {
        logger.debug('[ProveManager] Returning response for prover:', proverId);
        return session.response;
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Verification response timed out after ${ProveManager.GET_RESPONSE_TIMEOUT_MS}ms for prover: ${proverId}`,
        );
      }

      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return poll(remaining - 1);
      }

      throw new Error(
        `Verification response not received after ${retry} retries for prover: ${proverId}`,
      );
    };

    return poll(retry);
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
   */
  async cleanupProver(proverId: string) {
    logger.debug('[ProveManager] Cleaning up prover:', proverId);

    // Close WebSocket if open
    this.closeSession(proverId);

    // Remove session state
    this.sessions.delete(proverId);

    // Free worker prover
    try {
      await workerApi.freeProver(proverId);
    } catch (err) {
      logger.warn('[ProveManager] freeProver failed for', proverId, ':', err);
    }

    logger.debug('[ProveManager] Prover cleanup complete:', proverId);
  }

  /**
   * Get count of active sessions (for debugging/monitoring).
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }
}
