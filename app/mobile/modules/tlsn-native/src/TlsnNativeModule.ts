import { requireNativeModule } from 'expo-modules-core';

// Declare the module interface
interface TlsnNativeModuleInterface {
  initialize(): void;
  prove(
    request: Record<string, unknown>,
    options: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  isAvailable(): boolean;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

// This call loads the native module object from the JSI
export default requireNativeModule<TlsnNativeModuleInterface>('TlsnNative');
