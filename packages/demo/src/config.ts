// Environment configuration helper
// Reads from Vite's import.meta.env (populated from .env files)

const VERIFIER_HOST = import.meta.env.VITE_VERIFIER_HOST || 'localhost:7047';
const SSL = import.meta.env.VITE_SSL === 'true';

export const config = {
  verifierUrl: `${SSL ? 'https' : 'http'}://${VERIFIER_HOST}`,
  getProxyUrl: (host: string) => `${SSL ? 'wss' : 'ws'}://${VERIFIER_HOST}/proxy?token=${host}`,
};

// Minimum extension version this demo is compatible with.
// Bump this only after a new extension build is approved on the Chrome Web Store,
// so users with the previously-released extension don't get falsely flagged as outdated.
// Extensions exposing no `version` field are treated as outdated.
export const MIN_EXTENSION_VERSION = '0.1.0.1409';
