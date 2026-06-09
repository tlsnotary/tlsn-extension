/**
 * @tlsn/plugin-sdk
 *
 * SDK for developing and running TLSN WebAssembly plugins
 */

import { SandboxEvalCode, type SandboxOptions, loadQuickJs } from '@sebastianwessel/quickjs';
import variant from '@jitl/quickjs-ng-wasmfile-release-sync';
import {
  HostCore,
  HostCoreOptions,
  PluginEvaluator,
  PluginEvaluatorResult,
  AnyFunction,
  HookContext,
  updateExecutionContext,
  extractPluginExports,
} from './host-core';
import { InterceptedRequest, InterceptedRequestHeader, PluginConfig } from './types';

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
 * with arrow function wrappers (arrow functions have no .prototype). The parse step
 * is shared with NativeFunctionEvaluator via `extractPluginExports`; only the
 * trailer differs (ES module export here, function-body return there).
 */
export function preprocessPluginCode(code: string): string {
  const parsed = extractPluginExports(code);
  if (!parsed) return code;
  return `${parsed.stripped}\nexport default { ${parsed.entries} };`;
}

// ---------------------------------------------------------------------------
// QuickJS sandbox helpers
// ---------------------------------------------------------------------------

async function createQuickJSSandbox(capabilities: Record<string, AnyFunction>): Promise<{
  eval: (code: string) => Promise<unknown>;
  dispose: () => void;
}> {
  const { runSandboxed } = await loadQuickJs(variant);

  const options: SandboxOptions = {
    allowFetch: false,
    allowFs: false,
    maxStackSize: 0,
    env: capabilities,
  };

  let evalCode: SandboxEvalCode | null = null;
  let disposeCallback: (() => void) | null = null;
  let sandboxError: Error | null = null;

  const sandboxPromise = runSandboxed(async (sandbox) => {
    evalCode = sandbox.evalCode;

    return new Promise<void>((resolve) => {
      disposeCallback = resolve;
    });
  }, options).catch((err: Error) => {
    sandboxError = err;
    if (!evalCode) {
      evalCode = (() => ({ ok: false, error: err })) as unknown as SandboxEvalCode;
    }
  });

  while (!evalCode) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return {
    eval: async (code: string) => {
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
      sandboxPromise.catch(() => {});
    },
  };
}

function createQuickJSEvaluator(): PluginEvaluator {
  return {
    evaluate: async (
      code: string,
      capabilities: Record<string, AnyFunction>,
    ): Promise<PluginEvaluatorResult> => {
      const sandbox = await createQuickJSSandbox(capabilities);
      const processedCode = preprocessPluginCode(code);

      const evalScript = `
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
`;

      try {
        const evalResult = await sandbox.eval(evalScript);
        return {
          exports: (evalResult ?? {}) as Record<string, unknown>,
          dispose: sandbox.dispose,
        };
      } catch (err) {
        sandbox.dispose();
        throw err;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Host — QuickJS-backed HostCore (backward-compatible public API)
// ---------------------------------------------------------------------------

export class Host extends HostCore {
  constructor(options: Omit<HostCoreOptions, 'evaluator'>) {
    super({
      ...options,
      evaluator: createQuickJSEvaluator(),
    });
  }

  /**
   * Creates a sandboxed QuickJS environment.
   * Kept for backward compatibility — used by getPluginConfig() and potentially
   * external callers that need a raw sandbox.
   */
  async createEvalCode(capabilities?: Record<string, AnyFunction>): Promise<{
    eval: (code: string) => Promise<unknown>;
    dispose: () => void;
  }> {
    return createQuickJSSandbox({
      ...Object.fromEntries(this.capabilities),
      ...(capabilities ?? {}),
    });
  }

  /**
   * Kept for backward compatibility — used by SessionManager.
   */
  updateExecutionContext(
    uuid: string,
    params: {
      windowId?: number;
      plugin?: string;
      requests?: InterceptedRequest[];
      headers?: InterceptedRequestHeader[];
      context?: HookContext;
      currentContext?: string;
      stateStore?: Record<string, unknown>;
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
}

/**
 * Extract plugin configuration from plugin code without executing it.
 * Uses regex-based parsing to extract the config object from the source code.
 */
export async function extractConfig(code: string): Promise<PluginConfig | null> {
  try {
    const configPattern =
      /const\s+config\s*=\s*\{([^}]*name\s*:\s*['"`]([^'"`]+)['"`][^}]*description\s*:\s*['"`]([^'"`]+)['"`][^}]*|[^}]*description\s*:\s*['"`]([^'"`]+)['"`][^}]*name\s*:\s*['"`]([^'"`]+)['"`][^}]*)\}/s;

    const match = code.match(configPattern);

    if (!match) {
      return null;
    }

    const name = match[2] || match[5];
    const description = match[3] || match[4];

    if (!name) {
      return null;
    }

    const config: PluginConfig = {
      name,
      description: description || 'No description provided',
    };

    const versionMatch = code.match(/version\s*:\s*['"`]([^'"`]+)['"`]/);
    if (versionMatch) {
      config.version = versionMatch[1];
    }

    const authorMatch = code.match(/author\s*:\s*['"`]([^'"`]+)['"`]/);
    if (authorMatch) {
      config.author = authorMatch[1];
    }

    return config;
  } catch {
    return null;
  }
}

// Export types
export type {
  HandlerType,
  HandlerPart,
  HandlerAction,
  AssertAction,
  AssertOp,
  AssertValueType,
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

export { canonicalizeHandler, canonicalizeHandlers, isAssertAction } from './types';

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

// Export getJsonBody utility for plugin authors
export { getJsonBody } from './host-core';

// Export HostCore and PluginEvaluator for platform implementors
export type { PluginEvaluator, PluginEvaluatorResult, HostCoreOptions } from './host-core';
export { HostCore, NativeFunctionEvaluator } from './host-core';

// Timeout constants (consumed by tests and extension code)
export {
  DEFAULT_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  TIMEOUT_WARNING_LEAD_MS,
  TIMEOUT_EXTEND_MS,
  clampTimeout,
  createTimeoutWarningOverlay,
  createRevealApprovalOverlay,
  decorateJson,
} from './host-core';

// Default export
export default Host;
