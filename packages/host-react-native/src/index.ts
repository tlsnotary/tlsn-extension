/**
 * @tlsn/host-react-native
 *
 * TLSNotary host adapter for React Native. Implements `@tlsn/host-contracts`
 * via `react-native-webview` (window + header interception) and the
 * `tlsn-native` Expo module (TLS prover).
 *
 * Submodule entries:
 *   - `@tlsn/host-react-native/logger` — in-memory ring buffer of log entries
 *   - `@tlsn/host-react-native/style` — DOM CSS → React Native StyleSheet
 *   - `@tlsn/host-react-native/util` — small helpers (OAuth detection, …)
 *
 * Other primitives (MobilePluginHost, TlsnWebView, NativeProver,
 * PluginRenderer) extract from app/mobile in subsequent commits.
 */

export type { HostAdapter } from '@tlsn/host-contracts';

export {
  MobilePluginHost,
  translateHandler,
  translateHandlers,
  type ApprovalMode,
  type EventEmitter,
  type NativeHandler,
} from './MobilePluginHost.js';
export type {
  DomJson,
  DomOptions,
  Handler,
  InterceptedRequest,
  InterceptedRequestHeader,
  PluginConfig,
  WindowMessage,
  RevealRangeDescriptor,
} from './MobilePluginHost.js';

