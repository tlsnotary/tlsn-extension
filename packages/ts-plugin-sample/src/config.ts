/**
 * Plugin Configuration
 *
 * Defines metadata and permissions for the X Profile Prover plugin.
 */

// Type imports only (stripped at compile time)
import type { PluginConfig, RequestPermission } from '@tlsn/plugin-sdk';

export const config: PluginConfig = {
  name: 'X Profile Prover',
  description: 'This plugin will prove your X.com profile.',
  version: '0.1.0',
  author: 'TLSN Team',
  requests: [
    {
      method: 'GET',
      host: 'api.x.com',
      pathname: '/1.1/account/settings.json',
      verifierUrl: 'http://localhost:7047',
    } satisfies RequestPermission,
  ],
  urls: ['https://x.com/*'],
};
