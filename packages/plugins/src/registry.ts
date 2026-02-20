/**
 * Shared plugin registry — single source of truth for all plugin metadata.
 *
 * Consumed by both `packages/demo` and `packages/mobile`.
 */

export interface PluginMetadata {
  /** Unique plugin identifier (used as filename and route param) */
  id: string;
  /** Display name */
  name: string;
  /** User-facing description */
  description: string;
  /** Emoji logo */
  logo: string;
  /** Label shown above the key result value (e.g. "Top Artist") */
  resultLabel: string;
  /** Accent colour for UI theming */
  accentColor: string;
  /** Which platforms include this plugin */
  platforms: ('demo' | 'mobile')[];
  /** Plugin config (mirrors the plugin's internal `config` object) */
  pluginConfig: {
    name: string;
    description: string;
    requests: {
      method: string;
      host: string;
      pathname: string;
    }[];
    urls: string[];
  };
}

export const PLUGIN_REGISTRY: PluginMetadata[] = [
  {
    id: 'twitter',
    name: 'Twitter Profile',
    description:
      'Prove your Twitter profile information with cryptographic verification',
    logo: '\uD835\uDD4F', // 𝕏
    resultLabel: 'Screen Name',
    accentColor: '#667eea',
    platforms: ['demo'],
    pluginConfig: {
      name: 'X Profile Prover',
      description: 'This plugin will prove your X.com profile.',
      requests: [
        {
          method: 'GET',
          host: 'api.x.com',
          pathname: '/1.1/account/settings.json',
        },
      ],
      urls: ['https://x.com/*'],
    },
  },
  {
    id: 'swissbank',
    name: 'Swiss Bank',
    description:
      'Verify your Swiss bank account balance securely and privately. (Login: admin / admin)',
    logo: '\uD83C\uDFE6', // 🏦
    resultLabel: 'Account Balance (CHF)',
    accentColor: '#4CAF50',
    platforms: ['demo', 'mobile'],
    pluginConfig: {
      name: 'Swiss Bank Prover',
      description: 'This plugin will prove your Swiss Bank account balance.',
      requests: [
        {
          method: 'GET',
          host: 'swissbank.tlsnotary.org',
          pathname: '/balances',
        },
      ],
      urls: ['https://swissbank.tlsnotary.org/*'],
    },
  },
  {
    id: 'spotify',
    name: 'Spotify',
    description:
      'Prove your Spotify listening history and music preferences',
    logo: '\uD83C\uDFB5', // 🎵
    resultLabel: 'Top Artist',
    accentColor: '#1DB954',
    platforms: ['demo', 'mobile'],
    pluginConfig: {
      name: 'Spotify Top Artist',
      description: 'This plugin will prove your top artist on Spotify.',
      requests: [
        {
          method: 'GET',
          host: 'api.spotify.com',
          pathname: '/v1/me/top/artists',
        },
      ],
      urls: ['https://developer.spotify.com/*'],
    },
  },
  {
    id: 'duolingo',
    name: 'Duolingo',
    description:
      'Prove your Duolingo language learning progress and achievements',
    logo: '\uD83E\uDD89', // 🦉
    resultLabel: 'Longest Streak',
    accentColor: '#58CC02',
    platforms: ['demo', 'mobile'],
    pluginConfig: {
      name: 'Duolingo Plugin',
      description:
        'This plugin will prove your email and current streak on Duolingo.',
      requests: [
        {
          method: 'GET',
          host: 'www.duolingo.com',
          pathname: '/2023-05-23/users/*',
        },
      ],
      urls: ['https://www.duolingo.com/*'],
    },
  },
];

export function getPluginById(id: string): PluginMetadata | undefined {
  return PLUGIN_REGISTRY.find((p) => p.id === id);
}

export function getPluginsForPlatform(
  platform: 'demo' | 'mobile',
): PluginMetadata[] {
  return PLUGIN_REGISTRY.filter((p) => p.platforms.includes(platform));
}
