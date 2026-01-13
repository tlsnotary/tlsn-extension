/**
 * Global type declarations for TLSNotary plugin runtime environment
 *
 * These functions are injected at runtime by the plugin sandbox.
 * Import this file in your plugin to get TypeScript support:
 *
 *   /// <reference types="@tlsn/plugin-sdk/globals" />
 */

import type {
  InterceptedRequest,
  InterceptedRequestHeader,
  Handler,
  DomOptions,
  DomJson,
} from './types';

declare global {
  /**
   * Create a div element
   */
  function div(options?: DomOptions, children?: (DomJson | string)[]): DomJson;
  function div(children?: (DomJson | string)[]): DomJson;

  /**
   * Create a button element
   */
  function button(options?: DomOptions, children?: (DomJson | string)[]): DomJson;
  function button(children?: (DomJson | string)[]): DomJson;

  /**
   * Get or initialize state value (React-like useState)
   */
  function useState<T>(key: string, initialValue: T): T;

  /**
   * Update state value
   */
  function setState<T>(key: string, value: T): void;

  /**
   * Run side effect when dependencies change (React-like useEffect)
   */
  function useEffect(effect: () => void, deps: any[]): void;

  /**
   * Subscribe to intercepted HTTP headers
   */
  function useHeaders(
    filter: (headers: InterceptedRequestHeader[]) => InterceptedRequestHeader[],
  ): [InterceptedRequestHeader | undefined];

  /**
   * Subscribe to intercepted HTTP requests
   */
  function useRequests(
    filter: (requests: InterceptedRequest[]) => InterceptedRequest[],
  ): [InterceptedRequest | undefined];

  /**
   * Open a new browser window for user interaction
   */
  function openWindow(
    url: string,
    options?: {
      width?: number;
      height?: number;
      showOverlay?: boolean;
    },
  ): Promise<void>;

  /**
   * Generate a TLS proof for an HTTP request
   */
  function prove(
    requestOptions: {
      url: string;
      method: string;
      headers: Record<string, string>;
      body?: string;
    },
    proverOptions: {
      verifierUrl: string;
      proxyUrl: string;
      maxRecvData?: number;
      maxSentData?: number;
      handlers: Handler[];
    },
  ): Promise<any>;

  /**
   * Complete plugin execution and return result
   */
  function done(result?: any): void;
}

export {};
