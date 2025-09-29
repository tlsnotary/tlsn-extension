/**
 * Type safety tests for WindowManager types
 *
 * These tests verify that the type definitions are correctly structured
 * and can be used as expected throughout the codebase.
 */

import { describe, it, expect } from 'vitest';
import type {
  WindowRegistration,
  InterceptedRequest,
  ManagedWindow,
  IWindowManager,
} from '../../src/types/window-manager';

describe('WindowManager Type Definitions', () => {
  describe('WindowRegistration', () => {
    it('should accept valid window registration config', () => {
      const config: WindowRegistration = {
        id: 123,
        tabId: 456,
        url: 'https://example.com',
        showOverlay: true,
      };

      expect(config.id).toBe(123);
      expect(config.tabId).toBe(456);
      expect(config.url).toBe('https://example.com');
      expect(config.showOverlay).toBe(true);
    });

    it('should allow showOverlay to be optional', () => {
      const config: WindowRegistration = {
        id: 123,
        tabId: 456,
        url: 'https://example.com',
      };

      expect(config.showOverlay).toBeUndefined();
    });

    it('should enforce required fields', () => {
      // @ts-expect-error - missing required fields
      const invalid: WindowRegistration = {
        id: 123,
      };

      expect(invalid).toBeDefined();
    });
  });

  describe('InterceptedRequest', () => {
    it('should accept valid intercepted request', () => {
      const request: InterceptedRequest = {
        id: 'req-123',
        method: 'GET',
        url: 'https://api.example.com/data',
        timestamp: Date.now(),
        tabId: 456,
      };

      expect(request.method).toBe('GET');
      expect(request.url).toContain('api.example.com');
      expect(request.timestamp).toBeGreaterThan(0);
    });

    it('should support different HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      methods.forEach((method) => {
        const request: InterceptedRequest = {
          id: `req-${method}`,
          method,
          url: 'https://example.com',
          timestamp: Date.now(),
          tabId: 456,
        };

        expect(request.method).toBe(method);
      });
    });
  });

  describe('ManagedWindow', () => {
    it('should accept valid managed window', () => {
      const window: ManagedWindow = {
        id: 123,
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        tabId: 456,
        url: 'https://example.com',
        createdAt: new Date(),
        requests: [],
        overlayVisible: false,
      };

      expect(window.id).toBe(123);
      expect(window.uuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(window.requests).toEqual([]);
      expect(window.overlayVisible).toBe(false);
    });

    it('should allow requests array to contain InterceptedRequests', () => {
      const window: ManagedWindow = {
        id: 123,
        uuid: '550e8400-e29b-41d4-a716-446655440000',
        tabId: 456,
        url: 'https://example.com',
        createdAt: new Date(),
        requests: [
          {
            id: 'req-1',
            method: 'GET',
            url: 'https://example.com/api',
            timestamp: Date.now(),
            tabId: 456,
          },
        ],
        overlayVisible: true,
      };

      expect(window.requests).toHaveLength(1);
      expect(window.requests[0].method).toBe('GET');
    });
  });

  describe('IWindowManager', () => {
    it('should define all required methods', () => {
      // This test verifies that the interface shape is correct
      // by creating a mock implementation
      const mockWindowManager: IWindowManager = {
        registerWindow: async (config: WindowRegistration) => ({
          id: config.id,
          uuid: 'test-uuid',
          tabId: config.tabId,
          url: config.url,
          createdAt: new Date(),
          requests: [],
          overlayVisible: false,
        }),
        closeWindow: async (windowId: number) => {},
        getWindow: (windowId: number) => undefined,
        getWindowByTabId: (tabId: number) => undefined,
        getAllWindows: () => new Map(),
        addRequest: (windowId: number, request: InterceptedRequest) => {},
        getWindowRequests: (windowId: number) => [],
        showOverlay: async (windowId: number) => {},
        hideOverlay: async (windowId: number) => {},
        isOverlayVisible: (windowId: number) => false,
        cleanupInvalidWindows: async () => {},
      };

      expect(mockWindowManager.registerWindow).toBeDefined();
      expect(mockWindowManager.closeWindow).toBeDefined();
      expect(mockWindowManager.getWindow).toBeDefined();
      expect(mockWindowManager.getWindowByTabId).toBeDefined();
      expect(mockWindowManager.getAllWindows).toBeDefined();
      expect(mockWindowManager.addRequest).toBeDefined();
      expect(mockWindowManager.getWindowRequests).toBeDefined();
      expect(mockWindowManager.showOverlay).toBeDefined();
      expect(mockWindowManager.hideOverlay).toBeDefined();
      expect(mockWindowManager.isOverlayVisible).toBeDefined();
      expect(mockWindowManager.cleanupInvalidWindows).toBeDefined();
    });

    it('should have correct method signatures', async () => {
      const mockWindowManager: IWindowManager = {
        registerWindow: async (config) => ({
          id: config.id,
          uuid: 'test-uuid',
          tabId: config.tabId,
          url: config.url,
          createdAt: new Date(),
          requests: [],
          overlayVisible: false,
        }),
        closeWindow: async (windowId) => {},
        getWindow: (windowId) => undefined,
        getWindowByTabId: (tabId) => undefined,
        getAllWindows: () => new Map(),
        addRequest: (windowId, request) => {},
        getWindowRequests: (windowId) => [],
        showOverlay: async (windowId) => {},
        hideOverlay: async (windowId) => {},
        isOverlayVisible: (windowId) => false,
        cleanupInvalidWindows: async () => {},
      };

      // Test registerWindow returns Promise<ManagedWindow>
      const result = await mockWindowManager.registerWindow({
        id: 123,
        tabId: 456,
        url: 'https://example.com',
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('uuid');
      expect(result).toHaveProperty('tabId');
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('requests');
      expect(result).toHaveProperty('overlayVisible');

      // Test getWindowRequests returns array
      const requests = mockWindowManager.getWindowRequests(123);
      expect(Array.isArray(requests)).toBe(true);

      // Test isOverlayVisible returns boolean
      const visible = mockWindowManager.isOverlayVisible(123);
      expect(typeof visible).toBe('boolean');
    });
  });

  describe('Type Integration', () => {
    it('should allow requests to be added to windows', () => {
      const window: ManagedWindow = {
        id: 123,
        uuid: 'test-uuid',
        tabId: 456,
        url: 'https://example.com',
        createdAt: new Date(),
        requests: [],
        overlayVisible: false,
      };

      const request: InterceptedRequest = {
        id: 'req-1',
        method: 'POST',
        url: 'https://example.com/api',
        timestamp: Date.now(),
        tabId: 456,
      };

      window.requests.push(request);

      expect(window.requests).toHaveLength(1);
      expect(window.requests[0]).toBe(request);
    });

    it('should support multiple requests in a window', () => {
      const window: ManagedWindow = {
        id: 123,
        uuid: 'test-uuid',
        tabId: 456,
        url: 'https://example.com',
        createdAt: new Date(),
        requests: [
          {
            id: 'req-1',
            method: 'GET',
            url: 'https://example.com/page',
            timestamp: Date.now(),
            tabId: 456,
          },
          {
            id: 'req-2',
            method: 'POST',
            url: 'https://example.com/api',
            timestamp: Date.now() + 1000,
            tabId: 456,
          },
        ],
        overlayVisible: true,
      };

      expect(window.requests).toHaveLength(2);
      expect(window.requests[0].method).toBe('GET');
      expect(window.requests[1].method).toBe('POST');
    });
  });
});
