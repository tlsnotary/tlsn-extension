import { EventEmitter, type EventSubscription } from 'expo-modules-core';
import QuickJSNativeModule from './QuickJSNativeModule';

/**
 * Event emitted when sandbox code calls a registered host function.
 */
export interface HostFunctionCallEvent {
  contextId: string;
  callId: string;
  functionName: string;
  argsJson: string;
}

// Create an event emitter for native module events
const emitter = new EventEmitter(QuickJSNativeModule);

/**
 * High-level wrapper around the QuickJS native module.
 * Provides a sandboxed JavaScript execution environment with
 * support for host function callbacks.
 */
export class QuickJSContext {
  readonly contextId: string;
  private disposed = false;
  private hostFunctions = new Map<string, (...args: unknown[]) => unknown | Promise<unknown>>();
  private subscription: EventSubscription | null = null;

  private constructor(contextId: string) {
    this.contextId = contextId;

    // Listen for host function calls from the sandbox
    this.subscription = emitter.addListener('hostFunctionCall', (event: HostFunctionCallEvent) => {
      if (event.contextId !== this.contextId) return;
      this.handleHostFunctionCall(event);
    });
  }

  /**
   * Create a new isolated QuickJS context.
   */
  static create(): QuickJSContext {
    const contextId = QuickJSNativeModule.createContext();
    return new QuickJSContext(contextId);
  }

  /**
   * Register a host function accessible from sandbox code via `env.<name>`.
   *
   * The function will be called when sandbox code invokes `env.<name>(args)`.
   * Async host functions are supported — they create a Promise in the sandbox
   * that resolves when the host function completes.
   */
  registerHostFunction(
    name: string,
    handler: (...args: unknown[]) => unknown | Promise<unknown>,
  ): void {
    this.ensureNotDisposed();
    this.hostFunctions.set(name, handler);
    QuickJSNativeModule.registerHostFunction(this.contextId, name);
  }

  /**
   * Evaluate JavaScript code in the sandbox.
   * Returns the result parsed from JSON.
   */
  async eval(code: string): Promise<unknown> {
    this.ensureNotDisposed();
    const resultJson = await QuickJSNativeModule.evalCode(this.contextId, code);
    try {
      return JSON.parse(resultJson);
    } catch {
      return resultJson;
    }
  }

  /**
   * Dispose the context and free native resources.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }

    this.hostFunctions.clear();

    try {
      QuickJSNativeModule.disposeContext(this.contextId);
    } catch (e) {
      console.warn('[QuickJSContext] Error disposing context:', e);
    }
  }

  private async handleHostFunctionCall(event: HostFunctionCallEvent): Promise<void> {
    const handler = this.hostFunctions.get(event.functionName);

    if (!handler) {
      QuickJSNativeModule.rejectHostCall(
        this.contextId,
        event.callId,
        `Host function '${event.functionName}' not registered`,
      );
      return;
    }

    try {
      const args = JSON.parse(event.argsJson);
      const result = await handler(...(Array.isArray(args) ? args : [args]));
      const resultJson = JSON.stringify(result ?? null);
      QuickJSNativeModule.resolveHostCall(this.contextId, event.callId, resultJson);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      QuickJSNativeModule.rejectHostCall(this.contextId, event.callId, message);
    }
  }

  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error('QuickJS context has been disposed');
    }
  }
}

/**
 * Check if the native QuickJS module is available.
 */
export function isAvailable(): boolean {
  try {
    return QuickJSNativeModule.isAvailable();
  } catch {
    return false;
  }
}
