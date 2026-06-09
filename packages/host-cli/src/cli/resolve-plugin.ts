/**
 * Plugin resolution: turn a CLI argument (an id like "swissbank" or a path to
 * a built .js file) into a (code, manifest) pair the host can run.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
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
 *   - otherwise → look it up in `@tlsn/plugins`'s registry + bundle exports
 *
 * Uses dynamic ESM import because `@tlsn/plugins` only declares the `import`
 * condition in its `exports` map (no `require`), so CJS resolution can't see it.
 */
export async function resolvePlugin(ref: string): Promise<ResolvedPlugin> {
  if (ref.includes('/') || ref.endsWith('.js')) {
    const path = resolvePath(process.cwd(), ref);
    const code = readFileSync(path, 'utf8');
    return { id: basenameNoExt(path), source: path, code };
  }

  const registryMod = (await import('@tlsn/plugins')) as unknown as {
    PLUGIN_REGISTRY: Array<{ id: string; pluginConfig: PluginConfig }>;
  };

  const entry = registryMod.PLUGIN_REGISTRY.find((p) => p.id === ref);
  if (!entry) {
    throw new Error(
      `Unknown plugin "${ref}". Known: ${registryMod.PLUGIN_REGISTRY.map((p) => p.id).join(', ')}`,
    );
  }

  // Use the mobile bundle — @tlsn/plugin-sdk's NativeFunctionEvaluator (which
  // we use in the CLI) expects function-body code, not an ESM module with
  // `export` statements. The mobile build wraps the bundle as
  // `export const <NAME>_PLUGIN_CODE = ` followed by a template-string body
  // that already ends with `return …`. The demo build is ESM and would only
  // work under the QuickJS-backed Host.
  let bundleSpecifier: string;
  try {
    bundleSpecifier = `@tlsn/plugins/mobile/${ref}.js`;
    await import.meta.resolve(bundleSpecifier);
  } catch (err) {
    throw new Error(
      `Plugin "${ref}" is in the registry but no built mobile bundle is exported via @tlsn/plugins/mobile/${ref}.js. ` +
        `Run \`npm run build:plugins\` from the monorepo root and try again. (${
          err instanceof Error ? err.message : String(err)
        })`,
    );
  }
  const mod = (await import(bundleSpecifier)) as Record<string, unknown>;
  const constantName = `${ref.toUpperCase()}_PLUGIN_CODE`;
  const code = mod[constantName];
  if (typeof code !== 'string') {
    throw new Error(
      `Plugin "${ref}" mobile bundle did not export ${constantName} as a string. Got: ${Object.keys(mod).join(', ')}`,
    );
  }
  const bundlePath = fileURLToPath(await import.meta.resolve(bundleSpecifier));
  return { id: ref, source: bundlePath, code, config: entry.pluginConfig };
}

function basenameNoExt(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.js$/, '');
}
