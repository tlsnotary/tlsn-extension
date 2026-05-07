import { requireNativeModule } from 'expo-modules-core';

// Declare the module interface
interface TlsnNativeModuleInterface {
  initialize(): void;
  prove(
    request: Record<string, unknown>,
    options: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  /**
   * Phase A of the two-phase prove: runs the protocol up through
   * compute_reveal natively, then pauses with a list of byte-preview
   * descriptors. Pair with `proveFinalize`.
   */
  proveUntilReveal(
    request: Record<string, unknown> | string,
    options: Record<string, unknown> | string,
  ): Promise<Record<string, unknown>>;
  /**
   * Phase B: complete the prepared session (`approved=true`) or drop it
   * (`approved=false`).
   */
  proveFinalize(sessionId: string, approved: boolean): Promise<Record<string, unknown>>;
  isAvailable(): boolean;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

// This call loads the native module object from the JSI
export default requireNativeModule<TlsnNativeModuleInterface>('TlsnNative');
