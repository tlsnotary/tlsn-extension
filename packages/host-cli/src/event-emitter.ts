/**
 * Minimal EventEmitter shape the @tlsn/plugin-sdk Host's `executePlugin` needs.
 *
 * The SDK calls `emit(message)` from inside plugin code (e.g. when a plugin
 * calls a host capability), and listeners are notified. The adapter calls
 * `emit(message)` to push intercepted headers / window events into the plugin.
 */

import type { WindowMessage } from '@tlsn/plugin-sdk';

export class PluginEventEmitter {
  private listeners = new Set<(m: WindowMessage) => void>();

  addListener(cb: (m: WindowMessage) => void): void {
    this.listeners.add(cb);
  }

  removeListener(cb: (m: WindowMessage) => void): void {
    this.listeners.delete(cb);
  }

  emit(message: WindowMessage): void {
    for (const cb of [...this.listeners]) {
      try {
        cb(message);
      } catch {
        // Don't let one listener crash the dispatch.
      }
    }
  }
}
