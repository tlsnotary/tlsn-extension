import {
  getPluginsForPlatform,
  type PluginMetadata,
} from '@tlsn/plugins';
import type { PluginConfig } from '../../lib/MobilePluginHost';

export interface PluginEntry {
  id: string;
  name: string;
  description: string;
  logo: string;
  /** Label shown above the key result value (e.g. "Top Artist") */
  resultLabel: string;
  /** Accent colour for the result header gradient */
  accentColor: string;
  pluginConfig: PluginConfig;
  getPluginCode: () => string;
}

// Static require map — Metro needs static require() calls for bundling.
// These reference the auto-generated string exports from @tlsn/plugins/dist/mobile/.
// Run `npm run build:plugins` to generate these files.
const CODE_MAP: Record<string, () => string> = {
  swissbank: () => require('@tlsn/plugins/dist/mobile/swissbank').SWISSBANK_PLUGIN_CODE,
  spotify: () => require('@tlsn/plugins/dist/mobile/spotify').SPOTIFY_PLUGIN_CODE,
  duolingo: () => require('@tlsn/plugins/dist/mobile/duolingo').DUOLINGO_PLUGIN_CODE,
};

const VERIFIER_URL = 'http://localhost:7047';

function toPluginEntry(meta: PluginMetadata): PluginEntry {
  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    logo: meta.logo,
    resultLabel: meta.resultLabel,
    accentColor: meta.accentColor,
    pluginConfig: {
      name: meta.pluginConfig.name,
      description: meta.pluginConfig.description,
      requests: meta.pluginConfig.requests.map((r) => ({
        ...r,
        verifierUrl: VERIFIER_URL,
      })),
      urls: meta.pluginConfig.urls,
    },
    getPluginCode: CODE_MAP[meta.id] || (() => ''),
  };
}

export const PLUGIN_REGISTRY: PluginEntry[] =
  getPluginsForPlatform('mobile').map(toPluginEntry);

export function getPluginById(id: string): PluginEntry | undefined {
  return PLUGIN_REGISTRY.find((p) => p.id === id);
}
