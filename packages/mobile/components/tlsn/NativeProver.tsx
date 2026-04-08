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
} from '../../modules/tlsn-native/src';

export type { HandlerType, HandlerPart, HandlerAction, HandlerParams, Handler, ProveProgress };

export interface NativeProveParams {
  url: string;
  method: string;
  headers: Record<string, string>;
  proverOptions: {
    verifierUrl: string;
    maxSentData: number;
    maxRecvData: number;
    handlers?: Handler[];
  };
}

export interface NativeProverHandle {
  prove: (params: NativeProveParams) => Promise<ProveResult>;
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

  const prove = useCallback(
    async (params: NativeProveParams): Promise<ProveResult> => {
      const module = getNativeModule();
      if (!module || !isReady) {
        throw new Error('Native prover not ready');
      }

      console.log('[NativeProver] Starting proof generation...');
      console.log('[NativeProver] URL:', params.url);

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
      };

      console.log(
        '[NativeProver] Handlers being passed to native:',
        JSON.stringify(options.handlers, null, 2),
      );
      console.log('[NativeProver] Full options:', JSON.stringify(options, null, 2));

      try {
        const result = await module.prove(request, options);
        console.log('[NativeProver] Proof generation complete');
        console.log('[NativeProver] Transcript:', JSON.stringify(result.transcript));
        console.log('[NativeProver] Debug info:', JSON.stringify((result as any).debug));
        return result;
      } catch (e) {
        console.error('[NativeProver] Proof generation failed:', e);
        throw e;
      }
    },
    [isReady],
  );

  useImperativeHandle(
    ref,
    () => ({
      prove,
      isReady,
    }),
    [prove, isReady],
  );

  // This component has no UI
  return null;
}

export const NativeProver = forwardRef<NativeProverHandle, NativeProverProps>(
  NativeProverComponent,
);
NativeProver.displayName = 'NativeProver';
