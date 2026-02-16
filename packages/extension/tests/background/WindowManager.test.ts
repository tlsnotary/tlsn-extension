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
  InterceptedRequestHeader,
} from '../../src/types/window-manager';
import {
  REQUEST_BATCH_INTERVAL_MS,
  REQUEST_BATCH_MAX_SIZE,
} from '../../src/constants/limits';
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
        expect.any(String), // timestamp like "[10:21:39] [ERROR]"
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

  describe('Request/Header Batching', () => {
    const makeRequest = (id: string): InterceptedRequest => ({
      id,
      method: 'GET',
      url: `https://example.com/api/${id}`,
      timestamp: Date.now(),
      tabId: 456,
    });

    const makeHeader = (id: string): InterceptedRequestHeader => ({
      id,
      method: 'GET',
      url: `https://example.com/api/${id}`,
      timestamp: Date.now(),
      type: 'xmlhttprequest',
      requestHeaders: [{ name: 'Authorization', value: 'Bearer token' }],
      tabId: 456,
    });

    beforeEach(async () => {
      await windowManager.registerWindow({
        id: 123,
        tabId: 456,
        url: 'https://example.com',
        showOverlay: false,
      });
      vi.clearAllMocks();
    });

    it('should send first request immediately (leading edge)', () => {
      const req = makeRequest('req-1');

      windowManager.addRequest(123, req);

      expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith({
        type: 'REQUEST_INTERCEPTED',
        request: req,
        windowId: 123,
      });
    });

    it('should buffer second request and flush after timer', async () => {
      const req1 = makeRequest('req-1');
      const req2 = makeRequest('req-2');

      windowManager.addRequest(123, req1);
      windowManager.addRequest(123, req2);

      // Only the leading-edge call should have fired so far
      const sendMessage = vi.mocked(browser.runtime.sendMessage);
      const callsAfterBoth = sendMessage.mock.calls.filter(
        (call) =>
          (call[0] as any).type === 'REQUEST_INTERCEPTED' ||
          (call[0] as any).type === 'REQUESTS_BATCH',
      );

      expect(callsAfterBoth).toHaveLength(1);
      expect((callsAfterBoth[0][0] as any).request.id).toBe('req-1');

      // Advance timer to flush the batch
      await vi.advanceTimersByTimeAsync(REQUEST_BATCH_INTERVAL_MS);

      // Single buffered item uses REQUEST_INTERCEPTED (backward compat)
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'REQUEST_INTERCEPTED',
        request: req2,
        windowId: 123,
      });
    });

    it('should send multiple buffered requests as a batch', async () => {
      const req1 = makeRequest('req-1');
      const req2 = makeRequest('req-2');
      const req3 = makeRequest('req-3');

      windowManager.addRequest(123, req1);
      windowManager.addRequest(123, req2);
      windowManager.addRequest(123, req3);

      await vi.advanceTimersByTimeAsync(REQUEST_BATCH_INTERVAL_MS);

      expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith({
        type: 'REQUESTS_BATCH',
        requests: [req2, req3],
        windowId: 123,
      });
    });

    it('should flush immediately when batch reaches max size', () => {
      // Leading edge
      windowManager.addRequest(123, makeRequest('leading'));

      const sendMessage = vi.mocked(browser.runtime.sendMessage);

      sendMessage.mockClear();

      // Fill up to REQUEST_BATCH_MAX_SIZE
      const batchedRequests: InterceptedRequest[] = [];

      for (let i = 0; i < REQUEST_BATCH_MAX_SIZE; i++) {
        const req = makeRequest(`batch-${i}`);

        batchedRequests.push(req);
        windowManager.addRequest(123, req);
      }

      // Should have flushed immediately without waiting for timer
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'REQUESTS_BATCH',
        requests: batchedRequests,
        windowId: 123,
      });
    });

    it('should send first header immediately (leading edge)', () => {
      const hdr = makeHeader('hdr-1');

      windowManager.addHeader(123, hdr);

      expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith({
        type: 'HEADER_INTERCEPTED',
        header: hdr,
        windowId: 123,
      });
    });

    it('should buffer second header and flush after timer', async () => {
      const hdr1 = makeHeader('hdr-1');
      const hdr2 = makeHeader('hdr-2');

      windowManager.addHeader(123, hdr1);
      windowManager.addHeader(123, hdr2);

      const sendMessage = vi.mocked(browser.runtime.sendMessage);
      const callsAfterBoth = sendMessage.mock.calls.filter(
        (call) =>
          (call[0] as any).type === 'HEADER_INTERCEPTED' ||
          (call[0] as any).type === 'HEADERS_BATCH',
      );

      expect(callsAfterBoth).toHaveLength(1);
      expect((callsAfterBoth[0][0] as any).header.id).toBe('hdr-1');

      await vi.advanceTimersByTimeAsync(REQUEST_BATCH_INTERVAL_MS);

      expect(sendMessage).toHaveBeenCalledWith({
        type: 'HEADER_INTERCEPTED',
        header: hdr2,
        windowId: 123,
      });
    });

    it('should send multiple buffered headers as a batch', async () => {
      const hdr1 = makeHeader('hdr-1');
      const hdr2 = makeHeader('hdr-2');
      const hdr3 = makeHeader('hdr-3');

      windowManager.addHeader(123, hdr1);
      windowManager.addHeader(123, hdr2);
      windowManager.addHeader(123, hdr3);

      await vi.advanceTimersByTimeAsync(REQUEST_BATCH_INTERVAL_MS);

      expect(vi.mocked(browser.runtime.sendMessage)).toHaveBeenCalledWith({
        type: 'HEADERS_BATCH',
        headers: [hdr2, hdr3],
        windowId: 123,
      });
    });

    it('should flush headers immediately when batch reaches max size', () => {
      windowManager.addHeader(123, makeHeader('leading'));

      const sendMessage = vi.mocked(browser.runtime.sendMessage);

      sendMessage.mockClear();

      const batchedHeaders: InterceptedRequestHeader[] = [];

      for (let i = 0; i < REQUEST_BATCH_MAX_SIZE; i++) {
        const hdr = makeHeader(`batch-${i}`);

        batchedHeaders.push(hdr);
        windowManager.addHeader(123, hdr);
      }

      expect(sendMessage).toHaveBeenCalledWith({
        type: 'HEADERS_BATCH',
        headers: batchedHeaders,
        windowId: 123,
      });
    });

    it('should clear batch state when window is closed', async () => {
      windowManager.addRequest(123, makeRequest('req-1'));
      windowManager.addRequest(123, makeRequest('req-2'));

      const sendMessage = vi.mocked(browser.runtime.sendMessage);

      sendMessage.mockClear();

      await windowManager.closeWindow(123);

      // Advance past the batch interval
      await vi.advanceTimersByTimeAsync(REQUEST_BATCH_INTERVAL_MS * 2);

      // No REQUEST_INTERCEPTED or REQUESTS_BATCH messages should fire
      const batchCalls = sendMessage.mock.calls.filter(
        (call) =>
          (call[0] as any).type === 'REQUEST_INTERCEPTED' ||
          (call[0] as any).type === 'REQUESTS_BATCH',
      );

      expect(batchCalls).toHaveLength(0);
    });

    it('should clear batch state when cleanupInvalidWindows removes a window', async () => {
      windowManager.addRequest(123, makeRequest('req-1'));
      windowManager.addRequest(123, makeRequest('req-2'));

      const sendMessage = vi.mocked(browser.runtime.sendMessage);

      sendMessage.mockClear();

      // Mock window as no longer existing
      vi.mocked(browser.windows.get).mockRejectedValue(
        new Error('Window not found'),
      );

      await windowManager.cleanupInvalidWindows();

      await vi.advanceTimersByTimeAsync(REQUEST_BATCH_INTERVAL_MS * 2);

      const batchCalls = sendMessage.mock.calls.filter(
        (call) =>
          (call[0] as any).type === 'REQUEST_INTERCEPTED' ||
          (call[0] as any).type === 'REQUESTS_BATCH',
      );

      expect(batchCalls).toHaveLength(0);
    });

    it('should batch requests independently per window', async () => {
      await windowManager.registerWindow({
        id: 789,
        tabId: 1011,
        url: 'https://example2.com',
        showOverlay: false,
      });

      vi.clearAllMocks();

      const reqA1 = makeRequest('a-1');
      const reqA2 = makeRequest('a-2');
      const reqB1: InterceptedRequest = {
        ...makeRequest('b-1'),
        tabId: 1011,
      };
      const reqB2: InterceptedRequest = {
        ...makeRequest('b-2'),
        tabId: 1011,
      };

      // First request on each window is leading edge
      windowManager.addRequest(123, reqA1);
      windowManager.addRequest(789, reqB1);

      const sendMessage = vi.mocked(browser.runtime.sendMessage);

      expect(sendMessage).toHaveBeenCalledWith({
        type: 'REQUEST_INTERCEPTED',
        request: reqA1,
        windowId: 123,
      });

      expect(sendMessage).toHaveBeenCalledWith({
        type: 'REQUEST_INTERCEPTED',
        request: reqB1,
        windowId: 789,
      });

      sendMessage.mockClear();

      // Second request on each window is buffered
      windowManager.addRequest(123, reqA2);
      windowManager.addRequest(789, reqB2);

      await vi.advanceTimersByTimeAsync(REQUEST_BATCH_INTERVAL_MS);

      expect(sendMessage).toHaveBeenCalledWith({
        type: 'REQUEST_INTERCEPTED',
        request: reqA2,
        windowId: 123,
      });

      expect(sendMessage).toHaveBeenCalledWith({
        type: 'REQUEST_INTERCEPTED',
        request: reqB2,
        windowId: 789,
      });
    });
  });
});
