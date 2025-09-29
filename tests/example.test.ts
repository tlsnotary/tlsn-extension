/**
 * Example test file demonstrating Vitest setup
 */

import { describe, it, expect } from 'vitest';

describe('Example Test Suite', () => {
  it('should perform basic arithmetic', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle string operations', () => {
    const greeting = 'Hello, TLSNotary!';
    expect(greeting).toContain('TLSNotary');
    expect(greeting.length).toBeGreaterThan(0);
  });

  it('should work with arrays', () => {
    const arr = [1, 2, 3, 4, 5];
    expect(arr).toHaveLength(5);
    expect(arr).toContain(3);
  });

  it('should handle async operations', async () => {
    const asyncFunc = async () => {
      return new Promise((resolve) => {
        setTimeout(() => resolve('done'), 100);
      });
    };

    const result = await asyncFunc();
    expect(result).toBe('done');
  });
});

describe('URL Validation Example', () => {
  it('should validate http/https URLs', () => {
    const isValidUrl = (url: string): boolean => {
      try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    };

    // Valid URLs
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://test.org')).toBe(true);

    // Invalid URLs
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('file:///etc/passwd')).toBe(false);
  });
});

describe('Browser API Mocking Example', () => {
  it('should have chrome global available', () => {
    expect(globalThis.chrome).toBeDefined();
    expect(globalThis.chrome.runtime).toBeDefined();
  });

  it('should mock webextension-polyfill', async () => {
    // This demonstrates that our setup.ts mock is working
    const browser = await import('webextension-polyfill');

    expect(browser.default.runtime.id).toBe('test-extension-id');
    expect(browser.default.runtime.sendMessage).toBeDefined();
    expect(browser.default.windows.create).toBeDefined();
  });
});