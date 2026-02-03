import { NativeModulesProxy, EventEmitter, Subscription } from 'expo-modules-core';

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

export interface ProverOptions {
  verifierUrl: string;
  proxyUrl: string;
  maxSentData?: number;
  maxRecvData?: number;
}

export interface ProveResult {
  status: number;
  headers: HttpHeader[];
  body: unknown;
  transcript: {
    sentLength: number;
    recvLength: number;
  };
}

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
export async function prove(
  request: ProveRequest,
  options: ProverOptions
): Promise<ProveResult> {
  return TlsnNativeModule.prove(request, options);
}

/**
 * Check if the native TLSN module is available.
 */
export function isAvailable(): boolean {
  return TlsnNativeModule.isAvailable();
}
