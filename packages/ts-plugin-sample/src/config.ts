/**
 * Plugin Configuration
 *
 * Defines metadata and permissions for the X Profile Prover plugin.
 */

// Type imports only (stripped at compile time)
import type { PluginConfig, RequestPermission } from '@tlsn/plugin-sdk';

// Injected at build time via esbuild --define
declare const __VERIFIER_URL__: string;

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
      verifierUrl: __VERIFIER_URL__,
    } satisfies RequestPermission,
  ],
  urls: ['https://x.com/*'],
};
