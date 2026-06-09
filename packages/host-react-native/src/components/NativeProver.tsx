import React, {
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useRef,
} from 'react';
import { Platform } from 'react-native';

// Type-only imports are erased at compile time, so they're safe even before prebuild.
import type {
  ProveRequest,
  HandlerType,
  HandlerPart,
  HandlerAction,
  HandlerParams,
  Handler,
  ProverOptions,
  ProveResult,
  ProveProgress,
  NativeLogLine,
  TlsnLogLevel,
  RevealPreparation,
  RevealRangeDescriptor,
} from 'tlsn-native';
import { addLog, type LogLevel } from '../logger/index.js';

export type {
  HandlerType,
  HandlerPart,
  HandlerAction,
  HandlerParams,
  Handler,
  ProveProgress,
  RevealPreparation,
  RevealRangeDescriptor,
};

export interface NativeProveParams {
  url: string;
  method: string;
  headers: Record<string, string>;
  proverOptions: {
    verifierUrl: string;
    maxSentData: number;
    maxRecvData: number;
    handlers?: Handler[];
    mode?: 'Mpc' | 'Proxy';
  };
}

export interface NativeProverHandle {
  /**
   * Legacy one-shot prove (auto-approves the reveal). Kept for callers that
   * don't need the user-approval gate.
   */
  prove: (params: NativeProveParams) => Promise<ProveResult>;
  /**
   * Phase A: run the protocol up through `compute_reveal`, return descriptors
   * with real byte previews. Pair with `finalizeReveal`.
   */
  prepareReveal: (params: NativeProveParams) => Promise<RevealPreparation>;
  /**
   * Phase B: complete or drop the prepared session.
   */
  finalizeReveal: (sessionId: string, approved: boolean) => Promise<ProveResult>;
  isReady: boolean;
}

export interface NativeProverProps {
  onReady?: () => void;
  onError?: (error: string) => void;
  onProgress?: (progress: ProveProgress) => void;
  /**
   * Initial native log level (forwarded to `TlsnNative.setLogLevel` after
   * initialize). Pass a Promise to compute the level asynchronously from your
   * app's config; resolve to `null` to skip the call. Defaults to skipping.
   */
  getLogLevel?: () => Promise<TlsnLogLevel | null>;
}

/** Map a Rust `tracing` level string to the in-app console's log level. */
function mapNativeLevel(level: string): LogLevel {
  switch (level.toUpperCase()) {
    case 'ERROR':
      return 'error';
    case 'WARN':
      return 'warn';
    case 'DEBUG':
    case 'TRACE':
      return 'debug';
    default:
      return 'info';
  }
}

// Lazy load the native module to avoid errors during metro bundling
let TlsnNative: {
  initialize: () => void;
  prove: (request: ProveRequest, options: ProverOptions) => Promise<ProveResult>;
  proveUntilReveal: (request: ProveRequest, options: ProverOptions) => Promise<RevealPreparation>;
  proveFinalize: (sessionId: string, approved: boolean) => Promise<ProveResult>;
  isAvailable: () => boolean;
  addProgressListener: (callback: (event: ProveProgress) => void) => { remove: () => void };
  drainNativeLogs: () => NativeLogLine[];
  setLogLevel: (level: TlsnLogLevel) => void;
} | null = null;

function getNativeModule() {
  if (TlsnNative === null && (Platform.OS === 'ios' || Platform.OS === 'android')) {
    try {
      // Dynamic require to avoid bundling errors when module isn't built yet
      TlsnNative = require('tlsn-native');
    } catch (e) {
      console.warn('[NativeProver] Native module not available:', e);
    }
  }
  return TlsnNative;
}

function NativeProverComponent(
  { onReady, onError, onProgress, getLogLevel }: NativeProverProps,
  ref: React.ForwardedRef<NativeProverHandle>,
) {
  const [isReady, setIsReady] = useState(false);
  const initAttempted = useRef(false);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress; // eslint-disable-line react-hooks/refs

  useEffect(() => {
    if (initAttempted.current) return;
    initAttempted.current = true;

    const initializeModule = async () => {
      try {
        const module = getNativeModule();
        if (!module) {
          console.log(
            '[NativeProver] Native module not available, likely running on web or not prebuilt',
          );
          onError?.('Native module not available');
          return;
        }

        if (!module.isAvailable()) {
          console.log('[NativeProver] Native module reports not available');
          onError?.('Native module not available');
          return;
        }

        console.log('[NativeProver] Initializing native module...');
        module.initialize();
        console.log('[NativeProver] Native module initialized successfully');
        setIsReady(true);
        onReady?.();

        // Forward the consumer's effective log level if one was supplied.
        if (getLogLevel) {
          getLogLevel()
            .then((level) => {
              if (level) module.setLogLevel(level);
            })
            .catch(() => {});
        }
      } catch (e) {
        console.error('[NativeProver] Failed to initialize:', e);
        onError?.(e instanceof Error ? e.message : 'Failed to initialize native module');
      }
    };

    initializeModule();
  }, [onReady, onError]);

  // Subscribe to native progress events.
  useEffect(() => {
    const module = getNativeModule();
    if (!module) return;

    const progressSub = module.addProgressListener((event: ProveProgress) => {
      console.log(
        `[NativeProver] Progress: ${event.step} ${Math.round(event.progress * 100)}% - ${event.message}`,
      );
      onProgressRef.current?.(event);
    });

    return () => progressSub.remove();
  }, []);

  // Poll the native log buffer into the in-app Logs screen. These lines carry
  // the actual MPC/TLS failure detail that progress events can't convey. Pulling
  // (vs a push callback) keeps the prover's worker threads off the JS bridge.
  useEffect(() => {
    const module = getNativeModule();
    if (!module) return;

    const drain = () => {
      let lines: NativeLogLine[] = [];
      try {
        lines = module.drainNativeLogs();
      } catch {
        return;
      }
      for (const line of lines) {
        addLog({
          source: 'native',
          level: mapNativeLevel(line.level),
          tag: line.target,
          text: line.message,
        });
      }
    };

    const id = setInterval(drain, 400);
    return () => {
      clearInterval(id);
      drain(); // final flush of anything buffered since the last tick
    };
  }, []);

  const buildRequestAndOptions = useCallback((params: NativeProveParams) => {
    const request: ProveRequest = {
      url: params.url,
      method: params.method,
      headers: params.headers,
    };
    const options: ProverOptions = {
      verifierUrl: params.proverOptions.verifierUrl,
      maxSentData: params.proverOptions.maxSentData,
      maxRecvData: params.proverOptions.maxRecvData,
      handlers: params.proverOptions.handlers || [],
      mode: params.proverOptions.mode,
    };
    return { request, options };
  }, []);

  const prove = useCallback(
    async (params: NativeProveParams): Promise<ProveResult> => {
      const module = getNativeModule();
      if (!module || !isReady) {
        throw new Error('Native prover not ready');
      }

      console.log('[NativeProver] Starting one-shot proof for', params.url);
      const { request, options } = buildRequestAndOptions(params);
      try {
        const result = await module.prove(request, options);
        console.log('[NativeProver] Proof generation complete');
        return result;
      } catch (e) {
        console.error('[NativeProver] Proof generation failed:', e);
        throw e;
      }
    },
    [isReady, buildRequestAndOptions],
  );

  const prepareReveal = useCallback(
    async (params: NativeProveParams): Promise<RevealPreparation> => {
      const module = getNativeModule();
      if (!module || !isReady) {
        throw new Error('Native prover not ready');
      }

      console.log('[NativeProver] proveUntilReveal for', params.url);
      const { request, options } = buildRequestAndOptions(params);
      try {
        const prep = await module.proveUntilReveal(request, options);
        console.log(
          '[NativeProver] Prepared reveal: session=',
          prep.sessionId,
          'descriptors=',
          prep.descriptors.length,
        );
        return prep;
      } catch (e) {
        console.error('[NativeProver] proveUntilReveal failed:', e);
        throw e;
      }
    },
    [isReady, buildRequestAndOptions],
  );

  const finalizeReveal = useCallback(
    async (sessionId: string, approved: boolean): Promise<ProveResult> => {
      const module = getNativeModule();
      if (!module || !isReady) {
        throw new Error('Native prover not ready');
      }

      console.log('[NativeProver] proveFinalize session=', sessionId, 'approved=', approved);
      try {
        return await module.proveFinalize(sessionId, approved);
      } catch (e) {
        console.error('[NativeProver] proveFinalize failed:', e);
        throw e;
      }
    },
    [isReady],
  );

  useImperativeHandle(
    ref,
    () => ({
      prove,
      prepareReveal,
      finalizeReveal,
      isReady,
    }),
    [prove, prepareReveal, finalizeReveal, isReady],
  );

  // This component has no UI
  return null;
}

export const NativeProver = forwardRef<NativeProverHandle, NativeProverProps>(
  NativeProverComponent,
);
NativeProver.displayName = 'NativeProver';
