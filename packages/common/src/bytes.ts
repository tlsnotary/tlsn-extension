/**
 * Byte helpers for relaying binary MPC frames over text-only channels.
 *
 * The extension bridges the prover's MPC byte stream through chrome message
 * passing (JSON only), and the demo relays it over a PeerJS data channel, so
 * binary frames are base64-encoded in transit. These helpers are the single
 * source of truth for that encoding on both sides — a mismatch would corrupt
 * the MPC stream silently.
 */

/**
 * Encodes raw bytes as a base64 string.
 *
 * Built one char at a time rather than `String.fromCharCode(...bytes)` so large
 * MPC frames don't blow the argument-count limit of a spread call.
 *
 * @param bytes The bytes to encode.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/**
 * Decodes a base64 string produced by {@link bytesToBase64} back to bytes.
 *
 * @param b64 The base64 string to decode.
 */
export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

/**
 * Normalizes a data-channel payload to a `Uint8Array`.
 *
 * PeerJS hands binary frames over as either a `Uint8Array` or a raw
 * `ArrayBuffer` depending on the channel; callers want a `Uint8Array`.
 *
 * @param data The payload received from the transport.
 */
export function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(data as ArrayBufferLike);
}
