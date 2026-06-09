/**
 * Default PluginRenderer for the CLI: pretty-prints the plugin's DomJson to
 * stdout each time it re-renders. Replaceable with an `ink`-based TUI later.
 */

import type { PluginDomJson, PluginRenderer, WindowHandle } from '@tlsn/host-contracts';

export class JsonRenderer implements PluginRenderer {
  render(handle: WindowHandle, dom: PluginDomJson): void {
    process.stdout.write(
      `\n--- plugin UI (window ${handle.id}) ---\n${JSON.stringify(dom, null, 2)}\n`,
    );
  }

  unmount(handle: WindowHandle): void {
    process.stdout.write(`\n--- plugin UI cleared (window ${handle.id}) ---\n`);
  }
}
