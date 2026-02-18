/**
 * Global type declarations for TLSNotary plugin runtime environment
 *
 * These functions are injected at runtime by the plugin sandbox.
 * They are automatically available as globals in TypeScript plugins.
 */

import type {
  InterceptedRequest,
  InterceptedRequestHeader,
  Handler,
  DomOptions,
  DomJson,
} from './types';

/**
 * Create a div DOM element
 */
export type DivFunction = {
  (options?: DomOptions, children?: DomJson[]): DomJson;
  (children: DomJson[]): DomJson;
};

/**
 * Create a button DOM element
 */
export type ButtonFunction = {
  (options?: DomOptions, children?: DomJson[]): DomJson;
  (children: DomJson[]): DomJson;
};

/**
 * Open a new browser window
 */
export type OpenWindowFunction = (
  url: string,
  options?: {
    width?: number;
    height?: number;
    showOverlay?: boolean;
  },
) => Promise<{
  windowId: number;
  uuid: string;
  tabId: number;
}>;

/**
 * React-like effect hook that runs when dependencies change
 */
export type UseEffectFunction = (callback: () => void, deps: any[]) => void;

/**
 * Subscribe to intercepted HTTP headers with filtering
 */
export type UseHeadersFunction = (
  filter: (headers: InterceptedRequestHeader[]) => InterceptedRequestHeader[],
) => InterceptedRequestHeader[];

/**
 * Subscribe to intercepted HTTP requests with filtering
 */
export type UseRequestsFunction = (
  filter: (requests: InterceptedRequest[]) => InterceptedRequest[],
) => InterceptedRequest[];

/**
 * Get state value (does not trigger re-render)
 */
export type UseStateFunction = <T>(key: string, defaultValue: T) => T;

/**
 * Set state value (triggers UI re-render)
 */
export type SetStateFunction = <T>(key: string, value: T) => void;

/**
 * Generate TLS proof using the unified prove() API
 */
export type ProveFunction = (
  requestOptions: {
    url: string;
    method: string;
    headers: Record<string, string | undefined>;
    body?: string;
  },
  proverOptions: {
    verifierUrl: string;
    proxyUrl: string;
    maxRecvData?: number;
    maxSentData?: number;
    handlers: Handler[];
  },
) => Promise<any>;

/**
 * Complete plugin execution and return result
 */
export type DoneFunction = (result?: any) => void;

/**
 * Complete Plugin API surface available in the QuickJS sandbox
 */
export interface PluginAPI {
  div: DivFunction;
  button: ButtonFunction;
  openWindow: OpenWindowFunction;
  useEffect: UseEffectFunction;
  useHeaders: UseHeadersFunction;
  useRequests: UseRequestsFunction;
  useState: UseStateFunction;
  setState: SetStateFunction;
  prove: ProveFunction;
  done: DoneFunction;
}

/**
 * Global declarations for plugin environment
 *
 * These are automatically available in TypeScript plugins without imports.
 */
declare global {
  const div: DivFunction;
  const button: ButtonFunction;
  const openWindow: OpenWindowFunction;
  const useEffect: UseEffectFunction;
  const useHeaders: UseHeadersFunction;
  const useRequests: UseRequestsFunction;
  const useState: UseStateFunction;
  const setState: SetStateFunction;
  const prove: ProveFunction;
  const done: DoneFunction;
}

export {};
