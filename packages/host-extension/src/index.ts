/**
 * @tlsn/host-extension
 *
 * TLSNotary host adapter for Manifest-V3 browser extensions. Implements
 * `@tlsn/host-contracts` via `chrome.windows` / `webRequest` for window and
 * header interception, an offscreen-document `tlsn-wasm` prover, and a
 * content-script DOM renderer.
 *
 * Subpath entries (each browser-extension process consumes a different one):
 *   - `@tlsn/host-extension/background` — WindowManager, RequestInterceptor,
 *      ConfirmationManager (service worker)
 *   - `@tlsn/host-extension/content`    — PluginRenderer + content bridge
 *   - `@tlsn/host-extension/offscreen`  — SessionManager + ProveManager,
 *      permission validator (offscreen document)
 *   - `@tlsn/host-extension/types`      — shared message + window types
 *   - `@tlsn/host-extension/util`       — limits, IndexedDB helpers, URL +
 *      crypto utilities
 *
 * The other primitives (WindowManager, SessionManager, ProveManager,
 * ConfirmationManager, PluginRenderer) extract from packages/extension in
 * subsequent commits.
 */

export type { HostAdapter } from '@tlsn/host-contracts';
