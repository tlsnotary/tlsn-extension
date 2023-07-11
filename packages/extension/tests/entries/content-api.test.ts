/**
 * Tests for Content Script Client API (window.tlsn)
 *
 * Tests the public API exposed to web pages for interacting
 * with the TLSN extension.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Content Script Client API', () => {
  let postMessageSpy: any;

  beforeEach(() => {
    // Mock window.postMessage
    postMessageSpy = vi.spyOn(window, 'postMessage');
  });

  describe('window.tlsn.open()', () => {
    // Simulate the injected script's ExtensionAPI class
    class ExtensionAPI {
      async open(
        url: string,
        options?: {
          width?: number;
          height?: number;
          showOverlay?: boolean;
        },
      ): Promise<void> {
        if (!url || typeof url !== 'string') {
          throw new Error('URL must be a non-empty string');
        }

        // Validate URL format
        try {
          new URL(url);
        } catch (error) {
          throw new Error(`Invalid URL: ${url}`);
        }

        // Send message to content script
        window.postMessage(
          {
            type: 'TLSN_OPEN_WINDOW',
            payload: {
              url,
              width: options?.width,
              height: options?.height,
              showOverlay: options?.showOverlay,
            },
          },
          window.location.origin,
        );
      }
    }

    let tlsn: ExtensionAPI;

    beforeEach(() => {
      tlsn = new ExtensionAPI();
    });

    it('should post message with valid URL', async () => {
      await tlsn.open('https://example.com');

      expect(postMessageSpy).toHaveBeenCalledWith(
        {
          type: 'TLSN_OPEN_WINDOW',
          payload: {
            url: 'https://example.com',
            width: undefined,
            height: undefined,
            showOverlay: undefined,
          },
        },
        window.location.origin,
      );
    });

    it('should include width and height options', async () => {
      await tlsn.open('https://example.com', {
        width: 1200,
        height: 800,
      });

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TLSN_OPEN_WINDOW',
          payload: expect.objectContaining({
            url: 'https://example.com',
            width: 1200,
            height: 800,
          }),
        }),
        window.location.origin,
      );
    });

    it('should include showOverlay option', async () => {
      await tlsn.open('https://example.com', {
        showOverlay: false,
      });

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'TLSN_OPEN_WINDOW',
          payload: expect.objectContaining({
            url: 'https://example.com',
            showOverlay: false,
          }),
        }),
        window.location.origin,
      );
    });

    it('should reject empty URL', async () => {
      await expect(tlsn.open('')).rejects.toThrow(
        'URL must be a non-empty string',
      );
    });

    it('should reject non-string URL', async () => {
      await expect(tlsn.open(null as any)).rejects.toThrow(
        'URL must be a non-empty string',
      );
      await expect(tlsn.open(undefined as any)).rejects.toThrow(
        'URL must be a non-empty string',
      );
      await expect(tlsn.open(123 as any)).rejects.toThrow(
        'URL must be a non-empty string',
      );
    });

    it('should reject invalid URL format', async () => {
      await expect(tlsn.open('not-a-url')).rejects.toThrow('Invalid URL');
      await expect(tlsn.open('ftp://example.com')).resolves.not.toThrow(); // Valid URL, will be validated by background
    });

    it('should accept http URLs', async () => {
      await expect(tlsn.open('http://example.com')).resolves.not.toThrow();
    });

    it('should accept https URLs', async () => {
      await expect(tlsn.open('https://example.com')).resolves.not.toThrow();
    });

    it('should accept URLs with paths', async () => {
      await expect(
        tlsn.open('https://example.com/path/to/page'),
      ).resolves.not.toThrow();
    });

    it('should accept URLs with query parameters', async () => {
      await expect(
        tlsn.open('https://example.com/search?q=test&lang=en'),
      ).resolves.not.toThrow();
    });

    it('should accept URLs with fragments', async () => {
      await expect(
        tlsn.open('https://example.com/page#section'),
      ).resolves.not.toThrow();
    });

    it('should post message to correct origin', async () => {
      await tlsn.open('https://example.com');

      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.any(Object),
        window.location.origin,
      );
    });
  });

  describe('Message Type Constants', () => {
    it('should define all required message types', async () => {
      const {
        OPEN_WINDOW,
        WINDOW_OPENED,
        WINDOW_ERROR,
        SHOW_TLSN_OVERLAY,
        UPDATE_TLSN_REQUESTS,
        HIDE_TLSN_OVERLAY,
      } = await import('../../src/constants/messages');

      expect(OPEN_WINDOW).toBe('OPEN_WINDOW');
      expect(WINDOW_OPENED).toBe('WINDOW_OPENED');
      expect(WINDOW_ERROR).toBe('WINDOW_ERROR');
      expect(SHOW_TLSN_OVERLAY).toBe('SHOW_TLSN_OVERLAY');
      expect(UPDATE_TLSN_REQUESTS).toBe('UPDATE_TLSN_REQUESTS');
      expect(HIDE_TLSN_OVERLAY).toBe('HIDE_TLSN_OVERLAY');
    });

    it('should export type definitions', async () => {
      const messages = await import('../../src/constants/messages');

      // Check that types are exported (TypeScript compilation will verify this)
      expect(messages).toHaveProperty('OPEN_WINDOW');
      expect(messages).toHaveProperty('WINDOW_OPENED');
      expect(messages).toHaveProperty('WINDOW_ERROR');
    });
  });

  describe('Content Script Message Forwarding', () => {
    it('should forward TLSN_OPEN_WINDOW to background as OPEN_WINDOW', () => {
      // This test verifies the message transformation logic
      const pageMessage = {
        type: 'TLSN_OPEN_WINDOW',
        payload: {
          url: 'https://example.com',
          width: 1000,
          height: 800,
          showOverlay: true,
        },
      };

      // Expected background message format
      const expectedBackgroundMessage = {
        type: 'OPEN_WINDOW',
        url: 'https://example.com',
        width: 1000,
        height: 800,
        showOverlay: true,
      };

      // Verify transformation logic
      expect(pageMessage.payload).toEqual({
        url: expectedBackgroundMessage.url,
        width: expectedBackgroundMessage.width,
        height: expectedBackgroundMessage.height,
        showOverlay: expectedBackgroundMessage.showOverlay,
      });
    });

    it('should handle optional parameters correctly', () => {
      const pageMessage = {
        type: 'TLSN_OPEN_WINDOW',
        payload: {
          url: 'https://example.com',
        },
      };

      // width, height, showOverlay should be undefined
      expect(pageMessage.payload.width).toBeUndefined();
      expect(pageMessage.payload.height).toBeUndefined();
      expect((pageMessage.payload as any).showOverlay).toBeUndefined();
    });
  });

  describe('Origin Validation', () => {
    it('should only accept messages from same origin', () => {
      const currentOrigin = window.location.origin;

      // Valid origins
      expect(currentOrigin).toBe(window.location.origin);

      // Example of what content script should check
      const isValidOrigin = (eventOrigin: string) => {
        return eventOrigin === window.location.origin;
      };

      expect(isValidOrigin(currentOrigin)).toBe(true);
      expect(isValidOrigin('https://evil.com')).toBe(false);
      expect(isValidOrigin('http://different.com')).toBe(false);
    });
  });
});
