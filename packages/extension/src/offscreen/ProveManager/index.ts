import * as Comlink from 'comlink';
import type {
  ProverConfig,
  HttpRequest,
  Reveal,
  Method,
} from '../../../../tlsn-wasm-pkg/tlsn_wasm';
import { logger } from '@tlsn/common';
import type { Handler } from '@tlsn/plugin-sdk';

/** A byte range used for reveal operations */
interface RevealRange {
  start: number;
  end: number;
}

/** A byte range paired with its handler for the verifier */
interface RevealRangeWithHandler {
  start: number;
  end: number;
  handler: Handler;
}

// Extract worker reference so we can listen for progress messages alongside Comlink.
const worker = new Worker(new URL('./worker.ts', import.meta.url));
const workerApi = Comlink.wrap<{
  init: (config?: {
    loggingLevel?: string;
    hardwareConcurrency?: number;
    crateFilters?: { name: string; level: string }[];
  }) => Promise<void>;
  createProver: (config: ProverConfig) => Promise<string>;
  createSession: (verifierUrl: string, sessionData: Record<string, string>) => Promise<string>;
  setupProver: (proverId: string, sessionId: string) => Promise<void>;
  sendRequest: (proverId: string, proxyUrl: string, request: HttpRequest) => Promise<void>;
  getTranscript: (proverId: string) => { sent: number[]; recv: number[] };
  computeReveal: (
    proverId: string,
    handlers: Handler[],
  ) => {
    sentRanges: RevealRange[];
    recvRanges: RevealRange[];
    sentRangesWithHandlers: RevealRangeWithHandler[];
    recvRangesWithHandlers: RevealRangeWithHandler[];
  };
  reveal: (proverId: string, revealConfig: Reveal) => Promise<void>;
  sendRevealConfig: (
    sessionId: string,
    sent: RevealRangeWithHandler[],
    recv: RevealRangeWithHandler[],
  ) => Promise<void>;
  awaitSessionCompleted: (sessionId: string) => Promise<{ results: unknown[] }>;
  closeSession: (sessionId: string) => Promise<void>;
  freeProver: (proverId: string) => void;
}>(worker);

/** Verification response from the server */
interface VerificationResponse {
  results: unknown[];
}

/** Session state tracked per prover */
interface SessionState {
  sessionId: string;
  response: VerificationResponse | null;
  responseReceived: boolean;
  completionPromise: Promise<void> | null;
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

  /**
   * Per-prover progress callbacks. Keyed by proverId so concurrent plugin
   * executions don't overwrite each other's callback.
   */
  private progressCallbacks: Map<string, ProgressCallback> = new Map();

  private listenerAdded = false;

  /** Register a progress callback for a specific prover. */
  setProgressCallbackForProver(proverId: string, cb: ProgressCallback | null) {
    if (cb) {
      this.progressCallbacks.set(proverId, cb);
    } else {
      this.progressCallbacks.delete(proverId);
    }
  }

  async init() {
    // Guard against duplicate listener registration if init() is called more than once.
    if (!this.listenerAdded) {
      this.listenerAdded = true;
      worker.addEventListener('message', (event: MessageEvent) => {
        if (event.data?.type === 'WASM_PROGRESS') {
          // WASM worker doesn't include proverId in progress messages, so
          // broadcast to all registered callbacks. In practice only one
          // prove() runs at a time in the WASM worker.
          for (const cb of this.progressCallbacks.values()) {
            cb({
              step: event.data.step,
              progress: event.data.progress,
              message: event.data.message,
              source: 'wasm',
            });
          }
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

  async createProver(
    serverDns: string,
    verifierUrl: string,
    maxRecvData = 16384,
    maxSentData = 4096,
    sessionData: Record<string, string> = {},
  ) {
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
      // Open session WebSocket and register. The single WS carries both the
      // JSON control protocol (Text frames) and the MPC byte stream (Binary
      // frames); the worker handles the split.
      logger.debug('[ProveManager] Creating session for prover:', proverId);
      const sessionId = await workerApi.createSession(verifierUrl, sessionData);
      logger.debug(
        '[ProveManager] Session registered for prover:',
        proverId,
        'sessionId:',
        sessionId,
      );

      this.sessions.set(proverId, {
        sessionId,
        response: null,
        responseReceived: false,
        completionPromise: null,
      });

      // Run MPC setup over the session's binary channel.
      await workerApi.setupProver(proverId, sessionId);

      // Kick off the background wait for session_completed. Populates the
      // session state when the server responds.
      const session = this.sessions.get(proverId)!;
      session.completionPromise = (async () => {
        try {
          const result = await workerApi.awaitSessionCompleted(sessionId);
          session.response = { results: result.results };
          session.responseReceived = true;
        } catch (err) {
          logger.error('[ProveManager] awaitSessionCompleted failed:', err);
        }
      })();

      return proverId;
    } catch (error) {
      logger.error('[ProveManager] Failed to create prover:', error);
      await this.cleanupProver(proverId);
      throw error;
    }
  }

  /**
   * Send reveal configuration (ranges + handlers) to verifier before calling reveal().
   */
  async sendRevealConfig(
    proverId: string,
    revealConfig: {
      sent: RevealRangeWithHandler[];
      recv: RevealRangeWithHandler[];
    },
  ) {
    const session = this.sessions.get(proverId);
    if (!session) {
      throw new Error('Session not found for prover: ' + proverId);
    }

    logger.debug('[ProveManager] Sending reveal_config message:', {
      proverId,
      sessionId: session.sessionId,
      sentRanges: revealConfig.sent.length,
      recvRanges: revealConfig.recv.length,
    });

    try {
      await workerApi.sendRevealConfig(session.sessionId, revealConfig.sent, revealConfig.recv);
    } catch (err) {
      throw new Error(
        `Reveal config send failed for prover ${proverId}: ${err instanceof Error ? err.message : String(err)}`,
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
    const headerMap: Map<string, number[]> = new Map();
    Object.entries(options.headers || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        headerMap.set(key, Buffer.from(String(value)).toJSON().data);
      }
    });

    // Extract path+query from full URL (hyper sends absolute-form if given full URL)
    const parsedUrl = new URL(options.url);
    const requestUri = parsedUrl.pathname + parsedUrl.search;
    await workerApi.sendRequest(proverId, proxyUrl, {
      uri: requestUri,
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
  async computeReveal(proverId: string, handlers: Handler[]) {
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
  async getResponse(proverId: string, retry = 60): Promise<VerificationResponse | null> {
    const deadline = Date.now() + ProveManager.GET_RESPONSE_TIMEOUT_MS;

    const poll = async (remaining: number): Promise<VerificationResponse | null> => {
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
  async closeSession(proverId: string) {
    const session = this.sessions.get(proverId);
    if (session) {
      logger.debug('[ProveManager] Closing session WebSocket for prover:', proverId);
      try {
        await workerApi.closeSession(session.sessionId);
      } catch (err) {
        logger.warn('[ProveManager] closeSession failed for', proverId, ':', err);
      }
    }
  }

  /**
   * Clean up all resources for a prover (session state, prover instance).
   */
  async cleanupProver(proverId: string) {
    logger.debug('[ProveManager] Cleaning up prover:', proverId);

    await this.closeSession(proverId);

    // Remove session state and progress callback
    this.sessions.delete(proverId);
    this.progressCallbacks.delete(proverId);

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
