// Mock crypto module for browser compatibility
export function randomBytes(size) {
  const bytes = new Uint8Array(size);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(bytes);
  }
  return Buffer.from(bytes);
}

export function createHash() {
  return {
    update: () => ({ digest: () => '' }),
    digest: () => '',
  };
}

export default {
  randomBytes,
  createHash,
};