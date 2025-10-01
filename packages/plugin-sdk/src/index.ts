/**
 * @tlsn/plugin-sdk
 *
 * SDK for developing and running TLSN WebAssembly plugins
 */

import variant from '@jitl/quickjs-ng-wasmfile-release-sync';
import { loadQuickJs, type SandboxOptions } from '@sebastianwessel/quickjs';

// Initialize QuickJS once
let quickJsInstance: Awaited<ReturnType<typeof loadQuickJs>> | null = null;

async function getQuickJs() {
  if (!quickJsInstance) {
    quickJsInstance = await loadQuickJs(variant);
  }
  return quickJsInstance;
}

export class Host {
  private plugins: Map<string, string> = new Map();

  private capabilities: {
    [method: string]: (...args: any[]) => any;
  } = {};

  addCapability(method: string, callback: (...args: any[]) => any): void {
    this.capabilities[method] = callback;
  }

  /**
   * Load a plugin with the given ID and code
   * @param id - Unique identifier for the plugin
   * @param plugin - JavaScript code to be executed
   */
  loadPlugin(id: string, plugin: string): void {
    this.plugins.set(id, plugin);
  }

  /**
   * Run a plugin in a sandboxed QuickJS environment
   * @param id - ID of the plugin to run
   * @returns The result of the plugin execution
   */
  async runPlugin(id: string): Promise<unknown> {
    const plugin = this.plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin with id "${id}" not found`);
    }

    const quickJs = await getQuickJs();

    // Configure sandbox options
    const options: SandboxOptions = {
      allowFetch: false, // Disable network calls
      allowFs: false, // Disable file system access
      // add host functions
      env: {
        ...this.capabilities,
      },
      console: {
        log: (...args: unknown[]) => {
          console.log(`[PluginID:${id}]`, ...args);
        },
        error: (...args: unknown[]) => {
          console.error(`[PluginID:${id}]`, ...args);
        },
        warn: (...args: unknown[]) => {
          console.warn(`[PluginID:${id}]`, ...args);
        },
        info: (...args: unknown[]) => {
          console.info(`[PluginID:${id}]`, ...args);
        },
        debug: (...args: unknown[]) => {
          console.debug(`[PluginID:${id}]`, ...args);
        },
      },
    };

    // Run the plugin in sandbox with host function
    const result = await quickJs.runSandboxed(async ({ evalCode }) => {
      // Execute the plugin code
      const pluginResult = await evalCode(plugin);
      return pluginResult;
    }, options);

    if (result && !result.ok) {
      const errorMessage =
        (result as { error?: { message?: string } }).error?.message ||
        JSON.stringify((result as { error?: unknown }).error);
      throw new Error(`PluginID:${id} execution failed: ${errorMessage}`);
    }

    return result ? (result as { data: unknown }).data : undefined;
  }

  /**
   * Clear one or all loaded plugins
   * @param id - Optional ID of the plugin to clear. If not provided, clears all plugins.
   */
  clearPlugin(id?: string): void {
    if (id === undefined) {
      this.plugins.clear();
    } else {
      this.plugins.delete(id);
    }
  }

  /**
   * Get the number of loaded plugins
   * @returns Number of plugins currently loaded
   */
  getPluginCount(): number {
    return this.plugins.size;
  }

  /**
   * Check if a plugin with the given ID is loaded
   * @param id - ID of the plugin to check
   * @returns True if the plugin is loaded, false otherwise
   */
  hasPlugin(id: string): boolean {
    return this.plugins.has(id);
  }
}

// Default export
export default Host;
