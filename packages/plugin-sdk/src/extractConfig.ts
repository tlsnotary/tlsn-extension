/**
 * Extract plugin configuration from plugin code without executing it.
 * This module is intentionally separate from the main index.ts to avoid
 * importing QuickJS and other heavy dependencies that don't work in
 * service workers.
 */

import type { PluginConfig } from './types';

/**
 * Extract plugin configuration from plugin code without executing it.
 * Uses regex-based parsing to extract the config object from the source code
 * without running any JavaScript.
 *
 * @param code - The plugin source code
 * @returns The plugin config object, or null if extraction fails
 */
export function extractConfig(code: string): PluginConfig | null {
  try {
    // Pattern to match config object definition:
    // const config = { name: '...', description: '...' }
    // or
    // const config = { name: "...", description: "..." }
    const configPattern =
      /const\s+config\s*=\s*\{([^}]*name\s*:\s*['"`]([^'"`]+)['"`][^}]*description\s*:\s*['"`]([^'"`]+)['"`][^}]*|[^}]*description\s*:\s*['"`]([^'"`]+)['"`][^}]*name\s*:\s*['"`]([^'"`]+)['"`][^}]*)\}/s;

    const match = code.match(configPattern);

    if (!match) {
      return null;
    }

    // Extract name and description (could be in either order)
    const name = match[2] || match[5];
    const description = match[3] || match[4];

    if (!name) {
      return null;
    }

    const config: PluginConfig = {
      name,
      description: description || 'No description provided',
    };

    // Try to extract optional version
    const versionMatch = code.match(/version\s*:\s*['"`]([^'"`]+)['"`]/);
    if (versionMatch) {
      config.version = versionMatch[1];
    }

    // Try to extract optional author
    const authorMatch = code.match(/author\s*:\s*['"`]([^'"`]+)['"`]/);
    if (authorMatch) {
      config.author = authorMatch[1];
    }

    return config;
  } catch {
    return null;
  }
}

// Re-export PluginConfig type for convenience
export type { PluginConfig };
