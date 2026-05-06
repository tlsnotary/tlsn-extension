/**
 * @tlsn/plugin-sdk — platform-agnostic plugin runtime
 *
 * This module contains everything that does not depend on a specific
 * JavaScript evaluator (QuickJS WASM, new Function(), native QuickJS, …).
 * Platform-specific code lives in index.ts (QuickJS) or in the consuming
 * platform's host class (e.g. MobilePluginHost).
 */

import { v4 as uuidv4 } from 'uuid';
import { logger, LogLevel, DEFAULT_LOG_LEVEL } from '@tlsn/common';
import {
  DomJson,
  DomOptions,
  ExecutionContext,
  InterceptedRequest,
  InterceptedRequestHeader,
  OpenWindowResponse,
  WindowMessage,
  Handler,
  PluginConfig,
  ProveProgressData,
  RevealRangeDescriptor,
  canonicalizeHandlers,
} from './types';
import deepEqual from 'fast-deep-equal';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type HookContext = {
  [functionName: string]: {
    effects: unknown[][];
    selectors: unknown[][];
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyFunction = (...args: any[]) => any;

// ---------------------------------------------------------------------------
// PluginEvaluator — the single platform-specific seam
// ---------------------------------------------------------------------------

export interface PluginEvaluatorResult {
  /** Exported functions from the plugin code (main, onClick handlers, config, …) */
  exports: Record<string, unknown>;
  /** Called by HostCore when the plugin finishes (success or error). */
  dispose: () => void;
}

/**
 * Abstraction over the JavaScript sandbox used to execute plugin code.
 *
 * - Extension: QuickJS WASM (via @sebastianwessel/quickjs)
 * - Mobile:    new Function() (Hermes-safe, no WASM)
 * - Tests:     new Function() mock evaluator
 */
export interface PluginEvaluator {
  evaluate(code: string, capabilities: Record<string, AnyFunction>): Promise<PluginEvaluatorResult>;
}

// ---------------------------------------------------------------------------
// HostCoreOptions
// ---------------------------------------------------------------------------

export interface HostCoreOptions {
  evaluator: PluginEvaluator;
  onProve: (
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
    onProgress?: (data: ProveProgressData) => void,
  ) => Promise<unknown>;
  onRenderPluginUi: (windowId: number, result: DomJson) => void;
  onCloseWindow: (windowId: number) => void;
  onOpenWindow: (
    url: string,
    options?: {
      width?: number;
      height?: number;
      showOverlay?: boolean;
    },
  ) => Promise<OpenWindowResponse>;
  logLevel?: LogLevel;
  reRenderEvent?: string;
  enableTimeout?: boolean;
}

// ---------------------------------------------------------------------------
// Module-level registry (avoids circular references in capability closures)
// ---------------------------------------------------------------------------

export const executionContextRegistry = new Map<string, ExecutionContext>();

// ---------------------------------------------------------------------------
// Timeout constants
// ---------------------------------------------------------------------------

export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000;
export const MIN_TIMEOUT_MS = 2 * 60 * 1000;
export const MAX_TIMEOUT_MS = 60 * 60 * 1000;
export const TIMEOUT_WARNING_LEAD_MS = 60 * 1000;
export const TIMEOUT_EXTEND_MS = 5 * 60 * 1000;

export function clampTimeout(value?: number): number {
  if (value == null) return DEFAULT_TIMEOUT_MS;
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, value));
}

// ---------------------------------------------------------------------------
// Pure helper functions
// ---------------------------------------------------------------------------

export function updateExecutionContext(
  uuid: string,
  params: {
    windowId?: number;
    plugin?: string;
    requests?: InterceptedRequest[];
    headers?: InterceptedRequestHeader[];
    context?: HookContext;
    currentContext?: string;
    stateStore?: Record<string, unknown>;
    revealApproval?: { resolve: () => void; reject: (err: Error) => void } | null;
    revealApprovalDescriptors?: RevealRangeDescriptor[] | null;
    revealWasRejected?: boolean;
  },
): void {
  const context = executionContextRegistry.get(uuid);
  if (!context) {
    throw new Error('Execution context not found');
  }
  executionContextRegistry.set(uuid, { ...context, ...params });
}

export function createDomJson(
  type: 'div' | 'button' | 'input',
  param1: DomOptions | DomJson[] = {},
  param2: DomJson[] = [],
): DomJson {
  let options: DomOptions = {};
  let children: DomJson[] = [];

  if (Array.isArray(param1)) {
    children = param1;
  } else if (typeof param1 === 'object') {
    options = param1;
    children = param2;
  }

  return { type, options, children };
}

export function getJsonBody(request: InterceptedRequest): unknown {
  const bytes = request.requestBody?.raw?.[0]?.bytes;
  if (!bytes) return null;

  const text = String.fromCharCode(
    ...(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes),
  );

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Hook factories
// ---------------------------------------------------------------------------

export function makeUseEffect(uuid: string, context: HookContext) {
  return (effect: () => void, deps: unknown[]) => {
    const executionContext = executionContextRegistry.get(uuid);
    if (!executionContext) {
      throw new Error('Execution context not found');
    }
    const functionName = executionContext.currentContext;
    context[functionName] = context[functionName] || { effects: [], selectors: [] };
    const effects = context[functionName].effects;
    const lastDeps = executionContext.context[functionName]?.effects[effects.length];
    effects.push(deps);
    if (deepEqual(lastDeps, deps)) {
      return;
    }
    effect();
  };
}

export function makeUseRequests(uuid: string, context: HookContext) {
  return (filterFn: (requests: InterceptedRequest[]) => InterceptedRequest[]) => {
    const executionContext = executionContextRegistry.get(uuid);
    if (!executionContext) {
      throw new Error('Execution context not found');
    }
    const functionName = executionContext.currentContext;
    context[functionName] = context[functionName] || { effects: [], selectors: [] };
    const selectors = context[functionName].selectors;
    const requests = JSON.parse(JSON.stringify(executionContext.requests || []));
    const result = filterFn(requests);
    selectors.push(result);
    return result;
  };
}

export function makeUseHeaders(uuid: string, context: HookContext) {
  return (filterFn: (headers: InterceptedRequestHeader[]) => InterceptedRequestHeader[]) => {
    const executionContext = executionContextRegistry.get(uuid);
    if (!executionContext) {
      throw new Error('Execution context not found');
    }
    const functionName = executionContext.currentContext;
    context[functionName] = context[functionName] || { effects: [], selectors: [] };
    const selectors = context[functionName].selectors;
    const headers = JSON.parse(JSON.stringify(executionContext.headers || []));
    const result = filterFn(headers);

    if (result === undefined) {
      throw new Error(`useHeaders: filter function returned undefined. expect an array`);
    }
    if (!Array.isArray(result)) {
      throw new Error(`useHeaders: filter function must return an array, got ${typeof result}. `);
    }

    selectors.push(result);
    return result;
  };
}

export function makeUseState(
  uuid: string,
  stateStore: Record<string, unknown>,
  _eventEmitter: {
    emit: (message: WindowMessage) => void;
  },
) {
  return (key: string, defaultValue: unknown) => {
    const executionContext = executionContextRegistry.get(uuid);
    if (!executionContext) {
      throw new Error('Execution context not found');
    }
    if (!(key in stateStore) && defaultValue !== undefined) {
      stateStore[key] = defaultValue;
    }
    return stateStore[key];
  };
}

export function makeSetState(
  uuid: string,
  stateStore: Record<string, unknown>,
  eventEmitter: {
    emit: (message: WindowMessage) => void;
  },
  reRenderEvent: string,
) {
  return (key: string, value: unknown) => {
    const executionContext = executionContextRegistry.get(uuid);
    if (!executionContext) {
      throw new Error('Execution context not found');
    }
    stateStore[key] = value;
    if (deepEqual(stateStore, executionContext.stateStore)) {
      return;
    }

    eventEmitter.emit({
      type: reRenderEvent,
      windowId: executionContextRegistry.get(uuid)?.windowId || 0,
    } as WindowMessage);
  };
}

export function makeUsePluginTimeout(stateStore: Record<string, unknown>) {
  return (): { remaining: number; total: number } | null => {
    return (stateStore['_pluginTimeout'] as { remaining: number; total: number }) ?? null;
  };
}

// ---------------------------------------------------------------------------
// PluginLifecycle
// ---------------------------------------------------------------------------

export interface PluginLifecycle {
  isCompleted: boolean;
  pendingCallbacks: number;
  onDrain: (() => void) | null;
}

// ---------------------------------------------------------------------------
// makeOpenWindow
// ---------------------------------------------------------------------------

export function makeOpenWindow(
  uuid: string,
  eventEmitter: {
    addListener: (listener: (message: WindowMessage) => void) => void;
    removeListener: (listener: (message: WindowMessage) => void) => void;
  },
  onOpenWindow: (
    url: string,
    options?: {
      width?: number;
      height?: number;
      showOverlay?: boolean;
    },
  ) => Promise<OpenWindowResponse>,
  _onCloseWindow: (windowId: number) => void,
  lifecycle: PluginLifecycle,
  onError?: (error: Error) => void,
) {
  let cachedResult: { windowId: number; uuid: string; tabId: number } | null = null;

  return async (
    url: string,
    options?: {
      width?: number;
      height?: number;
      showOverlay?: boolean;
    },
  ): Promise<{ windowId: number; uuid: string; tabId: number }> => {
    if (!url || typeof url !== 'string') {
      throw new Error('URL must be a non-empty string');
    }

    if (cachedResult) {
      return cachedResult;
    }

    let resolvedWindowId: number | null = null;
    const pendingMessages: WindowMessage[] = [];

    const onMessage = async (message: WindowMessage) => {
      if (resolvedWindowId === null) {
        pendingMessages.push(message);
        return;
      }

      if (message.type === 'WINDOW_CLOSED') {
        const executionContext = executionContextRegistry.get(uuid);
        const ourWindowId = executionContext?.windowId ?? resolvedWindowId;

        if (ourWindowId != null && message.windowId !== ourWindowId) {
          return;
        }

        eventEmitter.removeListener(onMessage);

        if (!lifecycle.isCompleted && onError) {
          onError(new Error('Window closed by user'));
        }
        return;
      }

      if (lifecycle.isCompleted) {
        logger.debug(`[makeOpenWindow] Ignoring message ${message.type}: plugin has completed`);
        eventEmitter.removeListener(onMessage);
        return;
      }

      const executionContext = executionContextRegistry.get(uuid);
      if (!executionContext) {
        logger.debug(
          `[makeOpenWindow] Ignoring message ${message.type}: execution context no longer exists`,
        );
        eventEmitter.removeListener(onMessage);
        return;
      }

      if (message.windowId !== executionContext.windowId) {
        return;
      }

      try {
        if (message.type === 'REQUEST_INTERCEPTED') {
          const request = message.request;
          updateExecutionContext(uuid, {
            requests: [...(executionContext.requests || []), request],
          });
          executionContext.main();
        }

        if (message.type === 'REQUESTS_BATCH') {
          const requests = message.requests;
          updateExecutionContext(uuid, {
            requests: [...(executionContext.requests || []), ...requests],
          });
          executionContext.main();
        }

        if (message.type === 'HEADER_INTERCEPTED') {
          const header = message.header;
          updateExecutionContext(uuid, {
            headers: [...(executionContext.headers || []), header],
          });
          executionContext.main();
        }

        if (message.type === 'HEADERS_BATCH') {
          const headers = message.headers;
          updateExecutionContext(uuid, {
            headers: [...(executionContext.headers || []), ...headers],
          });
          executionContext.main();
        }

        if (message.type === 'PLUGIN_UI_CLICK') {
          logger.debug('PLUGIN_UI_CLICK', message);
          if (message.onclick === '_revealApprove') {
            const liveCtx = executionContextRegistry.get(uuid);
            const approval = liveCtx?.revealApproval;
            if (approval) {
              updateExecutionContext(uuid, {
                revealApproval: null,
                revealApprovalDescriptors: null,
              });
              approval.resolve();
            }
            return;
          }
          if (message.onclick === '_revealReject') {
            const liveCtx = executionContextRegistry.get(uuid);
            const approval = liveCtx?.revealApproval;
            if (approval) {
              updateExecutionContext(uuid, {
                revealApproval: null,
                revealApprovalDescriptors: null,
                revealWasRejected: true,
              });
              approval.reject(new Error('User rejected reveal'));
            }
            return;
          }
          const cb = executionContext.callbacks[message.onclick];

          logger.debug('Callback:', cb);
          if (cb) {
            lifecycle.pendingCallbacks++;
            try {
              updateExecutionContext(uuid, {
                currentContext: message.onclick,
              });
              const result = await cb();
              if (executionContextRegistry.has(uuid)) {
                updateExecutionContext(uuid, {
                  currentContext: '',
                });
              }
              logger.debug('Callback result:', result);
            } finally {
              lifecycle.pendingCallbacks--;
              if (lifecycle.pendingCallbacks === 0 && lifecycle.onDrain) {
                lifecycle.onDrain();
                lifecycle.onDrain = null;
              }
            }
          }
        }

        if (message.type === 'RE_RENDER_PLUGIN_UI') {
          logger.debug('[makeOpenWindow] RE_RENDER_PLUGIN_UI', message.windowId);
          executionContext.main(true);
        }
      } catch (error) {
        logger.error(`[makeOpenWindow] Error handling message ${message.type}:`, error);
        eventEmitter.removeListener(onMessage);
        const err = error instanceof Error ? error : new Error(String(error));
        if (onError) {
          onError(err);
        }
      }
    };

    eventEmitter.addListener(onMessage);

    try {
      const response = await onOpenWindow(url, options);

      if (response?.type === 'WINDOW_ERROR') {
        throw new Error(
          response.payload?.details || response.payload?.error || 'Failed to open window',
        );
      }

      if (response?.type === 'WINDOW_OPENED' && response.payload) {
        const windowId = response.payload.windowId;

        if (!executionContextRegistry.has(uuid)) {
          eventEmitter.removeListener(onMessage);
          cachedResult = {
            windowId: response.payload.windowId,
            uuid: response.payload.uuid,
            tabId: response.payload.tabId,
          };
          return cachedResult;
        }

        updateExecutionContext(uuid, { windowId });

        const executionContext = executionContextRegistry.get(uuid);
        if (executionContext) {
          let headers = executionContext.headers || [];
          let requests = executionContext.requests || [];
          let bufferedCount = 0;
          let windowWasClosed = false;

          for (const msg of pendingMessages) {
            if (msg.windowId !== windowId) continue;

            if (msg.type === 'WINDOW_CLOSED') {
              windowWasClosed = true;
            } else if (msg.type === 'HEADER_INTERCEPTED' && msg.header) {
              headers = [...headers, msg.header];
              bufferedCount++;
            } else if (msg.type === 'HEADERS_BATCH' && msg.headers) {
              headers = [...headers, ...msg.headers];
              bufferedCount += msg.headers.length;
            } else if (msg.type === 'REQUEST_INTERCEPTED' && msg.request) {
              requests = [...requests, msg.request];
              bufferedCount++;
            } else if (msg.type === 'REQUESTS_BATCH' && msg.requests) {
              requests = [...requests, ...msg.requests];
              bufferedCount += msg.requests.length;
            }
          }

          if (bufferedCount > 0) {
            logger.debug(
              `[makeOpenWindow] Replaying ${bufferedCount} buffered message(s) into execution context`,
            );
            updateExecutionContext(uuid, { headers, requests });
            executionContext.main(true);
          }

          if (windowWasClosed) {
            eventEmitter.removeListener(onMessage);
            if (!lifecycle.isCompleted && onError) {
              onError(new Error('Window closed by user'));
            }
            pendingMessages.length = 0;
            cachedResult = {
              windowId: response.payload.windowId,
              uuid: response.payload.uuid,
              tabId: response.payload.tabId,
            };
            return cachedResult;
          }
        }
        pendingMessages.length = 0;
        resolvedWindowId = windowId;

        cachedResult = {
          windowId: response.payload.windowId,
          uuid: response.payload.uuid,
          tabId: response.payload.tabId,
        };
        return cachedResult;
      }

      throw new Error('Invalid response from background script');
    } catch (error) {
      eventEmitter.removeListener(onMessage);
      logger.error('[makeOpenWindow] Failed to open window:', error);
      throw error;
    }
  };
}

// ---------------------------------------------------------------------------
// Overlay helpers
// ---------------------------------------------------------------------------

export function createCompletionOverlay(
  title = 'Proof complete!',
  message = 'This window will close shortly.',
): DomJson {
  return {
    type: 'div',
    options: {
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '9999999',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      },
    },
    children: [
      {
        type: 'div',
        options: {
          style: {
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '40px 48px',
            textAlign: 'center',
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.25)',
            maxWidth: '360px',
            width: '90%',
          },
        },
        children: [
          {
            type: 'div',
            options: {
              style: {
                width: '72px',
                height: '72px',
                margin: '0 auto 20px auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '48px',
              },
            },
            children: ['✅'],
          },
          {
            type: 'div',
            options: {
              style: {
                fontSize: '22px',
                fontWeight: '700',
                color: '#111827',
                marginBottom: '8px',
                letterSpacing: '-0.02em',
              },
            },
            children: [title],
          },
          {
            type: 'div',
            options: {
              style: {
                fontSize: '14px',
                color: '#6b7280',
                lineHeight: '1.5',
              },
            },
            children: [message],
          },
        ],
      },
    ],
  };
}

export function createTimeoutWarningOverlay(): DomJson {
  return {
    type: 'div',
    options: {
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '9999999',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      },
    },
    children: [
      {
        type: 'div',
        options: {
          style: {
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '40px 48px',
            textAlign: 'center',
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.25)',
            maxWidth: '360px',
            width: '90%',
          },
        },
        children: [
          {
            type: 'div',
            options: {
              style: {
                width: '72px',
                height: '72px',
                margin: '0 auto 20px auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '48px',
              },
            },
            children: ['⏱️'],
          },
          {
            type: 'div',
            options: {
              style: {
                fontSize: '22px',
                fontWeight: '700',
                color: '#111827',
                marginBottom: '8px',
                letterSpacing: '-0.02em',
              },
            },
            children: ['Plugin Timeout Warning'],
          },
          {
            type: 'div',
            options: {
              style: {
                fontSize: '14px',
                color: '#6b7280',
                lineHeight: '1.5',
                marginBottom: '24px',
              },
            },
            children: ['The plugin will time out in less than 1 minute.'],
          },
          {
            type: 'button',
            options: {
              onclick: '_extendTimeout',
              style: {
                padding: '12px 24px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: '#2563eb',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                marginRight: '12px',
              },
            },
            children: ['Extend by 5 min'],
          },
          {
            type: 'button',
            options: {
              onclick: '_dismissTimeoutWarning',
              style: {
                padding: '12px 24px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                backgroundColor: '#ffffff',
                color: '#374151',
                fontSize: '14px',
                cursor: 'pointer',
              },
            },
            children: ['Let it expire'],
          },
        ],
      },
    ],
  };
}

export function createRevealApprovalOverlay(descriptors: RevealRangeDescriptor[]): DomJson {
  const sentDescriptors = descriptors.filter((d) => d.direction === 'SENT');
  const recvDescriptors = descriptors.filter((d) => d.direction === 'RECV');

  const renderDescriptorRow = (descriptor: RevealRangeDescriptor): DomJson => {
    const isReveal = descriptor.action === 'REVEAL';
    return {
      type: 'div',
      options: {
        style: {
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          marginBottom: '8px',
        },
      },
      children: [
        {
          type: 'div',
          options: {
            style: { fontSize: '12px', color: '#374151', minWidth: '120px' },
          },
          children: [descriptor.label],
        },
        {
          type: 'div',
          options: {
            style: {
              fontSize: '11px',
              fontWeight: '600',
              padding: '2px 6px',
              borderRadius: '4px',
              backgroundColor: isReveal ? '#d1fae5' : '#fef3c7',
              color: isReveal ? '#065f46' : '#92400e',
            },
          },
          children: [descriptor.action],
        },
        {
          type: 'div',
          options: {
            style: {
              fontFamily: 'monospace',
              fontSize: '11px',
              color: isReveal ? '#6b7280' : '#9ca3af',
              fontStyle: isReveal ? 'normal' : 'italic',
              wordBreak: 'break-all',
            },
          },
          children: [descriptor.preview],
        },
      ],
    };
  };

  const renderSection = (
    title: 'Sent' | 'Received',
    sectionDescriptors: RevealRangeDescriptor[],
  ): DomJson => ({
    type: 'div',
    options: { style: { marginBottom: '16px' } },
    children: [
      {
        type: 'div',
        options: {
          style: {
            fontSize: '12px',
            fontWeight: '600',
            color: '#6b7280',
            textTransform: 'uppercase',
            marginBottom: '8px',
          },
        },
        children: [title],
      },
      ...sectionDescriptors.map(renderDescriptorRow),
    ],
  });

  const cardChildren: DomJson[] = [
    {
      type: 'div',
      options: {
        style: {
          fontSize: '20px',
          fontWeight: '700',
          color: '#111827',
          marginBottom: '16px',
        },
      },
      children: ['Approve Reveal to Verifier'],
    },
  ];

  if (sentDescriptors.length > 0) cardChildren.push(renderSection('Sent', sentDescriptors));
  if (recvDescriptors.length > 0) cardChildren.push(renderSection('Received', recvDescriptors));

  cardChildren.push({
    type: 'div',
    options: {
      style: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
        marginTop: '24px',
      },
    },
    children: [
      {
        type: 'button',
        options: {
          onclick: '_revealReject',
          style: {
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            border: 'none',
            padding: '8px 20px',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer',
          },
        },
        children: ['Reject'],
      },
      {
        type: 'button',
        options: {
          onclick: '_revealApprove',
          style: {
            backgroundColor: '#d1fae5',
            color: '#065f46',
            border: 'none',
            padding: '8px 20px',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer',
          },
        },
        children: ['Approve'],
      },
    ],
  });

  return {
    type: 'div',
    options: {
      style: {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: '9999998',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      },
    },
    children: [
      {
        type: 'div',
        options: {
          style: {
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '32px',
            maxWidth: '520px',
            width: '90%',
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.25)',
          },
        },
        children: cardChildren,
      },
    ],
  };
}

export function decorateJson(base: DomJson, overlays: DomJson[]): DomJson {
  if (overlays.length === 0) return base;
  return {
    type: 'div',
    options: { style: {} },
    children: [base, ...overlays],
  };
}

// ---------------------------------------------------------------------------
// waitForWindow utility
// ---------------------------------------------------------------------------

export async function waitForWindow(
  callback: () => Promise<number | undefined>,
  retry = 0,
): Promise<number | null> {
  const resp = await callback();

  if (resp) return resp;

  if (retry < 100) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    return waitForWindow(callback, retry + 1);
  }

  return null;
}

// ---------------------------------------------------------------------------
// HostCore
// ---------------------------------------------------------------------------

export class HostCore {
  protected capabilities: Map<string, AnyFunction> = new Map();
  private evaluator: PluginEvaluator;
  private onProve: HostCoreOptions['onProve'];
  private onRenderPluginUi: (windowId: number, result: DomJson) => void;
  private onCloseWindow: (windowId: number) => void;
  private onOpenWindow: HostCoreOptions['onOpenWindow'];
  private _activeUuid: string | null = null;
  private reRenderEvent: string;
  private enableTimeout: boolean;

  constructor(options: HostCoreOptions) {
    this.evaluator = options.evaluator;
    this.onProve = options.onProve;
    this.onRenderPluginUi = options.onRenderPluginUi;
    this.onCloseWindow = options.onCloseWindow;
    this.onOpenWindow = options.onOpenWindow;
    this.reRenderEvent = options.reRenderEvent ?? 'TO_BG_RE_RENDER_PLUGIN_UI';
    this.enableTimeout = options.enableTimeout ?? true;

    logger.init(options.logLevel ?? DEFAULT_LOG_LEVEL);
  }

  addCapability(name: string, handler: AnyFunction): void {
    this.capabilities.set(name, handler);
  }

  async executePlugin(
    code: string,
    {
      eventEmitter,
    }: {
      eventEmitter: {
        addListener: (listener: (message: WindowMessage) => void) => void;
        removeListener: (listener: (message: WindowMessage) => void) => void;
        emit: (message: WindowMessage) => void;
      };
    },
  ): Promise<unknown> {
    const uuid = uuidv4();
    this._activeUuid = uuid;

    const reRenderEvent = this.reRenderEvent;

    const context: HookContext = {};
    const stateStore: Record<string, unknown> = {};

    let doneResolve: (value?: unknown) => void;
    let doneReject: (error: Error) => void;

    const lifecycle: PluginLifecycle = {
      isCompleted: false,
      pendingCallbacks: 0,
      onDrain: null,
    };

    const donePromise = new Promise((resolve, reject) => {
      doneResolve = resolve;
      doneReject = reject;
    });

    const DRAIN_TIMEOUT_MS = 30_000;

    const waitForPendingCallbacks = (): Promise<void> => {
      if (lifecycle.pendingCallbacks === 0) return Promise.resolve();

      if (lifecycle.onDrain !== null) {
        logger.warn(
          '[executePlugin] onDrain already set — multiple waiters detected, this is a bug',
        );
      }

      return new Promise<void>((resolve) => {
        lifecycle.onDrain = resolve;

        setTimeout(() => {
          if (lifecycle.onDrain === resolve) {
            logger.warn(
              `[executePlugin] Timed out waiting for ${lifecycle.pendingCallbacks} callback(s) to drain after ${DRAIN_TIMEOUT_MS}ms — forcing disposal`,
            );
            lifecycle.onDrain = null;
            resolve();
          }
        }, DRAIN_TIMEOUT_MS);
      });
    };

    // Mutable reference: updated once evaluate() resolves.
    // terminateWithError / done / doneWithOverlay all call this.
    let dispose: () => void = () => {};

    const terminateWithError = (error: Error) => {
      if (lifecycle.isCompleted) return;
      lifecycle.isCompleted = true;
      logger.error('[executePlugin] Plugin terminated with error:', error);

      const ctx = executionContextRegistry.get(uuid);
      const pendingApproval = ctx?.revealApproval;
      if (pendingApproval) {
        try {
          pendingApproval.reject(error);
        } catch (rejectError) {
          logger.error('[executePlugin] Error rejecting pending reveal approval:', rejectError);
        }
      }
      if (ctx?.windowId) {
        try {
          this.onCloseWindow(ctx.windowId);
        } catch (closeError) {
          logger.error('[executePlugin] Error closing window:', closeError);
        }
      }

      const finalize = () => {
        executionContextRegistry.delete(uuid);
        doneReject(error);
        try {
          dispose();
        } catch (disposeError) {
          logger.error('[executePlugin] Error disposing evaluator:', disposeError);
        }
      };

      if (lifecycle.pendingCallbacks > 0) {
        logger.debug(
          `[executePlugin] Deferring disposal: ${lifecycle.pendingCallbacks} callback(s) in-flight`,
        );
        waitForPendingCallbacks().then(finalize);
      } else {
        finalize();
      }
    };

    const onCloseWindow = this.onCloseWindow;
    const onRenderPluginUi = this.onRenderPluginUi;
    const onOpenWindow = this.onOpenWindow;
    const onProve = this.onProve;

    // Build the capabilities map that is passed to the evaluator.
    // Custom capabilities (addCapability) are merged in last.
    const capabilities: Record<string, AnyFunction> = {
      div: (param1?: DomOptions | DomJson[], param2?: DomJson[]) =>
        createDomJson('div', param1, param2),
      button: (param1?: DomOptions | DomJson[], param2?: DomJson[]) =>
        createDomJson('button', param1, param2),
      input: (param1?: DomOptions | DomJson[], param2?: DomJson[]) =>
        createDomJson('input', param1, param2),
      openWindow: makeOpenWindow(
        uuid,
        eventEmitter,
        onOpenWindow,
        onCloseWindow,
        lifecycle,
        (err: Error) => terminateWithError(err),
      ),
      useEffect: makeUseEffect(uuid, context),
      useRequests: makeUseRequests(uuid, context),
      useHeaders: makeUseHeaders(uuid, context),
      useState: makeUseState(uuid, stateStore, eventEmitter),
      setState: makeSetState(uuid, stateStore, eventEmitter, reRenderEvent),
      usePluginTimeout: makeUsePluginTimeout(stateStore),
      prove: async (
        requestOptions: Parameters<typeof onProve>[0],
        proverOptions: Parameters<typeof onProve>[1],
      ) => {
        const setProgress = (data: ProveProgressData) => {
          stateStore['_proveProgress'] = data;
          eventEmitter.emit({
            type: reRenderEvent,
            windowId: executionContextRegistry.get(uuid)?.windowId || 0,
          } as WindowMessage);
        };
        setProgress({ step: 'CONNECTING', progress: 0, message: 'Connecting...' });
        try {
          const canonicalProverOptions = {
            ...proverOptions,
            handlers: canonicalizeHandlers(proverOptions.handlers),
          };
          const result = await onProve(requestOptions, canonicalProverOptions, setProgress);
          setProgress({ step: 'COMPLETE', progress: 1, message: 'Complete' });
          return result;
        } catch (err) {
          stateStore['_proveProgress'] = null;
          eventEmitter.emit({
            type: reRenderEvent,
            windowId: executionContextRegistry.get(uuid)?.windowId || 0,
          } as WindowMessage);
          throw err;
        }
      },
      done: (args?: unknown) => {
        if (lifecycle.isCompleted) return;
        lifecycle.isCompleted = true;

        const ctx = executionContextRegistry.get(uuid);
        if (ctx?.windowId) {
          onCloseWindow(ctx.windowId);
        }

        const wasRejected = ctx?.revealWasRejected === true;
        const finalize = () => {
          executionContextRegistry.delete(uuid);
          if (wasRejected) {
            doneReject(new Error('User rejected reveal'));
          } else {
            doneResolve(args);
          }
          try {
            dispose();
          } catch (disposeError) {
            logger.error('[executePlugin] Error disposing evaluator:', disposeError);
          }
        };

        if (lifecycle.pendingCallbacks > 0) {
          logger.debug(
            `[executePlugin] done() called with ${lifecycle.pendingCallbacks} callback(s) in-flight, deferring cleanup`,
          );
          waitForPendingCallbacks().then(finalize);
        } else {
          finalize();
        }
      },
      getJsonBody: (request: InterceptedRequest) => getJsonBody(request),
      doneWithOverlay: (
        args?: unknown,
        options?: { title?: string; message?: string; delayMs?: number },
      ) => {
        if (lifecycle.isCompleted) return;
        lifecycle.isCompleted = true;

        const ctx = executionContextRegistry.get(uuid);
        const windowId = ctx?.windowId;
        const wasRejected = ctx?.revealWasRejected === true;
        const settle = () => {
          if (wasRejected) {
            doneReject(new Error('User rejected reveal'));
          } else {
            doneResolve(args);
          }
        };

        if (!windowId) {
          const finalize = () => {
            executionContextRegistry.delete(uuid);
            settle();
            try {
              dispose();
            } catch (disposeError) {
              logger.error('[executePlugin] Error disposing evaluator:', disposeError);
            }
          };

          if (lifecycle.pendingCallbacks > 0) {
            waitForPendingCallbacks().then(finalize);
          } else {
            finalize();
          }
          return;
        }

        const delayMs = options?.delayMs ?? 2000;
        onRenderPluginUi(windowId, createCompletionOverlay(options?.title, options?.message));

        const closeAndFinalize = () => {
          onCloseWindow(windowId);
          executionContextRegistry.delete(uuid);
          settle();
          try {
            dispose();
          } catch (disposeError) {
            logger.error('[executePlugin] Error disposing evaluator:', disposeError);
          }
        };

        const startDelay = () => {
          setTimeout(closeAndFinalize, delayMs);
        };

        if (lifecycle.pendingCallbacks > 0) {
          waitForPendingCallbacks().then(startDelay);
        } else {
          startDelay();
        }
      },
    };

    // Merge in any custom capabilities registered via addCapability()
    for (const [name, handler] of this.capabilities) {
      capabilities[name] = handler;
    }

    // --- Call the platform-specific evaluator ---
    let exportedCode: Record<string, unknown>;
    try {
      const result = await this.evaluator.evaluate(code, capabilities);
      exportedCode = result.exports;
      dispose = result.dispose; // Update mutable ref now that evaluator has returned
    } catch (evalError) {
      const error = evalError instanceof Error ? evalError : new Error(String(evalError));
      terminateWithError(new Error(`Plugin evaluation failed: ${error.message}`));
      return donePromise;
    }

    const { main: rawMainFn, ...args } = exportedCode;

    if (typeof rawMainFn !== 'function') {
      terminateWithError(new Error('Main function not found in plugin'));
      return donePromise;
    }

    const mainFn = rawMainFn as (...args: unknown[]) => DomJson | null;

    const callbacks: { [callbackName: string]: () => Promise<void> } = {};

    for (const key in args) {
      if (typeof args[key] === 'function') {
        callbacks[key] = args[key] as () => Promise<void>;
      }
    }

    let json: DomJson | null = null;

    const main = (force = false) => {
      if (lifecycle.isCompleted) return null;

      try {
        updateExecutionContext(uuid, { currentContext: 'main' });

        let result = mainFn();
        const lastSelectors = executionContextRegistry.get(uuid)?.context['main']?.selectors;
        const selectors = context['main']?.selectors;
        const lastStateStore = executionContextRegistry.get(uuid)?.stateStore;

        if (
          !force &&
          deepEqual(lastSelectors, selectors) &&
          deepEqual(lastStateStore, stateStore)
        ) {
          result = null;
        }

        updateExecutionContext(uuid, {
          currentContext: '',
          context: {
            ...executionContextRegistry.get(uuid)?.context,
            main: {
              effects: JSON.parse(JSON.stringify(context['main']?.effects ?? [])),
              selectors: JSON.parse(JSON.stringify(context['main']?.selectors ?? [])),
            },
          },
          stateStore: JSON.parse(JSON.stringify(stateStore)),
        });

        if (context['main']) {
          context['main'].effects.length = 0;
          context['main'].selectors.length = 0;
        }

        if (result) {
          logger.debug('Main function executed:', result);
          logger.debug(
            'executionContextRegistry.get(uuid)?.windowId',
            executionContextRegistry.get(uuid)?.windowId,
          );

          const overlays: DomJson[] = [];
          const ctx = executionContextRegistry.get(uuid);
          if (ctx?.revealApprovalDescriptors) {
            overlays.push(createRevealApprovalOverlay(ctx.revealApprovalDescriptors));
          }
          if (timeoutWarningShown) {
            overlays.push(createTimeoutWarningOverlay());
          }
          json = decorateJson(result, overlays);

          waitForWindow(async () => executionContextRegistry.get(uuid)?.windowId).then(
            (windowId: number | null) => {
              if (windowId == null) {
                logger.error(
                  '[executePlugin] Window never opened after timeout, skipping UI render',
                );
                return;
              }
              logger.debug('render result', json as DomJson);
              onRenderPluginUi(windowId, json as DomJson);
            },
          );
        }

        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        terminateWithError(new Error(`Plugin main() error: ${err.message}`));
        return null;
      }
    };

    executionContextRegistry.set(uuid, {
      id: uuid,
      plugin: code,
      pluginUrl: '',
      context: {},
      currentContext: '',
      // Provide a compatible sandbox stub so the ExecutionContext type is satisfied.
      // The real dispose is called via the `dispose` closure above.
      sandbox: { eval: async () => undefined, dispose: () => dispose() },
      main: main,
      callbacks: callbacks,
      stateStore: {},
    });

    // --- Timeout lifecycle ---
    const pluginConfig = args.config as PluginConfig | undefined;
    const timeoutMs = clampTimeout(pluginConfig?.timeout);
    let deadline = Date.now() + timeoutMs;
    let timeoutWarningShown = false;

    const updateTimeoutState = () => {
      const remaining = Math.max(0, deadline - Date.now());
      stateStore['_pluginTimeout'] = { remaining, total: timeoutMs };
    };

    const extendTimeout = () => {
      deadline = Date.now() + TIMEOUT_EXTEND_MS;
      timeoutWarningShown = false;
      updateTimeoutState();
      eventEmitter.emit({
        type: reRenderEvent,
        windowId: executionContextRegistry.get(uuid)?.windowId || 0,
      } as WindowMessage);
    };

    const dismissTimeoutWarning = () => {
      timeoutWarningShown = false;
      eventEmitter.emit({
        type: reRenderEvent,
        windowId: executionContextRegistry.get(uuid)?.windowId || 0,
      } as WindowMessage);
    };

    callbacks['_extendTimeout'] = async () => {
      extendTimeout();
    };
    callbacks['_dismissTimeoutWarning'] = async () => {
      dismissTimeoutWarning();
    };

    updateTimeoutState();

    let timeoutIntervalId: ReturnType<typeof setInterval> | null = null;

    if (this.enableTimeout) {
      timeoutIntervalId = setInterval(() => {
        if (lifecycle.isCompleted) {
          if (timeoutIntervalId !== null) clearInterval(timeoutIntervalId);
          return;
        }

        const remaining = deadline - Date.now();
        updateTimeoutState();

        if (remaining <= TIMEOUT_WARNING_LEAD_MS && remaining > 0 && !timeoutWarningShown) {
          timeoutWarningShown = true;
          eventEmitter.emit({
            type: reRenderEvent,
            windowId: executionContextRegistry.get(uuid)?.windowId || 0,
          } as WindowMessage);
        }

        if (remaining <= 0) {
          if (timeoutIntervalId !== null) clearInterval(timeoutIntervalId);
          terminateWithError(new Error('Plugin execution timeout'));
        }
      }, 1000);
    }

    const cleanup = () => {
      if (timeoutIntervalId !== null) clearInterval(timeoutIntervalId);
      if (this._activeUuid === uuid) {
        this._activeUuid = null;
      }
    };
    donePromise.then(cleanup, cleanup);

    main();

    return donePromise;
  }

  createDomJson = (
    type: 'div' | 'button' | 'input',
    param1: DomOptions | DomJson[] = {},
    param2: DomJson[] = [],
  ): DomJson => {
    return createDomJson(type, param1, param2);
  };

  registerRevealApproval(
    resolve: () => void,
    reject: (err: Error) => void,
    descriptors: RevealRangeDescriptor[],
  ): void {
    if (!this._activeUuid) return;
    const uuid = this._activeUuid;
    updateExecutionContext(uuid, {
      revealApproval: { resolve, reject },
      revealApprovalDescriptors: descriptors,
    });
    const ctx = executionContextRegistry.get(uuid);
    ctx?.main(true);
  }

  renderUi(windowId: number, json: DomJson): void {
    this.onRenderPluginUi(windowId, json);
  }
}

// ---------------------------------------------------------------------------
// NativeFunctionEvaluator
// ---------------------------------------------------------------------------

function preprocessForNativeEval(code: string): string {
  // Collect named exports: export function main() / export const config = ...
  const exportNames: string[] = [];
  const exportRegex = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/g;
  let match;
  while ((match = exportRegex.exec(code)) !== null) {
    exportNames.push(match[1]);
  }

  if (exportNames.length > 0) {
    const stripped = code.replace(/^(\s*)export\s+/gm, '$1');
    const entries = exportNames
      .map((n) => `${n}: typeof ${n} === 'function' ? (...args) => ${n}(...args) : ${n}`)
      .join(',\n  ');
    return `${stripped}\nreturn { ${entries} };`;
  }

  // Handle export default { ... }
  const defaultMatch = code.match(/export\s+default\s+\{([^}]+)\}\s*;?\s*$/);
  if (defaultMatch) {
    const names = defaultMatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const stripped = code.replace(/export\s+default\s+\{[^}]+\}\s*;?\s*$/, '');
    const entries = names
      .map((n) => `${n}: typeof ${n} === 'function' ? (...args) => ${n}(...args) : ${n}`)
      .join(',\n  ');
    return `${stripped}\nreturn { ${entries} };`;
  }

  return code;
}

export class NativeFunctionEvaluator implements PluginEvaluator {
  async evaluate(
    code: string,
    capabilities: Record<string, AnyFunction>,
  ): Promise<PluginEvaluatorResult> {
    const processedCode = preprocessForNativeEval(code);
    const keys = Object.keys(capabilities);
    const vals = Object.values(capabilities);
    const fn = new Function(...keys, processedCode);
    const exports = (fn(...vals) as Record<string, unknown>) ?? {};
    return { exports, dispose: () => {} };
  }
}
