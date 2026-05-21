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
  RevealPreparation,
  RevealRangeDescriptor,
} from '../../modules/tlsn-native/src';

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

interface NativeProverProps {
  onReady?: () => void;
  onError?: (error: string) => void;
  onProgress?: (progress: ProveProgress) => void;
}

// Lazy load the native module to avoid errors during metro bundling
let TlsnNative: {
  initialize: () => void;
  prove: (request: ProveRequest, options: ProverOptions) => Promise<ProveResult>;
  proveUntilReveal: (request: ProveRequest, options: ProverOptions) => Promise<RevealPreparation>;
  proveFinalize: (sessionId: string, approved: boolean) => Promise<ProveResult>;
  isAvailable: () => boolean;
  addProgressListener: (callback: (event: ProveProgress) => void) => { remove: () => void };
} | null = null;

function getNativeModule() {
  if (TlsnNative === null && (Platform.OS === 'ios' || Platform.OS === 'android')) {
    try {
      // Dynamic require to avoid bundling errors when module isn't built yet
      TlsnNative = require('../../modules/tlsn-native/src');
    } catch (e) {
      console.warn('[NativeProver] Native module not available:', e);
    }
  }
  return TlsnNative;
}

function NativeProverComponent(
  { onReady, onError, onProgress }: NativeProverProps,
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
      } catch (e) {
        console.error('[NativeProver] Failed to initialize:', e);
        onError?.(e instanceof Error ? e.message : 'Failed to initialize native module');
      }
    };

    initializeModule();
  }, [onReady, onError]);

  // Subscribe to native progress events
  useEffect(() => {
    const module = getNativeModule();
    if (!module) return;

    const subscription = module.addProgressListener((event: ProveProgress) => {
      console.log(
        `[NativeProver] Progress: ${event.step} ${Math.round(event.progress * 100)}% - ${event.message}`,
      );
      onProgressRef.current?.(event);
    });

    return () => subscription.remove();
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
