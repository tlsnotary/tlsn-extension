/**
 * WindowManager unit tests
 *
 * Tests all WindowManager functionality including window lifecycle,
 * request tracking, overlay management, and cleanup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WindowManager } from '../../src/background/WindowManager';
import type {
  WindowRegistration,
  InterceptedRequest,
} from '../../src/types/window-manager';
import browser from 'webextension-polyfill';

describe('WindowManager', () => {
  let windowManager: WindowManager;

  beforeEach(() => {
    windowManager = new WindowManager();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Window Registration', () => {
    it('should register a new window', async () => {
      const config: WindowRegistration = {
        id: 123,
        tabId: 456,
        url: 'https://example.com',
        showOverlay: false, // Don't trigger overlay in test
      };

      const window = await windowManager.registerWindow(config);

      expect(window.id).toBe(123);
      expect(window.tabId).toBe(456);
      expect(window.url).toBe('https://example.com');
      expect(window.uuid).toBeDefined();
      expect(window.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(window.createdAt).toBeInstanceOf(Date);
      expect(window.requests).toEqual([]);
      expect(window.overlayVisible).toBe(false);
    });

    it('should generate unique UUIDs for each window', async () => {
      const window1 = await windowManager.registerWindow({
        id: 1,
        tabId: 10,
        url: 'https://example1.com',
        showOverlay: false,
      });

      const window2 = await windowManager.registerWindow({
        id: 2,
        tabId: 20,
        url: 'https://example2.com',
        showOverlay: false,
      });

      expect(window1.uuid).not.toBe(window2.uuid);
    });

    it('should set showOverlayWhenReady by default when showOverlay not specified', async () => {
      const config: WindowRegistration = {
        id: 123,
        tabId: 456,
        url: 'https://example.com',
      };

      const window = await windowManager.registerWindow(config);

      expect(window.showOverlayWhenReady).toBe(true);
      expect(window.overlayVisible).toBe(false);
      // Overlay will be shown by tabs.onUpdated listener when tab becomes 'complete'
    });

    it('should not set showOverlayWhenReady when showOverlay is false', async () => {
      const config: WindowRegistration = {
        id: 123,
        tabId: 456,
        url: 'https://example.com',
        showOverlay: false,
      };

      const window = await windowManager.registerWindow(config);

      expect(window.showOverlayWhenReady).toBe(false);
      expect(window.overlayVisible).toBe(false);
    });
  });

  describe('Window Lookup', () => {
    beforeEach(async () => {
      await windowManager.registerWindow({
        id: 123,
        tabId: 456,
        url: 'https://example.com',
        showOverlay: false,
      });
    });

    it('should retrieve window by ID', () => {
      const window = windowManager.getWindow(123);

      expect(window).toBeDefined();
      expect(window!.id).toBe(123);
      expect(window!.tabId).toBe(456);
    });

    it('should return undefined for non-existent window ID', () => {
      const window = windowManager.getWindow(999);

      expect(window).toBeUndefined();
    });

    it('should retrieve window by tab ID', () => {
      const window = windowManager.getWindowByTabId(456);

      expect(window).toBeDefined();
      expect(window!.id).toBe(123);
      expect(window!.tabId).toBe(456);
    });

    it('should return undefined for non-existent tab ID', () => {
      const window = windowManager.getWindowByTabId(999);

      expect(window).toBeUndefined();
    });

    it('should retrieve all windows', async () => {
      await windowManager.registerWindow({
        id: 456,
        tabId: 789,
        url: 'https://example2.com',
        showOverlay: false,
      });

      const allWindows = windowManager.getAllWindows();

      expect(allWindows.size).toBe(2);
      expect(allWindows.has(123)).toBe(true);
      expect(allWindows.has(456)).toBe(true);
    });

    it('should return a copy of windows map', async () => {
      const windows1 = windowManager.getAllWindows();
      const windows2 = windowManager.getAllWindows();

      expect(windows1).not.toBe(windows2);
      expect(windows1.size).toBe(windows2.size);
    });
  });

  describe('Window Closing', () => {
    beforeEach(async () => {
      await windowManager.registerWindow({
        id: 123,
        tabId: 456,
        url: 'https://example.com',
        showOverlay: false,
      });
    });

    it('should close and remove window', async () => {
      await windowManager.closeWindow(123);

      const window = windowManager.getWindow(123);
      expect(window).toBeUndefined();
    });

    it('should hide overlay before closing if visible', async () => {
      await windowManager.showOverlay(123);
      vi.clearAllMocks();

      await windowManager.closeWindow(123);

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        456,
        expect.objectContaining({
          type: 'HIDE_TLSN_OVERLAY',
        }),
      );
    });

    it('should handle closing non-existent window gracefully', async () => {
      await expect(windowManager.closeWindow(999)).resolves.not.toThrow();
    });
  });

  describe('Request Tracking', () => {
    beforeEach(async () => {
      await windowManager.registerWindow({
        id: 123,
        tabId: 456,
        url: 'https://example.com',
        showOverlay: false,
      });
    });

    it('should add request to window', () => {
      const request: InterceptedRequest = {
        id: 'req-1',
        method: 'GET',
        url: 'https://example.com/api/data',
        timestamp: Date.now(),
        tabId: 456,
      };

      windowManager.addRequest(123, request);

      const requests = windowManager.getWindowRequests(123);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toEqual(request);
    });

    it('should add timestamp if not provided', () => {
      const request: InterceptedRequest = {
        id: 'req-1',
        method: 'GET',
        url: 'https://example.com/api/data',
        timestamp: 0, // Will be replaced
        tabId: 456,
      };

      const beforeTime = Date.now();
      windowManager.addRequest(123, request);
      const afterTime = Date.now();

      const requests = windowManager.getWindowRequests(123);
      expect(requests[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(requests[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should handle multiple requests in order', () => {
      const request1: InterceptedRequest = {
        id: 'req-1',
        method: 'GET',
        url: 'https://example.com/page1',
        timestamp: 1000,
        tabId: 456,
      };

      const request2: InterceptedRequest = {
        id: 'req-2',
        method: 'POST',
        url: 'https://example.com/api',
        timestamp: 2000,
        tabId: 456,
      };

      windowManager.addRequest(123, request1);
      windowManager.addRequest(123, request2);

      const requests = windowManager.getWindowRequests(123);
      expect(requests).toHaveLength(2);
      expect(requests[0].id).toBe('req-1');
      expect(requests[1].id).toBe('req-2');
    });

    it('should log error when adding request to non-existent window', () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {
          /* no-op mock */
        });

      const request: InterceptedRequest = {
        id: 'req-1',
        method: 'GET',
        url: 'https://example.com/api',
        timestamp: Date.now(),
        tabId: 999,
      };

      windowManager.addRequest(999, request);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cannot add request to non-existent window'),
      );

      consoleErrorSpy.mockRestore();
    });

    it('should return empty array for non-existent window requests', () => {
      const requests = windowManager.getWindowRequests(999);
      expect(requests).toEqual([]);
    });

    it('should update overlay when request added to visible overlay', async () => {
      await windowManager.showOverlay(123);
      vi.clearAllMocks();

      const request: InterceptedRequest = {
        id: 'req-1',
        method: 'GET',
        url: 'https://example.com/api',
        timestamp: Date.now(),
        tabId: 456,
      };

      windowManager.addRequest(123, request);

      // Give async updateOverlay time to execute
      await vi.runAllTimersAsync();

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        456,
        expect.objectContaining({
          type: 'UPDATE_TLSN_REQUESTS',
          requests: expect.arrayContaining([request]),
        }),
      );
    });
  });

  describe('Overlay Management', () => {
    beforeEach(async () => {
      await windowManager.registerWindow({
        id: 123,
        tabId: 456,
        url: 'https://example.com',
        showOverlay: false,
      });
    });

    it('should show overlay', async () => {
      await windowManager.showOverlay(123);

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        456,
        expect.objectContaining({
          type: 'SHOW_TLSN_OVERLAY',
          requests: [],
        }),
      );

      expect(windowManager.isOverlayVisible(123)).toBe(true);
    });

    it('should hide overlay', async () => {
      await windowManager.showOverlay(123);
      vi.clearAllMocks();

      await windowManager.hideOverlay(123);

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        456,
        expect.objectContaining({
          type: 'HIDE_TLSN_OVERLAY',
        }),
      );

      expect(windowManager.isOverlayVisible(123)).toBe(false);
    });

    it('should include requests when showing overlay', async () => {
      const request: InterceptedRequest = {
        id: 'req-1',
        method: 'GET',
        url: 'https://example.com/api',
        timestamp: Date.now(),
        tabId: 456,
      };

      windowManager.addRequest(123, request);
      await windowManager.showOverlay(123);

      expect(browser.tabs.sendMessage).toHaveBeenCalledWith(
        456,
        expect.objectContaining({
          type: 'SHOW_TLSN_OVERLAY',
          requests: expect.arrayContaining([request]),
        }),
      );
    });

    it('should return false for non-existent window overlay visibility', () => {
      expect(windowManager.isOverlayVisible(999)).toBe(false);
    });

    it('should handle overlay show error gracefully', async () => {
      // Mock sendMessage to fail for all retry attempts
      vi.mocked(browser.tabs.sendMessage).mockRejectedValue(
        new Error('Tab not found'),
      );

      // Start showOverlay (which will retry with delays)
      const showPromise = windowManager.showOverlay(123);

      // Advance timers through all retry delays (10 retries × 500ms = 5000ms)
      await vi.advanceTimersByTimeAsync(5500);

      await expect(showPromise).resolves.not.toThrow();
      expect(windowManager.isOverlayVisible(123)).toBe(false);
    });

    it('should handle overlay hide error gracefully', async () => {
      await windowManager.showOverlay(123);
      vi.mocked(browser.tabs.sendMessage).mockRejectedValueOnce(
        new Error('Tab not found'),
      );

      await expect(windowManager.hideOverlay(123)).resolves.not.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should remove invalid windows during cleanup', async () => {
      // Register multiple windows
      await windowManager.registerWindow({
        id: 123,
        tabId: 456,
        url: 'https://example1.com',
        showOverlay: false,
      });

      await windowManager.registerWindow({
        id: 456,
        tabId: 789,
        url: 'https://example2.com',
        showOverlay: false,
      });

      // Mock window 123 still exists, window 456 is closed
      vi.mocked(browser.windows.get).mockImplementation((windowId) => {
        if (windowId === 123) {
          return Promise.resolve({ id: 123 } as any);
        }
        return Promise.reject(new Error('Window not found'));
      });

      await windowManager.cleanupInvalidWindows();

      // Window 123 should still exist
      expect(windowManager.getWindow(123)).toBeDefined();

      // Window 456 should be cleaned up
      expect(windowManager.getWindow(456)).toBeUndefined();
    });

    it('should handle cleanup with no invalid windows', async () => {
      await windowManager.registerWindow({
        id: 123,
        tabId: 456,
        url: 'https://example.com',
        showOverlay: false,
      });

      vi.mocked(browser.windows.get).mockResolvedValue({ id: 123 } as any);

      await expect(
        windowManager.cleanupInvalidWindows(),
      ).resolves.not.toThrow();

      expect(windowManager.getWindow(123)).toBeDefined();
    });

    it('should handle cleanup with no windows', async () => {
      await expect(
        windowManager.cleanupInvalidWindows(),
      ).resolves.not.toThrow();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete window lifecycle', async () => {
      // Register window
      const window = await windowManager.registerWindow({
        id: 123,
        tabId: 456,
        url: 'https://example.com',
        showOverlay: false,
      });

      expect(window.uuid).toBeDefined();

      // Add requests
      windowManager.addRequest(123, {
        id: 'req-1',
        method: 'GET',
        url: 'https://example.com/page',
        timestamp: Date.now(),
        tabId: 456,
      });

      windowManager.addRequest(123, {
        id: 'req-2',
        method: 'POST',
        url: 'https://example.com/api',
        timestamp: Date.now(),
        tabId: 456,
      });

      expect(windowManager.getWindowRequests(123)).toHaveLength(2);

      // Show overlay
      await windowManager.showOverlay(123);
      expect(windowManager.isOverlayVisible(123)).toBe(true);

      // Close window
      await windowManager.closeWindow(123);
      expect(windowManager.getWindow(123)).toBeUndefined();
    });

    it('should handle multiple windows independently', async () => {
      // Register two windows
      await windowManager.registerWindow({
        id: 123,
        tabId: 456,
        url: 'https://example1.com',
        showOverlay: false,
      });

      await windowManager.registerWindow({
        id: 789,
        tabId: 1011,
        url: 'https://example2.com',
        showOverlay: false,
      });

      // Add requests to different windows
      windowManager.addRequest(123, {
        id: 'req-1',
        method: 'GET',
        url: 'https://example1.com/api',
        timestamp: Date.now(),
        tabId: 456,
      });

      windowManager.addRequest(789, {
        id: 'req-2',
        method: 'POST',
        url: 'https://example2.com/api',
        timestamp: Date.now(),
        tabId: 1011,
      });

      // Each window should have its own requests
      expect(windowManager.getWindowRequests(123)).toHaveLength(1);
      expect(windowManager.getWindowRequests(789)).toHaveLength(1);
      expect(windowManager.getWindowRequests(123)[0].id).toBe('req-1');
      expect(windowManager.getWindowRequests(789)[0].id).toBe('req-2');

      // Show overlay on one window
      await windowManager.showOverlay(123);
      expect(windowManager.isOverlayVisible(123)).toBe(true);
      expect(windowManager.isOverlayVisible(789)).toBe(false);
    });
  });
});
