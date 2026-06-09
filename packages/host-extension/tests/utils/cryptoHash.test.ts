import { describe, it, expect } from 'vitest';
import { sha256 } from '../../src/util/cryptoHash.js';

describe('sha256', () => {
  it('returns the correct hash for "hello"', async () => {
    const hash = await sha256('hello');
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('returns the correct hash for empty string', async () => {
    const hash = await sha256('');
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('returns different hashes for different inputs', async () => {
    const a = await sha256('abc');
    const b = await sha256('def');
    expect(a).not.toBe(b);
  });
});
