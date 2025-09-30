/**
 * Tests for URL validation utilities
 *
 * Ensures robust URL validation for security and reliability.
 */

import { describe, it, expect } from 'vitest';
import {
  validateUrl,
  sanitizeUrl,
  isHttpUrl,
  getUrlErrorMessage,
} from '../../src/utils/url-validator';

describe('URL Validator', () => {
  describe('validateUrl', () => {
    describe('Valid URLs', () => {
      it('should accept valid HTTP URL', () => {
        const result = validateUrl('http://example.com');

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.url).toBeDefined();
        expect(result.url?.protocol).toBe('http:');
      });

      it('should accept valid HTTPS URL', () => {
        const result = validateUrl('https://example.com');

        expect(result.valid).toBe(true);
        expect(result.url?.protocol).toBe('https:');
      });

      it('should accept URL with path', () => {
        const result = validateUrl('https://example.com/path/to/page');

        expect(result.valid).toBe(true);
        expect(result.url?.pathname).toBe('/path/to/page');
      });

      it('should accept URL with query parameters', () => {
        const result = validateUrl('https://example.com/search?q=test&lang=en');

        expect(result.valid).toBe(true);
        expect(result.url?.search).toBe('?q=test&lang=en');
      });

      it('should accept URL with fragment', () => {
        const result = validateUrl('https://example.com/page#section');

        expect(result.valid).toBe(true);
        expect(result.url?.hash).toBe('#section');
      });

      it('should accept URL with port', () => {
        const result = validateUrl('https://example.com:8080/path');

        expect(result.valid).toBe(true);
        expect(result.url?.port).toBe('8080');
      });

      it('should accept URL with subdomain', () => {
        const result = validateUrl('https://api.example.com');

        expect(result.valid).toBe(true);
        expect(result.url?.hostname).toBe('api.example.com');
      });
    });

    describe('Invalid URLs - Empty/Null', () => {
      it('should reject empty string', () => {
        const result = validateUrl('');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('non-empty string');
      });

      it('should reject whitespace only', () => {
        const result = validateUrl('   ');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('whitespace');
      });

      it('should reject null', () => {
        const result = validateUrl(null);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('non-empty string');
      });

      it('should reject undefined', () => {
        const result = validateUrl(undefined);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('non-empty string');
      });

      it('should reject number', () => {
        const result = validateUrl(123);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('non-empty string');
      });

      it('should reject object', () => {
        const result = validateUrl({ url: 'https://example.com' });

        expect(result.valid).toBe(false);
        expect(result.error).toContain('non-empty string');
      });
    });

    describe('Invalid URLs - Malformed', () => {
      it('should reject invalid URL format', () => {
        const result = validateUrl('not-a-url');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid URL format');
      });

      it('should reject URL without protocol', () => {
        const result = validateUrl('example.com');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid URL format');
      });

      it('should reject URL without hostname', () => {
        const result = validateUrl('https://');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid URL format');
      });
    });

    describe('Invalid URLs - Dangerous Protocols', () => {
      it('should reject javascript: protocol', () => {
        const result = validateUrl('javascript:alert(1)');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Dangerous protocol');
        expect(result.error).toContain('javascript:');
      });

      it('should reject data: protocol', () => {
        const result = validateUrl('data:text/html,<h1>Test</h1>');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Dangerous protocol');
        expect(result.error).toContain('data:');
      });

      it('should reject file: protocol', () => {
        const result = validateUrl('file:///etc/passwd');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Dangerous protocol');
        expect(result.error).toContain('file:');
      });

      it('should reject blob: protocol', () => {
        const result = validateUrl('blob:https://example.com/uuid');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Dangerous protocol');
        expect(result.error).toContain('blob:');
      });

      it('should reject about: protocol', () => {
        const result = validateUrl('about:blank');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Dangerous protocol');
        expect(result.error).toContain('about:');
      });
    });

    describe('Invalid URLs - Invalid Protocols', () => {
      it('should reject FTP protocol', () => {
        const result = validateUrl('ftp://example.com');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid protocol');
        expect(result.error).toContain('ftp:');
      });

      it('should reject ws: protocol', () => {
        const result = validateUrl('ws://example.com');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid protocol');
      });

      it('should reject custom protocol', () => {
        const result = validateUrl('custom://example.com');

        expect(result.valid).toBe(false);
        expect(result.error).toContain('Invalid protocol');
      });
    });
  });

  describe('sanitizeUrl', () => {
    it('should sanitize valid URL', () => {
      const sanitized = sanitizeUrl('  https://example.com  ');

      expect(sanitized).toBe('https://example.com/');
    });

    it('should preserve query parameters', () => {
      const sanitized = sanitizeUrl('https://example.com/search?q=test');

      expect(sanitized).toContain('?q=test');
    });

    it('should preserve fragments', () => {
      const sanitized = sanitizeUrl('https://example.com#section');

      expect(sanitized).toContain('#section');
    });

    it('should return null for invalid URL', () => {
      const sanitized = sanitizeUrl('not-a-url');

      expect(sanitized).toBeNull();
    });

    it('should return null for dangerous protocol', () => {
      const sanitized = sanitizeUrl('javascript:alert(1)');

      expect(sanitized).toBeNull();
    });
  });

  describe('isHttpUrl', () => {
    it('should return true for HTTP URL', () => {
      expect(isHttpUrl('http://example.com')).toBe(true);
    });

    it('should return true for HTTPS URL', () => {
      expect(isHttpUrl('https://example.com')).toBe(true);
    });

    it('should return false for FTP URL', () => {
      expect(isHttpUrl('ftp://example.com')).toBe(false);
    });

    it('should return false for javascript: URL', () => {
      expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    });

    it('should return false for invalid URL', () => {
      expect(isHttpUrl('not-a-url')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isHttpUrl('')).toBe(false);
    });
  });

  describe('getUrlErrorMessage', () => {
    it('should return valid message for valid URL', () => {
      const message = getUrlErrorMessage('https://example.com');

      expect(message).toBe('URL is valid');
    });

    it('should return error message for invalid URL', () => {
      const message = getUrlErrorMessage('javascript:alert(1)');

      expect(message).toContain('Dangerous protocol');
    });

    it('should return error message for malformed URL', () => {
      const message = getUrlErrorMessage('not-a-url');

      expect(message).toContain('Invalid URL format');
    });

    it('should return error message for empty URL', () => {
      const message = getUrlErrorMessage('');

      expect(message).toContain('non-empty string');
    });
  });

  describe('Edge Cases', () => {
    it('should handle URL with Unicode characters', () => {
      const result = validateUrl('https://例え.com');

      expect(result.valid).toBe(true);
    });

    it('should handle URL with encoded characters', () => {
      const result = validateUrl('https://example.com/path%20with%20spaces');

      expect(result.valid).toBe(true);
    });

    it('should handle localhost', () => {
      const result = validateUrl('http://localhost:3000');

      expect(result.valid).toBe(true);
    });

    it('should handle IP address', () => {
      const result = validateUrl('http://192.168.1.1');

      expect(result.valid).toBe(true);
    });

    it('should handle IPv6 address', () => {
      const result = validateUrl('http://[::1]:8080');

      expect(result.valid).toBe(true);
    });

    it('should trim whitespace from URL', () => {
      const result = validateUrl('  https://example.com  ');

      expect(result.valid).toBe(true);
      expect(result.url?.href).toBe('https://example.com/');
    });
  });
});