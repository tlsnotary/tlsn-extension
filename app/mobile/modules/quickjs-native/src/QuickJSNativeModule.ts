import { requireNativeModule } from 'expo-modules-core';

interface QuickJSNativeModuleInterface {
  /**
   * Create a new isolated JavaScript context.
   * Returns a unique context ID string.
   */
  createContext(): string;

  /**
   * Evaluate JavaScript code in a context.
   * Returns the result as a JSON-serialized string.
   */
  evalCode(contextId: string, code: string): Promise<string>;

  /**
   * Register a host function that can be called from inside the sandbox.
   * When the sandbox calls this function, a 'hostFunctionCall' event is emitted.
   */
  registerHostFunction(contextId: string, envPath: string): void;

  /**
   * Resolve a pending host function call with a result.
   * The callId comes from the 'hostFunctionCall' event.
   */
  resolveHostCall(contextId: string, callId: string, resultJson: string): void;

  /**
   * Reject a pending host function call with an error.
   */
  rejectHostCall(contextId: string, callId: string, errorMessage: string): void;

  /**
   * Dispose a context and free its resources.
   */
  disposeContext(contextId: string): void;

  /**
   * Check if the native module is available.
   */
  isAvailable(): boolean;
}

export default requireNativeModule<QuickJSNativeModuleInterface>('QuickJSNative');
