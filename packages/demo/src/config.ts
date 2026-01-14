// Environment configuration helper
// Reads from Vite's import.meta.env (populated from .env files)

const VERIFIER_HOST = (import.meta as any).env.VITE_VERIFIER_HOST || 'localhost:7047';
const SSL = (import.meta as any).env.VITE_SSL === 'true';

export const config = {
    verifierUrl: `${SSL ? 'https' : 'http'}://${VERIFIER_HOST}`,
    getProxyUrl: (host: string) => `${SSL ? 'wss' : 'ws'}://${VERIFIER_HOST}/proxy?token=${host}`,
};
