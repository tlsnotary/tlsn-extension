/**
 * Tests for PermissionManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionManager } from '../../src/background/PermissionManager';
import type { RequestPermission } from '@tlsn/plugin-sdk/src/types';

// Mock webextension-polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    permissions: {
      request: vi.fn(),
      remove: vi.fn(),
      contains: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock('@tlsn/common', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import browser from 'webextension-polyfill';

describe('PermissionManager', () => {
  let manager: PermissionManager;

  beforeEach(() => {
    manager = new PermissionManager();
    vi.clearAllMocks();
  });

  describe('extractPermissionPatterns', () => {
    it('should extract origin pattern from host', () => {
      const requests: RequestPermission[] = [
        {
          method: 'GET',
          host: 'api.x.com',
          pathname: '/1.1/users/show.json',
          verifierUrl: 'https://verifier.example.com',
        },
      ];

      const patterns = manager.extractPermissionPatterns(requests);

      expect(patterns).toHaveLength(2);
      expect(patterns[0]).toEqual({
        origin: 'https://api.x.com/*',
        host: 'api.x.com',
        pathname: '/1.1/users/show.json',
      });
      expect(patterns[1]).toEqual({
        origin: 'https://verifier.example.com/*',
        host: 'verifier.example.com',
        pathname: '/*',
      });
    });

    it('should deduplicate origins', () => {
      const requests: RequestPermission[] = [
        {
          method: 'GET',
          host: 'api.x.com',
          pathname: '/1.1/users/show.json',
          verifierUrl: 'https://verifier.example.com',
        },
        {
          method: 'POST',
          host: 'api.x.com',
          pathname: '/1.1/statuses/update.json',
          verifierUrl: 'https://verifier.example.com',
        },
      ];

      const patterns = manager.extractPermissionPatterns(requests);

      // Should only have 2 unique origins (api.x.com + verifier.example.com)
      expect(patterns).toHaveLength(2);
    });

    it('should handle http verifier URL', () => {
      const requests: RequestPermission[] = [
        {
          method: 'GET',
          host: 'api.x.com',
          pathname: '/path',
          verifierUrl: 'http://localhost:7047',
        },
      ];

      const patterns = manager.extractPermissionPatterns(requests);

      expect(patterns).toHaveLength(2);
      expect(patterns[1].origin).toBe('http://localhost:7047/*');
    });

    it('should handle invalid verifier URL gracefully', () => {
      const requests: RequestPermission[] = [
        {
          method: 'GET',
          host: 'api.x.com',
          pathname: '/path',
          verifierUrl: 'not-a-valid-url',
        },
      ];

      const patterns = manager.extractPermissionPatterns(requests);

      // Should only have the host origin, skip invalid verifier
      expect(patterns).toHaveLength(1);
      expect(patterns[0].origin).toBe('https://api.x.com/*');
    });
  });

  describe('extractOrigins', () => {
    it('should return just origin strings', () => {
      const requests: RequestPermission[] = [
        {
          method: 'GET',
          host: 'api.x.com',
          pathname: '/path',
          verifierUrl: 'https://verifier.example.com',
        },
      ];

      const origins = manager.extractOrigins(requests);

      expect(origins).toEqual([
        'https://api.x.com/*',
        'https://verifier.example.com/*',
      ]);
    });
  });

  describe('formatForDisplay', () => {
    it('should combine host and pathname', () => {
      const requests: RequestPermission[] = [
        {
          method: 'GET',
          host: 'api.x.com',
          pathname: '/1.1/users/show.json',
          verifierUrl: 'https://verifier.example.com',
        },
        {
          method: 'POST',
          host: 'api.twitter.com',
          pathname: '/graphql/*',
          verifierUrl: 'https://verifier.example.com',
        },
      ];

      const display = manager.formatForDisplay(requests);

      expect(display).toEqual([
        'api.x.com/1.1/users/show.json',
        'api.twitter.com/graphql/*',
      ]);
    });
  });

  describe('requestPermissions', () => {
    it('should return true for empty origins', async () => {
      const granted = await manager.requestPermissions([]);
      expect(granted).toBe(true);
      expect(browser.permissions.request).not.toHaveBeenCalled();
    });

    it('should request permissions and return result', async () => {
      vi.mocked(browser.permissions.contains).mockResolvedValue(false);
      vi.mocked(browser.permissions.request).mockResolvedValue(true);

      const granted = await manager.requestPermissions(['https://api.x.com/*']);

      expect(granted).toBe(true);
      expect(browser.permissions.request).toHaveBeenCalledWith({
        origins: ['https://api.x.com/*'],
      });
    });

    it('should return true if permissions already granted', async () => {
      vi.mocked(browser.permissions.contains).mockResolvedValue(true);

      const granted = await manager.requestPermissions(['https://api.x.com/*']);

      expect(granted).toBe(true);
      expect(browser.permissions.request).not.toHaveBeenCalled();
    });

    it('should return false on denial', async () => {
      vi.mocked(browser.permissions.contains).mockResolvedValue(false);
      vi.mocked(browser.permissions.request).mockResolvedValue(false);

      const granted = await manager.requestPermissions(['https://api.x.com/*']);

      expect(granted).toBe(false);
    });

    it('should return false on error', async () => {
      vi.mocked(browser.permissions.contains).mockResolvedValue(false);
      vi.mocked(browser.permissions.request).mockRejectedValue(
        new Error('Permission error'),
      );

      const granted = await manager.requestPermissions(['https://api.x.com/*']);

      expect(granted).toBe(false);
    });

    it('should track permission usage', async () => {
      vi.mocked(browser.permissions.contains).mockResolvedValue(false);
      vi.mocked(browser.permissions.request).mockResolvedValue(true);

      await manager.requestPermissions(['https://api.x.com/*']);

      expect(manager.getActiveUsageCount('https://api.x.com/*')).toBe(1);
    });
  });

  describe('removePermissions', () => {
    it('should return true for empty origins', async () => {
      const removed = await manager.removePermissions([]);
      expect(removed).toBe(true);
      expect(browser.permissions.remove).not.toHaveBeenCalled();
    });

    it('should remove permissions when no longer in use', async () => {
      vi.mocked(browser.permissions.contains).mockResolvedValue(false);
      vi.mocked(browser.permissions.request).mockResolvedValue(true);
      vi.mocked(browser.permissions.remove).mockResolvedValue(true);

      // First request permissions
      await manager.requestPermissions(['https://api.x.com/*']);
      expect(manager.getActiveUsageCount('https://api.x.com/*')).toBe(1);

      // Then remove
      const removed = await manager.removePermissions(['https://api.x.com/*']);

      expect(removed).toBe(true);
      expect(browser.permissions.remove).toHaveBeenCalledWith({
        origins: ['https://api.x.com/*'],
      });
      expect(manager.getActiveUsageCount('https://api.x.com/*')).toBe(0);
    });

    it('should not remove permissions still in use by other executions', async () => {
      vi.mocked(browser.permissions.contains).mockResolvedValue(false);
      vi.mocked(browser.permissions.request).mockResolvedValue(true);
      vi.mocked(browser.permissions.remove).mockResolvedValue(true);

      // Request permissions twice (simulating two concurrent executions)
      await manager.requestPermissions(['https://api.x.com/*']);
      await manager.requestPermissions(['https://api.x.com/*']);
      expect(manager.getActiveUsageCount('https://api.x.com/*')).toBe(2);

      // Remove once
      await manager.removePermissions(['https://api.x.com/*']);

      // Should NOT call browser.permissions.remove because still in use
      expect(browser.permissions.remove).not.toHaveBeenCalled();
      expect(manager.getActiveUsageCount('https://api.x.com/*')).toBe(1);

      // Remove second time
      await manager.removePermissions(['https://api.x.com/*']);

      // Now it should call browser.permissions.remove
      expect(browser.permissions.remove).toHaveBeenCalledWith({
        origins: ['https://api.x.com/*'],
      });
      expect(manager.getActiveUsageCount('https://api.x.com/*')).toBe(0);
    });

    it('should return false on error', async () => {
      vi.mocked(browser.permissions.remove).mockRejectedValue(
        new Error('Remove error'),
      );

      const removed = await manager.removePermissions(['https://api.x.com/*']);

      expect(removed).toBe(false);
    });
  });

  describe('hasPermissions', () => {
    it('should return true for empty origins', async () => {
      const has = await manager.hasPermissions([]);
      expect(has).toBe(true);
    });

    it('should check permissions with browser API', async () => {
      vi.mocked(browser.permissions.contains).mockResolvedValue(true);

      const has = await manager.hasPermissions(['https://api.x.com/*']);

      expect(has).toBe(true);
      expect(browser.permissions.contains).toHaveBeenCalledWith({
        origins: ['https://api.x.com/*'],
      });
    });

    it('should return false on error', async () => {
      vi.mocked(browser.permissions.contains).mockRejectedValue(
        new Error('Check error'),
      );

      const has = await manager.hasPermissions(['https://api.x.com/*']);

      expect(has).toBe(false);
    });
  });
});
