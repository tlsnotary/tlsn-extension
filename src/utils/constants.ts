export const EXPLORER_API = 'https://explorer.tlsnotary.org';
export const MAX_RECV = 16384;
export const MAX_SENT = 4096;

export const NOTARY_API = 'https://notary.eternis.ai';
export const NOTARY_PROXY = 'wss://inn1.eternis.ai:55688';

export const NOTARY_API_LOCAL = 'http://localhost:7047';
export const NOTARY_PROXY_LOCAL = 'ws://localhost:55688';

export enum Mode {
  Development = 'development',
  Production = 'production',
}

export const MODE: Mode = (process.env.NODE_ENV as Mode) || Mode.Production;

export const EXPECTED_PCRS_DEBUG = {
  '1': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  '2': 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
};

// 1 second buffer time to prevent spamming of requests
export const NOTARIZATION_BUFFER_TIME = 5000;

export const DEFAULT_CONFIG_ENDPOINT =
  'https://eternis-extension-providers.s3.amazonaws.com/default-config.json';
