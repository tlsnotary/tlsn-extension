import { describe, it, expect } from 'vitest';
import { getJsonBody } from '../src/index';
import type { InterceptedRequest } from '../src/types';

function makeRequest(overrides?: Partial<InterceptedRequest>): InterceptedRequest {
  return {
    id: '1',
    method: 'POST',
    url: 'https://example.com/api',
    timestamp: Date.now(),
    tabId: 1,
    ...overrides,
  };
}

describe('getJsonBody', () => {
  it('should return null when request has no requestBody', () => {
    expect(getJsonBody(makeRequest())).toBeNull();
  });

  it('should return null when requestBody has no raw data', () => {
    expect(getJsonBody(makeRequest({ requestBody: { formData: { key: 'val' } } }))).toBeNull();
  });

  it('should return null when raw bytes are missing', () => {
    expect(getJsonBody(makeRequest({ requestBody: { raw: [{}] } }))).toBeNull();
  });

  it('should parse valid JSON from number array bytes', () => {
    const json = { username: 'test_user', action: 'login' };
    const bytes = Array.from(new TextEncoder().encode(JSON.stringify(json)));

    const result = getJsonBody(
      makeRequest({ requestBody: { raw: [{ bytes: new Uint8Array(bytes).buffer }] } }),
    );

    expect(result).toEqual(json);
  });

  it('should parse valid JSON from ArrayBuffer', () => {
    const json = { count: 42 };
    const encoder = new TextEncoder();
    const buffer = encoder.encode(JSON.stringify(json)).buffer;

    const result = getJsonBody(makeRequest({ requestBody: { raw: [{ bytes: buffer }] } }));

    expect(result).toEqual(json);
  });

  it('should return raw string when body is not valid JSON', () => {
    const text = 'not-json-content';
    const bytes = new TextEncoder().encode(text).buffer;

    const result = getJsonBody(makeRequest({ requestBody: { raw: [{ bytes }] } }));

    expect(result).toBe(text);
  });

  it('should handle empty JSON object', () => {
    const bytes = new TextEncoder().encode('{}').buffer;

    const result = getJsonBody(makeRequest({ requestBody: { raw: [{ bytes }] } }));

    expect(result).toEqual({});
  });

  it('should handle JSON arrays', () => {
    const json = [1, 2, 3];
    const bytes = new TextEncoder().encode(JSON.stringify(json)).buffer;

    const result = getJsonBody(makeRequest({ requestBody: { raw: [{ bytes }] } }));

    expect(result).toEqual(json);
  });
});
