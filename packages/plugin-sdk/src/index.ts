/**
 * @tlsn/plugin-sdk
 *
 * SDK for developing and running TLSN WebAssembly plugins
 */

import { SandboxEvalCode, type SandboxOptions, loadQuickJs } from '@sebastianwessel/quickjs';
import variant from '@jitl/quickjs-ng-wasmfile-release-sync';
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

// Type alias for hook context used throughout the module
type HookContext = {
  [functionName: string]: {
    effects: unknown[][];
    selectors: unknown[][];
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => any;

// Module-level registry to avoid circular references in capability closures
const executionContextRegistry = new Map<string, ExecutionContext>();

// Timeout constants
export const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
export const MIN_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes
export const MAX_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes
export const TIMEOUT_WARNING_LEAD_MS = 60 * 1000; // 1 minute warning
export const TIMEOUT_EXTEND_MS = 5 * 60 * 1000; // 5 minutes per extend

export function clampTimeout(value?: number): number {
  if (value == null) return DEFAULT_TIMEOUT_MS;
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, value));
}

// Pure function for updating execution context without `this` binding
function updateExecutionContext(
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
  },
): void {
  const context = executionContextRegistry.get(uuid);
  if (!context) {
    throw new Error('Execution context not found');
  }
  executionContextRegistry.set(uuid, { ...context, ...params });
}

// Pure function for creating DOM JSON without `this` binding
function createDomJson(
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

  return {
    type,
    options,
    children,
  };
}

// Pure function for creating useEffect hook without `this` binding
function makeUseEffect(uuid: string, context: HookContext) {
  return (effect: () => void, deps: unknown[]) => {
    const executionContext = executionContextRegistry.get(uuid);
    if (!executionContext) {
      throw new Error('Execution context not found');
    }
    const functionName = executionContext.currentContext;
    context[functionName] = context[functionName] || {
      effects: [],
      selectors: [],
    };
    const effects = context[functionName].effects;
    const lastDeps = executionContext.context[functionName]?.effects[effects.length];
    effects.push(deps);
    if (deepEqual(lastDeps, deps)) {
      return;
    }
    effect();
  };
}

// Pure function for creating useRequests hook without `this` binding
function makeUseRequests(uuid: string, context: HookContext) {
  return (filterFn: (requests: InterceptedRequest[]) => InterceptedRequest[]) => {
    const executionContext = executionContextRegistry.get(uuid);
    if (!executionContext) {
      throw new Error('Execution context not found');
    }
    const functionName = executionContext.currentContext;
    context[functionName] = context[functionName] || {
      effects: [],
      selectors: [],
    };
    const selectors = context[functionName].selectors;
    const requests = JSON.parse(JSON.stringify(executionContext.requests || []));
    const result = filterFn(requests);
    selectors.push(result);
    return result;
  };
}

// Pure function for creating useHeaders hook without `this` binding
function makeUseHeaders(uuid: string, context: HookContext) {
  return (filterFn: (headers: InterceptedRequestHeader[]) => InterceptedRequestHeader[]) => {
    const executionContext = executionContextRegistry.get(uuid);
    if (!executionContext) {
      throw new Error('Execution context not found');
    }
    const functionName = executionContext.currentContext;
    context[functionName] = context[functionName] || {
      effects: [],
      selectors: [],
    };
    const selectors = context[functionName].selectors;
    // Serialize headers to break circular references
    const headers = JSON.parse(JSON.stringify(executionContext.headers || []));
    const result = filterFn(headers);

    // Validate that filterFn returned an array
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

function makeUseState(
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
    // eventEmitter.emit({
    //   type: 'TO_BG_RE_RENDER_PLUGIN_UI',
    //   windowId: executionContextRegistry.get(uuid)?.windowId || 0,
    // });
    return stateStore[key];
  };
}

function makeSetState(
  uuid: string,
  stateStore: Record<string, unknown>,
  eventEmitter: {
    emit: (message: WindowMessage) => void;
  },
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
      type: 'TO_BG_RE_RENDER_PLUGIN_UI',
      windowId: executionContextRegistry.get(uuid)?.windowId || 0,
    });
  };
}

// Pure function for creating usePluginTimeout hook
function makeUsePluginTimeout(stateStore: Record<string, unknown>) {
  return (): { remaining: number; total: number } | null => {
    return (stateStore['_pluginTimeout'] as { remaining: number; total: number }) ?? null;
  };
}

/**
 * Tracks the lifecycle of a plugin execution to prevent race conditions
 * between async callbacks and sandbox disposal.
 */
interface PluginLifecycle {
  /** Whether the plugin has completed (done() or terminateWithError called) */
  isCompleted: boolean;
  /** Number of async callbacks currently in-flight */
  pendingCallbacks: number;
  /** Called when pendingCallbacks drops to 0, if set */
  onDrain: (() => void) | null;
}

// Pure function for creating openWindow without `this` binding
function makeOpenWindow(
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

    // Return cached result if window already opened (idempotent on re-renders)
    if (cachedResult) {
      return cachedResult;
    }

    // --- Race condition fix ---
    // Register the event listener BEFORE calling onOpenWindow so that headers
    // intercepted between window creation and response arrival are not lost.
    // Messages that arrive before we know the windowId are buffered, then
    // merged into the execution context in bulk (no replay/re-render needed —
    // the next main() call will see the accumulated data).
    let resolvedWindowId: number | null = null;
    const pendingMessages: WindowMessage[] = [];

    const onMessage = async (message: WindowMessage) => {
      // Buffer messages while we don't have a windowId yet.
      // They will be merged into execution context after onOpenWindow resolves.
      if (resolvedWindowId === null) {
        pendingMessages.push(message);
        return;
      }

      // Handle window closed — check if it's our window
      if (message.type === 'WINDOW_CLOSED') {
        const executionContext = executionContextRegistry.get(uuid);
        const ourWindowId = executionContext?.windowId ?? resolvedWindowId;

        // Ignore close events for other windows
        if (ourWindowId != null && message.windowId !== ourWindowId) {
          return;
        }

        eventEmitter.removeListener(onMessage);

        // Terminate the plugin if it hasn't already completed
        if (!lifecycle.isCompleted && onError) {
          onError(new Error('Window closed by user'));
        }
        return;
      }

      // Skip processing if the plugin has completed (done() or error)
      // This prevents new work from starting while disposal is pending
      if (lifecycle.isCompleted) {
        logger.debug(`[makeOpenWindow] Ignoring message ${message.type}: plugin has completed`);
        eventEmitter.removeListener(onMessage);
        return;
      }

      // For all other messages, check if context still exists
      // Context may have been cleaned up due to error or done() call
      const executionContext = executionContextRegistry.get(uuid);
      if (!executionContext) {
        logger.debug(
          `[makeOpenWindow] Ignoring message ${message.type}: execution context no longer exists`,
        );
        eventEmitter.removeListener(onMessage);
        return;
      }

      // Only process messages for this plugin's window
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
            const approval = executionContext.revealApproval;
            if (approval) {
              updateExecutionContext(uuid, { revealApproval: null });
              approval.resolve();
            }
            return;
          }
          if (message.onclick === '_revealReject') {
            const approval = executionContext.revealApproval;
            if (approval) {
              updateExecutionContext(uuid, { revealApproval: null });
              approval.reject(new Error('User rejected reveal'));
            }
            return;
          }
          const cb = executionContext.callbacks[message.onclick];

          logger.debug('Callback:', cb);
          if (cb) {
            // Track this async callback so sandbox disposal waits for it
            lifecycle.pendingCallbacks++;
            try {
              updateExecutionContext(uuid, {
                currentContext: message.onclick,
              });
              const result = await cb();
              // Re-check context exists after async callback
              if (executionContextRegistry.has(uuid)) {
                updateExecutionContext(uuid, {
                  currentContext: '',
                });
              }
              logger.debug('Callback result:', result);
            } finally {
              lifecycle.pendingCallbacks--;
              // If disposal is waiting for callbacks to drain, signal it
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

    // Register listener BEFORE opening the window to capture all messages
    eventEmitter.addListener(onMessage);

    try {
      const response = await onOpenWindow(url, options);

      // Check if response indicates an error
      if (response?.type === 'WINDOW_ERROR') {
        throw new Error(
          response.payload?.details || response.payload?.error || 'Failed to open window',
        );
      }

      // Return window info from successful response
      if (response?.type === 'WINDOW_OPENED' && response.payload) {
        const windowId = response.payload.windowId;

        // Guard: context may have been cleaned up if done() was called
        // from the initial main() before this async resolution.
        if (!executionContextRegistry.has(uuid)) {
          eventEmitter.removeListener(onMessage);
          cachedResult = {
            windowId: response.payload.windowId,
            uuid: response.payload.uuid,
            tabId: response.payload.tabId,
          };
          return cachedResult;
        }

        updateExecutionContext(uuid, {
          windowId,
        });

        // Merge any buffered messages into the execution context in bulk.
        // This avoids re-entrant main() calls during replay. The next
        // main() invocation will naturally pick up all the accumulated data.
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
            // Trigger a single re-render so the plugin sees the buffered data
            executionContext.main(true);
          }
          // If window was closed while we were waiting, terminate
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

        // Unblock the message handler — new messages are processed live
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
      // Clean up listener on failure to prevent leaks
      eventEmitter.removeListener(onMessage);
      logger.error('[makeOpenWindow] Failed to open window:', error);
      throw error;
    }
  };
}

/**
 * Extract and parse a JSON body from an intercepted request.
 *
 * For JSON POST/PUT requests, the body is stored in `requestBody.raw[].bytes`
 * as an ArrayBuffer or number array. This utility decodes the bytes to a string
 * and attempts to parse it as JSON.
 *
 * @param request - An intercepted request from useRequests()
 * @returns The parsed JSON object, the raw string if not valid JSON, or null if no body
 */
function getJsonBody(request: InterceptedRequest): unknown {
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

// Export Parser and its types
export {
  Parser,
  type Range,
  type ParsedValue,
  type ParsedHeader,
  type JsonFieldEntry,
  type ParsedRequest,
  type ParsedResponse,
  type HeaderRangeOptions,
  type BodyRangeOptions,
} from './parser';

/**
 * Preprocess plugin code to work around @sebastianwessel/quickjs serialization bugs.
 *
 * Two issues:
 * 1. handleToNative() has no circular reference detection — exporting any function
 *    with a .prototype property causes infinite recursion (prototype.constructor cycle).
 * 2. The library only returns `res.default` from module evaluation, so named exports
 *    are silently discarded.
 *
 * This function strips named exports, then re-exports them via `export default { ... }`
 * with arrow function wrappers (arrow functions have no .prototype).
 */
function preprocessPluginCode(code: string): string {
  // Handle named exports: export function main() / export const config = ...
  const exportNames: string[] = [];
  const exportRegex = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+(\w+)/g;
  let match;

  while ((match = exportRegex.exec(code)) !== null) {
    exportNames.push(match[1]);
  }

  if (exportNames.length > 0) {
    const strippedCode = code.replace(/^(\s*)export\s+/gm, '$1');
    const entries = exportNames
      .map(
        (name) =>
          `${name}: typeof ${name} === 'function' ? (...args) => ${name}(...args) : ${name}`,
      )
      .join(',\n  ');

    return `${strippedCode}\nexport default { ${entries} };`;
  }

  // Handle export default { ... } — wrap function references in arrow functions
  // to avoid QuickJS handleToNative stack overflow on .prototype
  const defaultExportMatch = code.match(/export\s+default\s+\{([^}]+)\}\s*;?\s*$/);

  if (defaultExportMatch) {
    const names = defaultExportMatch[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const strippedCode = code.replace(/export\s+default\s+\{[^}]+\}\s*;?\s*$/, '');
    const entries = names
      .map(
        (name) =>
          `${name}: typeof ${name} === 'function' ? (...args) => ${name}(...args) : ${name}`,
      )
      .join(',\n  ');

    return `${strippedCode}\nexport default { ${entries} };`;
  }

  return code;
}

/**
 * Creates a success overlay DOM JSON for doneWithOverlay().
 * Plugin developers can customize the title and message.
 */
function createCompletionOverlay(
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
      // Modal card
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
          // Green check emoji
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
            children: ['\u2705'],
          },
          // Title
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
          // Message
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
            style: {
              fontSize: '12px',
              color: '#374151',
              minWidth: '120px',
            },
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
              color: '#6b7280',
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
    options: {
      style: {
        marginBottom: '16px',
      },
    },
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

  if (sentDescriptors.length > 0) {
    cardChildren.push(renderSection('Sent', sentDescriptors));
  }

  if (recvDescriptors.length > 0) {
    cardChildren.push(renderSection('Received', recvDescriptors));
  }

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
          // Warning icon
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
            children: ['\u23F1\uFE0F'],
          },
          // Title
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
          // Message
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
          // Extend button
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
          // Let expire button
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

function wrapWithTimeoutWarning(pluginUi: DomJson): DomJson {
  return {
    type: 'div',
    options: { style: {} },
    children: [pluginUi, createTimeoutWarningOverlay()],
  };
}

export class Host {
  private capabilities: Map<string, AnyFunction> = new Map();
  private _activeUuid: string | null = null;
  private onProve: (
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
  private onRenderPluginUi: (windowId: number, result: DomJson) => void;
  private onCloseWindow: (windowId: number) => void;
  private onOpenWindow: (
    url: string,
    options?: {
      width?: number;
      height?: number;
      showOverlay?: boolean;
    },
  ) => Promise<OpenWindowResponse>;

  constructor(options: {
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
  }) {
    this.onProve = options.onProve;
    this.onRenderPluginUi = options.onRenderPluginUi;
    this.onCloseWindow = options.onCloseWindow;
    this.onOpenWindow = options.onOpenWindow;

    // Initialize logger with provided level or default to WARN
    logger.init(options.logLevel ?? DEFAULT_LOG_LEVEL);
  }

  addCapability(name: string, handler: AnyFunction): void {
    this.capabilities.set(name, handler);
  }

  async createEvalCode(capabilities?: Record<string, AnyFunction>): Promise<{
    eval: (code: string) => Promise<unknown>;
    dispose: () => void;
  }> {
    const { runSandboxed } = await loadQuickJs(variant);

    const options: SandboxOptions = {
      allowFetch: false,
      allowFs: false,
      maxStackSize: 0,
      env: {
        ...Object.fromEntries(this.capabilities),
        ...(capabilities || {}),
      },
    };

    let evalCode: SandboxEvalCode | null = null;
    let disposeCallback: (() => void) | null = null;
    let sandboxError: Error | null = null;

    // Start sandbox and keep it alive
    // Track the promise to handle errors properly
    const sandboxPromise = runSandboxed(async (sandbox) => {
      evalCode = sandbox.evalCode;

      // Keep the sandbox alive until dispose is called
      // The runtime won't be disposed until this promise resolves
      return new Promise<void>((resolve) => {
        disposeCallback = resolve;
      });
    }, options).catch((err: Error) => {
      // Capture sandbox errors for later handling
      sandboxError = err;
      // If evalCode was never set, we need to unblock the wait loop
      if (!evalCode) {
        evalCode = (() => ({ ok: false, error: err })) as unknown as SandboxEvalCode;
      }
    });

    // Wait for evalCode to be ready
    while (!evalCode) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Return evalCode and dispose function
    return {
      eval: async (code: string) => {
        // Check if sandbox had an error during setup
        if (sandboxError) {
          throw sandboxError;
        }

        const result = await evalCode!(code);

        if (!result.ok) {
          const err = new Error(result.error.message);
          err.name = result.error.name;
          err.stack = result.error.stack;
          throw err;
        }

        return result.data;
      },
      dispose: () => {
        if (disposeCallback) {
          disposeCallback();
          disposeCallback = null;
        }
        // Ensure the sandbox promise is awaited to prevent unhandled rejections
        // This is a fire-and-forget await since we've already captured any errors
        sandboxPromise.catch(() => {
          // Errors already captured, ignore
        });
      },
    };
  }

  updateExecutionContext(
    uuid: string,
    params: {
      windowId?: number;
      plugin?: string;
      requests?: InterceptedRequest[];
      headers?: InterceptedRequestHeader[];
      context?: HookContext;
      currentContext?: string;
    },
  ): void {
    updateExecutionContext(uuid, params);
  }

  async getPluginConfig(code: string): Promise<PluginConfig | undefined> {
    const sandbox = await this.createEvalCode();
    try {
      const processedCode = preprocessPluginCode(code);
      const exportedCode = await sandbox.eval(`
const div = env.div;
const button = env.button;
const input = env.input;
const openWindow = env.openWindow;
const useEffect = env.useEffect;
const useRequests = env.useRequests;
const useHeaders = env.useHeaders;
const createProver = env.createProver;
const sendRequest = env.sendRequest;
const transcript = env.transcript;
const subtractRanges = env.subtractRanges;
const mapStringToRange = env.mapStringToRange;
const reveal = env.reveal;
const getResponse = env.getResponse;
const closeWindow = env.closeWindow;
const getJsonBody = env.getJsonBody;
const done = env.done;
const doneWithOverlay = env.doneWithOverlay;
${processedCode};
`);

      const exported = exportedCode as Record<string, unknown> | undefined;
      return exported?.config as PluginConfig | undefined;
    } finally {
      sandbox.dispose();
    }
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

    const context: HookContext = {};

    const stateStore: Record<string, unknown> = {};

    let doneResolve: (value?: unknown) => void;
    let doneReject: (error: Error) => void;

    // Lifecycle tracker prevents sandbox disposal while async callbacks are in-flight.
    // This fixes "Lifetime not alive" / "QuickJSContext had no callback with id" errors
    // caused by the sandbox being disposed while an awaited callback (e.g. onClick → prove())
    // is still executing inside the QuickJS runtime.
    const lifecycle: PluginLifecycle = {
      isCompleted: false,
      pendingCallbacks: 0,
      onDrain: null,
    };

    const donePromise = new Promise((resolve, reject) => {
      doneResolve = resolve;
      doneReject = reject;
    });

    // Wait for all in-flight async callbacks to settle
    const DRAIN_TIMEOUT_MS = 30_000;

    const waitForPendingCallbacks = (): Promise<void> => {
      if (lifecycle.pendingCallbacks === 0) return Promise.resolve();

      // Defensive: onDrain should never already be set because isCompleted
      // gates both done() and terminateWithError(). Log if invariant breaks.
      if (lifecycle.onDrain !== null) {
        logger.warn(
          '[executePlugin] onDrain already set — multiple waiters detected, this is a bug',
        );
      }

      return new Promise<void>((resolve) => {
        lifecycle.onDrain = resolve;

        // Safety net: if callbacks hang forever, force-resolve after timeout
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

    // Helper to terminate plugin execution with an error
    const terminateWithError = (error: Error, sandbox?: { dispose: () => void }) => {
      if (lifecycle.isCompleted) return;
      lifecycle.isCompleted = true;
      logger.error('[executePlugin] Plugin terminated with error:', error);

      // Clean up registry entry
      const ctx = executionContextRegistry.get(uuid);
      if (ctx?.windowId) {
        try {
          this.onCloseWindow(ctx.windowId);
        } catch (closeError) {
          logger.error('[executePlugin] Error closing window:', closeError);
        }
      }

      const finalize = () => {
        executionContextRegistry.delete(uuid);

        // Reject first, before disposing sandbox.
        // sandbox.dispose() can crash the WASM runtime (e.g. QuickJS
        // gc_obj_list assertion), which would prevent doneReject from
        // ever being called if it came after dispose.
        doneReject(error);

        // Dispose sandbox if provided
        if (sandbox) {
          try {
            sandbox.dispose();
          } catch (disposeError) {
            logger.error('[executePlugin] Error disposing sandbox:', disposeError);
          }
        }
      };

      // Defer sandbox disposal until all in-flight callbacks have completed.
      // Disposing while a callback is awaited inside QuickJS causes "Lifetime not alive".
      if (lifecycle.pendingCallbacks > 0) {
        logger.debug(
          `[executePlugin] Deferring sandbox disposal: ${lifecycle.pendingCallbacks} callback(s) in-flight`,
        );
        waitForPendingCallbacks().then(finalize);
      } else {
        finalize();
      }
    };

    /**
     * The sandbox is a sandboxed environment that is used to execute the plugin code.
     * It is created using the createEvalCode method from the plugin-sdk.
     * The sandbox is created with the following capabilities:
     * - div: a function that creates a div element
     * - button: a function that creates a button element
     * - openWindow: a function that opens a new window
     * - useEffect: a function that creates a useEffect hook
     * - useRequests: a function that creates a useRequests hook
     * - useHeaders: a function that creates a useHeaders hook
     * - subtractRanges: a function that subtracts ranges
     * - mapStringToRange: a function that maps a string to a range
     * - createProver: a function that creates a prover
     * - sendRequest: a function that sends a request
     * - transcript: a function that returns the transcript
     * - reveal: a function that reveals a commit
     * - getResponse: a function that returns the verification response (sent/received data) or null
     * - closeWindow: a function that closes a window by windowId
     * - done: a function that completes the session and closes the window
     */
    // Create pure functions without `this` bindings to avoid circular references
    const onCloseWindow = this.onCloseWindow;
    const onRenderPluginUi = this.onRenderPluginUi;
    const onOpenWindow = this.onOpenWindow;
    const onProve = this.onProve;

    const sandbox = await this.createEvalCode({
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
        (err: Error) => terminateWithError(err, sandbox),
      ),
      useEffect: makeUseEffect(uuid, context),
      useRequests: makeUseRequests(uuid, context),
      useHeaders: makeUseHeaders(uuid, context),
      useState: makeUseState(uuid, stateStore, eventEmitter),
      setState: makeSetState(uuid, stateStore, eventEmitter),
      usePluginTimeout: makeUsePluginTimeout(stateStore),
      prove: async (
        requestOptions: Parameters<typeof onProve>[0],
        proverOptions: Parameters<typeof onProve>[1],
      ) => {
        const setProgress = (data: ProveProgressData) => {
          stateStore['_proveProgress'] = data;
          eventEmitter.emit({
            type: 'TO_BG_RE_RENDER_PLUGIN_UI',
            windowId: executionContextRegistry.get(uuid)?.windowId || 0,
          });
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
            type: 'TO_BG_RE_RENDER_PLUGIN_UI',
            windowId: executionContextRegistry.get(uuid)?.windowId || 0,
          });
          throw err;
        }
      },
      done: (args?: unknown) => {
        if (lifecycle.isCompleted) return;
        lifecycle.isCompleted = true;

        // Close the window if it exists
        const context = executionContextRegistry.get(uuid);
        if (context?.windowId) {
          onCloseWindow(context.windowId);
        }

        const finalize = () => {
          executionContextRegistry.delete(uuid);
          doneResolve(args);
        };

        // If called from within an async callback (e.g. onClick → prove() → done()),
        // defer cleanup until the callback returns to avoid disposing QuickJS mid-execution.
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

        // Mark as completed immediately to prevent main() from re-rendering
        // and overwriting the overlay
        lifecycle.isCompleted = true;

        const ctx = executionContextRegistry.get(uuid);
        const windowId = ctx?.windowId;

        // If there's no window, behave like done() — no overlay or delay needed
        if (!windowId) {
          const finalize = () => {
            executionContextRegistry.delete(uuid);
            doneResolve(args);
          };

          if (lifecycle.pendingCallbacks > 0) {
            waitForPendingCallbacks().then(finalize);
          } else {
            finalize();
          }
          return;
        }

        const delayMs = options?.delayMs ?? 2000;

        // Show the completion overlay
        onRenderPluginUi(windowId, createCompletionOverlay(options?.title, options?.message));

        // After the delay, close the window and finalize
        const closeAndFinalize = () => {
          onCloseWindow(windowId);
          executionContextRegistry.delete(uuid);
          doneResolve(args);
        };

        // Wait for pending callbacks to complete (e.g. the onClick that
        // called doneWithOverlay), then start the delay timer
        const startDelay = () => {
          setTimeout(closeAndFinalize, delayMs);
        };

        if (lifecycle.pendingCallbacks > 0) {
          waitForPendingCallbacks().then(startDelay);
        } else {
          startDelay();
        }
      },
    });

    let exportedCode: Record<string, unknown>;
    try {
      const processedCode = preprocessPluginCode(code);
      const evalResult = await sandbox.eval(`
const div = env.div;
const button = env.button;
const input = env.input;
const openWindow = env.openWindow;
const useEffect = env.useEffect;
const useRequests = env.useRequests;
const useHeaders = env.useHeaders;
const useState = env.useState;
const setState = env.setState;
const prove = env.prove;
const getJsonBody = env.getJsonBody;
const closeWindow = env.closeWindow;
const done = env.done;
const doneWithOverlay = env.doneWithOverlay;
const usePluginTimeout = env.usePluginTimeout;
${processedCode};
`);
      exportedCode = (evalResult ?? {}) as Record<string, unknown>;
    } catch (evalError) {
      const error = evalError instanceof Error ? evalError : new Error(String(evalError));
      terminateWithError(new Error(`Plugin evaluation failed: ${error.message}`), sandbox);
      return donePromise;
    }

    const { main: rawMainFn, ...args } = exportedCode;

    if (typeof rawMainFn !== 'function') {
      terminateWithError(new Error('Main function not found in plugin'), sandbox);
      return donePromise;
    }

    const mainFn = rawMainFn as (...args: unknown[]) => DomJson | null;

    const callbacks: {
      [callbackName: string]: () => Promise<void>;
    } = {};

    for (const key in args) {
      if (typeof args[key] === 'function') {
        callbacks[key] = args[key] as () => Promise<void>;
      }
    }

    let json: DomJson | null = null;

    const main = (force = false) => {
      // Don't run main() if the plugin has already completed
      if (lifecycle.isCompleted) return null;

      try {
        updateExecutionContext(uuid, {
          currentContext: 'main',
        });

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

          // If timeout warning is active, layer it on top of the plugin UI.
          // The plugin UI continues to update underneath (no stale state).
          json = timeoutWarningShown ? wrapWithTimeoutWarning(result) : result;

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
        terminateWithError(new Error(`Plugin main() error: ${err.message}`), sandbox);
        return null;
      }
    };

    executionContextRegistry.set(uuid, {
      id: uuid,
      plugin: code,
      pluginUrl: '',
      context: {},
      currentContext: '',
      sandbox,
      main: main,
      callbacks: callbacks,
      stateStore: {},
    });

    // --- Timeout lifecycle ---
    const pluginConfig = args.config as PluginConfig | undefined;
    const timeoutMs = clampTimeout(pluginConfig?.timeout);
    let deadline = Date.now() + timeoutMs;
    let timeoutWarningShown = false;

    // Update _pluginTimeout state and trigger re-render
    const updateTimeoutState = () => {
      const remaining = Math.max(0, deadline - Date.now());
      stateStore['_pluginTimeout'] = { remaining, total: timeoutMs };
    };

    // Extend handler — called via onclick dispatch
    const extendTimeout = () => {
      deadline = Date.now() + TIMEOUT_EXTEND_MS;
      timeoutWarningShown = false;
      updateTimeoutState();
      // Re-render to restore normal plugin UI
      eventEmitter.emit({
        type: 'TO_BG_RE_RENDER_PLUGIN_UI',
        windowId: executionContextRegistry.get(uuid)?.windowId || 0,
      });
    };

    // Dismiss warning — let deadline fire naturally, just restore plugin UI
    const dismissTimeoutWarning = () => {
      timeoutWarningShown = false;
      eventEmitter.emit({
        type: 'TO_BG_RE_RENDER_PLUGIN_UI',
        windowId: executionContextRegistry.get(uuid)?.windowId || 0,
      });
    };

    // Register internal onclick handlers for the timeout warning modal
    callbacks['_extendTimeout'] = async () => {
      extendTimeout();
    };
    callbacks['_dismissTimeoutWarning'] = async () => {
      dismissTimeoutWarning();
    };

    updateTimeoutState();

    const timeoutIntervalId = setInterval(() => {
      if (lifecycle.isCompleted) {
        clearInterval(timeoutIntervalId);
        return;
      }

      const remaining = deadline - Date.now();
      updateTimeoutState();

      // Show warning overlay at T-60s by triggering a re-render.
      // main() wraps the plugin UI with the warning overlay when timeoutWarningShown is true.
      if (remaining <= TIMEOUT_WARNING_LEAD_MS && remaining > 0 && !timeoutWarningShown) {
        timeoutWarningShown = true;
        eventEmitter.emit({
          type: 'TO_BG_RE_RENDER_PLUGIN_UI',
          windowId: executionContextRegistry.get(uuid)?.windowId || 0,
        });
      }

      // Deadline reached — terminate
      if (remaining <= 0) {
        clearInterval(timeoutIntervalId);
        terminateWithError(new Error('Plugin execution timeout'), sandbox);
      }
    }, 1000);

    // Clean up interval when plugin completes.
    // Use .then(onFulfilled, onRejected) so rejection doesn't produce an
    // unhandled rejection on the chained promise. The original donePromise
    // still rejects to the caller as expected.
    const cleanup = () => {
      clearInterval(timeoutIntervalId);
      if (this._activeUuid === uuid) {
        this._activeUuid = null;
      }
    };
    donePromise.then(cleanup, cleanup);

    // Execute initial main() - errors are handled within main() via terminateWithError
    main();

    return donePromise;
  }

  /**
   * Public method for creating DOM JSON
   * Delegates to the pure module-level function
   */
  createDomJson = (
    type: 'div' | 'button' | 'input',
    param1: DomOptions | DomJson[] = {},
    param2: DomJson[] = [],
  ): DomJson => {
    return createDomJson(type, param1, param2);
  };

  registerRevealApproval(resolve: () => void, reject: (err: Error) => void): void {
    if (!this._activeUuid) return;
    updateExecutionContext(this._activeUuid, { revealApproval: { resolve, reject } });
  }

  renderUi(windowId: number, json: DomJson): void {
    this.onRenderPluginUi(windowId, json);
  }
}

async function waitForWindow(
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

/**
 * Extract plugin configuration from plugin code without executing it.
 * Uses regex-based parsing to extract the config object from the source code.
 *
 * Note: This regex-based approach cannot extract complex fields like arrays
 * (requests, urls). For full config extraction including permissions, use
 * Host.getPluginConfig() which uses the QuickJS sandbox.
 *
 * @param code - The plugin source code
 * @returns The plugin config object, or null if extraction fails
 */
export async function extractConfig(code: string): Promise<PluginConfig | null> {
  try {
    // Pattern to match config object definition:
    // const config = { name: '...', description: '...' }
    // or
    // const config = { name: "...", description: "..." }
    const configPattern =
      /const\s+config\s*=\s*\{([^}]*name\s*:\s*['"`]([^'"`]+)['"`][^}]*description\s*:\s*['"`]([^'"`]+)['"`][^}]*|[^}]*description\s*:\s*['"`]([^'"`]+)['"`][^}]*name\s*:\s*['"`]([^'"`]+)['"`][^}]*)\}/s;

    const match = code.match(configPattern);

    if (!match) {
      return null;
    }

    // Extract name and description (could be in either order)
    const name = match[2] || match[5];
    const description = match[3] || match[4];

    if (!name) {
      return null;
    }

    const config: PluginConfig = {
      name,
      description: description || 'No description provided',
    };

    // Try to extract optional version
    const versionMatch = code.match(/version\s*:\s*['"`]([^'"`]+)['"`]/);
    if (versionMatch) {
      config.version = versionMatch[1];
    }

    // Try to extract optional author
    const authorMatch = code.match(/author\s*:\s*['"`]([^'"`]+)['"`]/);
    if (authorMatch) {
      config.author = authorMatch[1];
    }

    return config;
  } catch (error) {
    logger.error('[extractConfig] Failed to extract plugin config:', error);
    return null;
  }
}

// Export types
export type {
  HandlerType,
  HandlerPart,
  HandlerAction,
  CanonicalHandlerAction,
  CanonicalHandler,
  HashAlgorithm,
  PluginConfig,
  RequestPermission,
  Handler,
  StartLineHandler,
  HeadersHandler,
  BodyHandler,
  AllHandler,
  InterceptedRequest,
  InterceptedRequestHeader,
  DomJson,
  DomOptions,
  OpenWindowResponse,
  WindowMessage,
  ExecutionContext,
  ProveProgressData,
  RevealRangeDescriptor,
} from './types';

export { canonicalizeHandler, canonicalizeHandlers } from './types';

// Export Plugin API types
export type {
  PluginAPI,
  DivFunction,
  ButtonFunction,
  OpenWindowFunction,
  UseEffectFunction,
  UseHeadersFunction,
  UseRequestsFunction,
  UseStateFunction,
  SetStateFunction,
  ProveFunction,
  GetJsonBodyFunction,
  DoneFunction,
} from './globals';

// Re-export LogLevel for consumers
export { LogLevel } from '@tlsn/common';

// Export internal utilities (used by tests)
export { preprocessPluginCode };

// Export getJsonBody utility for plugin authors
export { getJsonBody };

// Default export
export default Host;
