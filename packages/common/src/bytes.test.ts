import { describe, it, expect } from 'vitest';
import { bytesToBase64, base64ToBytes, toUint8Array } from './bytes.js';

/**
 * Tests for the byte-bridge helpers. These carry the prover's MPC stream over
 * text-only channels, so the round-trip must be byte-exact: a single dropped or
 * transposed byte corrupts the MPC silently. The cases below cover the edges
 * (empty, every byte value, and a payload larger than one MPC frame).
 */

describe('bytesToBase64 / base64ToBytes round-trip', () => {
  const roundTrip = (bytes: Uint8Array) => base64ToBytes(bytesToBase64(bytes));

  it('round-trips an empty buffer', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
    expect(base64ToBytes('')).toEqual(new Uint8Array(0));
  });

  it('round-trips a short ASCII-ish payload', () => {
    const bytes = new Uint8Array([0x47, 0x45, 0x54, 0x20, 0x2f]); // "GET /"
    expect(roundTrip(bytes)).toEqual(bytes);
  });

  it('round-trips every possible byte value (0..255)', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    expect(roundTrip(bytes)).toEqual(bytes);
  });

  it('round-trips NUL bytes without truncating', () => {
    const bytes = new Uint8Array([0x00, 0x41, 0x00, 0x00, 0x42]);
    expect(roundTrip(bytes)).toEqual(bytes);
  });

  it('round-trips a payload larger than a single MPC frame', () => {
    const bytes = new Uint8Array(70_000); // > the largest plugin maxRecvData (65536)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff;
    expect(roundTrip(bytes)).toEqual(bytes);
  });

  it('produces a base64 string that decodes to the original length', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const b64 = bytesToBase64(bytes);
    expect(b64).toBe('AQID');
    expect(base64ToBytes(b64)).toEqual(bytes);
  });
});

describe('toUint8Array', () => {
  it('returns a Uint8Array unchanged', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(toUint8Array(bytes)).toBe(bytes);
  });

  it('wraps an ArrayBuffer into a Uint8Array view', () => {
    const buf = new Uint8Array([4, 5, 6]).buffer;
    expect(toUint8Array(buf)).toEqual(new Uint8Array([4, 5, 6]));
  });
});
