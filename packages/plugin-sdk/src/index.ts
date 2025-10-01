/**
 * @tlsn/plugin-sdk
 *
 * SDK for developing and running TLSN WebAssembly plugins
 */

// Version export
export const VERSION = '0.1.0';

// Plugin interface types (placeholder for future implementation)
export interface PluginConfig {
  name: string;
  version: string;
  description?: string;
}

export interface PluginMetadata {
  id: string;
  name: string;
  version: string;
  author?: string;
  description?: string;
  capabilities?: string[];
}

// Core SDK class (placeholder for future implementation)
export class PluginSDK {
  private config: PluginConfig;

  constructor(config: PluginConfig) {
    this.config = config;
  }

  getConfig(): PluginConfig {
    return this.config;
  }

  // Placeholder methods for future implementation
  async initialize(): Promise<void> {
    // Implementation pending
  }

  async execute(): Promise<void> {
    // Implementation pending
  }
}

// Default export
export default PluginSDK;
