import { Platform } from 'react-native';
import { EventEmitter, type Subscription } from 'expo-modules-core';

// Import the native module
import TlsnNativeModule from './TlsnNativeModule';

export interface HttpHeader {
  name: string;
  value: string;
}

export interface ProveRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

// Handler types matching Rust enums
export type HandlerType = 'Sent' | 'Recv';
export type HandlerPart = 'StartLine' | 'Headers' | 'Body' | 'All';
export type HandlerAction = 'Reveal';

export interface HandlerParams {
  key?: string; // For HEADERS: specific header key
  contentType?: string; // For BODY: "json" for JSON parsing
  path?: string; // For BODY with JSON: JSON path like "items.0.name"
}

export interface Handler {
  handlerType: HandlerType;
  part: HandlerPart;
  action: HandlerAction;
  params?: HandlerParams;
}

export interface ProverOptions {
  verifierUrl: string;
  maxSentData?: number;
  maxRecvData?: number;
  handlers?: Handler[];
}

export interface ProveResult {
  status: number;
  headers: HttpHeader[];
  body: unknown;
  transcript: {
    sentLength: number;
    recvLength: number;
  };
  /** Debug: number of handlers received by Rust */
  handlersReceived?: number;
}

export interface ProveProgress {
  step: string;
  progress: number;
  message: string;
}

const emitter = new EventEmitter(TlsnNativeModule);

/**
 * Initialize the TLSN library.
 * Call this once at app startup.
 */
export function initialize(): void {
  return TlsnNativeModule.initialize();
}

/**
 * Generate a TLS notary proof for an HTTP request.
 *
 * @param request - The HTTP request to prove
 * @param options - Prover options including verifier and proxy URLs
 * @returns Promise resolving to the proof result
 */
export async function prove(request: ProveRequest, options: ProverOptions): Promise<ProveResult> {
  const isAndroid = Platform.OS === 'android';

  // On Android emulator, localhost refers to the emulator itself.
  // Rewrite to 10.0.2.2 which routes to the host machine.
  if (isAndroid && options.verifierUrl) {
    options = {
      ...options,
      verifierUrl: options.verifierUrl
        .replace('://localhost', '://10.0.2.2')
        .replace('://127.0.0.1', '://10.0.2.2'),
    };
  }

  // Android's Expo Kotlin bridge can't auto-convert nested JS objects,
  // so we serialize to JSON strings and parse on the native side.
  if (isAndroid) {
    return TlsnNativeModule.prove(
      JSON.stringify(request),
      JSON.stringify(options),
    ) as unknown as Promise<ProveResult>;
  }
  return TlsnNativeModule.prove(request, options) as unknown as Promise<ProveResult>;
}

/**
 * Subscribe to proof progress events from the native prover.
 *
 * @param callback - Called with progress data at each proof step
 * @returns Subscription that can be removed when no longer needed
 */
export function addProgressListener(callback: (event: ProveProgress) => void): Subscription {
  return emitter.addListener('onProveProgress', callback);
}

/**
 * Check if the native TLSN module is available.
 */
export function isAvailable(): boolean {
  return TlsnNativeModule.isAvailable();
}
