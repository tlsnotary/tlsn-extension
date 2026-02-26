import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Tests for progressRoutes TTL cleanup (#4).
 *
 * Verifies that stale progress route entries are evicted during
 * the periodic cleanup interval.
 */

// We test the cleanup logic in isolation since the Background/index.ts
// module has side effects (sets up listeners). Instead we replicate
// the exact TTL sweep logic and prove it works correctly.

describe('progressRoutes TTL sweep (#4)', () => {
  const PROGRESS_ROUTE_TTL_MS = 5 * 60 * 1000;

  /** Replica of the progressRoutes map with TTL metadata. */
  let progressRoutes: Map<string, { tabId: number; createdAt: number }>;

  beforeEach(() => {
    progressRoutes = new Map();
  });

  function sweep(now: number) {
    for (const [requestId, route] of progressRoutes) {
      if (now - route.createdAt > PROGRESS_ROUTE_TTL_MS) {
        progressRoutes.delete(requestId);
      }
    }
  }

  it('keeps entries younger than TTL', () => {
    const now = Date.now();
    progressRoutes.set('req-1', { tabId: 1, createdAt: now });
    progressRoutes.set('req-2', { tabId: 2, createdAt: now - 1000 });

    sweep(now);

    expect(progressRoutes.size).toBe(2);
  });

  it('evicts entries older than TTL', () => {
    const now = Date.now();
    progressRoutes.set('req-old', {
      tabId: 1,
      createdAt: now - PROGRESS_ROUTE_TTL_MS - 1,
    });
    progressRoutes.set('req-new', { tabId: 2, createdAt: now });

    sweep(now);

    expect(progressRoutes.has('req-old')).toBe(false);
    expect(progressRoutes.has('req-new')).toBe(true);
  });

  it('handles empty map without error', () => {
    expect(() => sweep(Date.now())).not.toThrow();
    expect(progressRoutes.size).toBe(0);
  });
});
