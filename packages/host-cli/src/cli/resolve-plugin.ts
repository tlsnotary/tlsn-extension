/**
 * Plugin resolution: turn a CLI argument (an id like "swissbank" or a path to
 * a built .js file) into a (code, manifest) pair the host can run.
 */

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { createRequire } from 'node:module';
import type { PluginConfig } from '@tlsn/host-contracts';

export interface ResolvedPlugin {
  /** The plugin id, used for display + storageState filename. */
  id: string;
  /** Path the code was loaded from (for error messages). */
  source: string;
  /** Built plugin JS as a string, ready to hand to `Host.executePlugin()`. */
  code: string;
  /** Plugin manifest extracted from the registry (if available). */
  config?: PluginConfig;
}

/**
 * Resolve a plugin reference:
 *   - if it looks like a path (contains `/` or ends in `.js`) → read that file
 *   - otherwise → look it up in `@tlsn/plugins`'s registry + dist bundles
 */
export function resolvePlugin(ref: string): ResolvedPlugin {
  if (ref.includes('/') || ref.endsWith('.js')) {
    const path = resolvePath(process.cwd(), ref);
    const code = readFileSync(path, 'utf8');
    return { id: basenameNoExt(path), source: path, code };
  }

  // Resolve from @tlsn/plugins. dist/registry.js exports PLUGIN_REGISTRY +
  // dist/demo/<id>.js holds the built bundle.
  const require = createRequire(import.meta.url);
  const registryPath = require.resolve('@tlsn/plugins/dist/registry.js');
  const registryUrl = `file://${registryPath}`;
  // Synchronous read via require is simpler than dynamic import here — the
  // dist bundle is CJS-compatible and we already have the path.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const registryMod = require(registryPath) as {
    PLUGIN_REGISTRY: Array<{ id: string; pluginConfig: PluginConfig }>;
  };

  const entry = registryMod.PLUGIN_REGISTRY.find((p) => p.id === ref);
  if (!entry) {
    throw new Error(
      `Unknown plugin "${ref}". Known: ${registryMod.PLUGIN_REGISTRY.map((p) => p.id).join(', ')}`,
    );
  }

  // Built bundle sits next to the registry file under demo/.
  const bundlePath = registryPath.replace(/registry\.js$/, `demo/${ref}.js`);
  let code: string;
  try {
    code = readFileSync(bundlePath, 'utf8');
  } catch (err) {
    throw new Error(
      `Plugin "${ref}" is in the registry but no built bundle was found at ${bundlePath}. ` +
        `Run \`npm run build:plugins\` from the monorepo root and try again.`,
    );
  }

  void registryUrl;
  return { id: ref, source: bundlePath, code, config: entry.pluginConfig };
}

function basenameNoExt(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.js$/, '');
}
