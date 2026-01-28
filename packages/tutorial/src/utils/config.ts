export const config = {
  verifierHost: import.meta.env.VITE_VERIFIER_HOST || 'localhost:7047',
  ssl: import.meta.env.VITE_SSL === 'true',
  get verifierUrl() {
    return `${this.ssl ? 'https' : 'http'}://${this.verifierHost}`;
  },
  get wsProtocol() {
    return this.ssl ? 'wss' : 'ws';
  },
};
