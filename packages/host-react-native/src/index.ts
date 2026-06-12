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

// This package owns ONLY React Native-specific glue. Protocol types
// (Handler, PluginConfig, DomJson, WindowMessage, …) come from @tlsn/plugin-sdk;
// contract interfaces (HostAdapter, ApprovalMode, NativeHandler, translateHandler)
// come from @tlsn/host-contracts. Consumers import from each layer directly.

export { MobilePluginHost, type EventEmitter } from './MobilePluginHost';
// RevealRangeDescriptor here is the *native* (tlsn-native / uniffi PascalCase)
// variant the reveal-approval sheet renders byte previews from — distinct from
// plugin-sdk's RevealRangeDescriptor. Re-exported because tlsn-native is a
// platform-specific dependency this adapter owns.
export type { RevealRangeDescriptor } from './MobilePluginHost';
