// Environment configuration helper
// Reads from Vite's import.meta.env (populated from .env files)

const VERIFIER_HOST = (import.meta as any).env.VITE_VERIFIER_HOST || 'localhost:7047';
const VERIFIER_PROTOCOL = (import.meta as any).env.VITE_VERIFIER_PROTOCOL || 'http';
const PROXY_PROTOCOL = (import.meta as any).env.VITE_PROXY_PROTOCOL || 'ws';

export const config = {
    verifierUrl: `${VERIFIER_PROTOCOL}://${VERIFIER_HOST}`,
    getProxyUrl: (host: string) => `${PROXY_PROTOCOL}://${VERIFIER_HOST}/proxy?token=${host}`,
};
