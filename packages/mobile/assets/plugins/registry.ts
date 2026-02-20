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

export const PLUGIN_REGISTRY: PluginEntry[] = [
  {
    id: 'swissbank',
    name: 'Swiss Bank',
    logo: '🏦',
    resultLabel: 'Account Balance (CHF)',
    accentColor: '#4CAF50',
    description:
      'Verify your Swiss bank account balance securely and privately. (Login: admin / admin)',
    pluginConfig: {
      name: 'Swiss Bank Prover',
      description: 'This plugin will prove your Swiss Bank account balance.',
      requests: [
        {
          method: 'GET',
          host: 'swissbank.tlsnotary.org',
          pathname: '/balances',
          verifierUrl: 'http://localhost:7047',
        },
      ],
      urls: ['https://swissbank.tlsnotary.org/*'],
    },
    getPluginCode: () =>
      require('./swissbankPluginCode').SWISSBANK_PLUGIN_CODE,
  },
  {
    id: 'spotify',
    name: 'Spotify',
    logo: '🎵',
    resultLabel: 'Top Artist',
    accentColor: '#1DB954',
    description:
      'Prove your Spotify listening history and music preferences',
    pluginConfig: {
      name: 'Spotify Top Artist',
      description: 'This plugin will prove your top artist on Spotify.',
      requests: [
        {
          method: 'GET',
          host: 'api.spotify.com',
          pathname: '/v1/me/top/artists',
          verifierUrl: 'http://localhost:7047',
        },
      ],
      urls: ['https://developer.spotify.com/*'],
    },
    getPluginCode: () =>
      require('./spotifyPluginCode').SPOTIFY_PLUGIN_CODE,
  },
  {
    id: 'duolingo',
    name: 'Duolingo',
    logo: '🦉',
    resultLabel: 'Longest Streak',
    accentColor: '#58CC02',
    description:
      'Prove your Duolingo language learning progress and achievements',
    pluginConfig: {
      name: 'Duolingo Plugin',
      description:
        'This plugin will prove your email and current streak on Duolingo.',
      requests: [
        {
          method: 'GET',
          host: 'www.duolingo.com',
          pathname: '/2023-05-23/users/*',
          verifierUrl: 'http://localhost:7047',
        },
      ],
      urls: ['https://www.duolingo.com/*'],
    },
    getPluginCode: () =>
      require('./duolingoPluginCode').DUOLINGO_PLUGIN_CODE,
  },
];

export function getPluginById(id: string): PluginEntry | undefined {
  return PLUGIN_REGISTRY.find((p) => p.id === id);
}
