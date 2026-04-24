import { getPluginsForPlatform, type PluginMetadata } from '@tlsn/plugins';
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
// These reference the auto-generated string exports from @tlsn/plugins/mobile/*.
// Run `npm run build:plugins` to generate these files.
const CODE_MAP: Record<string, () => string> = {
  twitter: () => require('@tlsn/plugins/dist/mobile/twitter').TWITTER_PLUGIN_CODE,
  swissbank: () => require('@tlsn/plugins/dist/mobile/swissbank').SWISSBANK_PLUGIN_CODE,
  swissbank_hash: () =>
    require('@tlsn/plugins/dist/mobile/swissbank_hash').SWISSBANK_HASH_PLUGIN_CODE,
  spotify: () => require('@tlsn/plugins/dist/mobile/spotify').SPOTIFY_PLUGIN_CODE,
  duolingo: () => require('@tlsn/plugins/dist/mobile/duolingo').DUOLINGO_PLUGIN_CODE,
  uber: () => require('@tlsn/plugins/dist/mobile/uber').UBER_PLUGIN_CODE,
  discord_dm: () => require('@tlsn/plugins/dist/mobile/discord_dm').DISCORD_DM_PLUGIN_CODE,
  discord_profile: () =>
    require('@tlsn/plugins/dist/mobile/discord_profile').DISCORD_PROFILE_PLUGIN_CODE,
};

const DEFAULT_VERIFIER_URL = 'https://demo.tlsnotary.org';

function toPluginEntry(meta: PluginMetadata, verifierUrl: string): PluginEntry {
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
        verifierUrl,
      })),
      urls: meta.pluginConfig.urls,
      oauthHosts: meta.pluginConfig.oauthHosts,
    },
    getPluginCode: CODE_MAP[meta.id] || (() => ''),
  };
}

export function getPluginRegistry(verifierUrl?: string): PluginEntry[] {
  const url = verifierUrl || DEFAULT_VERIFIER_URL;
  return getPluginsForPlatform('mobile').map((m) => toPluginEntry(m, url));
}

export function getPluginById(id: string, verifierUrl?: string): PluginEntry | undefined {
  return getPluginRegistry(verifierUrl).find((p) => p.id === id);
}

/** @deprecated Use getPluginRegistry(verifierUrl) instead */
export const PLUGIN_REGISTRY: PluginEntry[] = getPluginRegistry();
