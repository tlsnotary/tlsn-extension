/**
 * Tests for ConfirmationManager concurrency fix.
 *
 * Bug: The pendingConfirmations.size > 0 guard had an async gap between the
 * check (line 50) and the Map.set (line 114). Two concurrent
 * requestConfirmation() calls could both pass the guard since the Map wasn't
 * populated until after awaiting browser.windows.create().
 *
 * Fix: Claim the slot synchronously with a placeholder entry before any await.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import browser from 'webextension-polyfill';

// Must import after mocks are set up (via setup.ts)
const { ConfirmationManager } = await import('../../src/background/ConfirmationManager.js');

describe('ConfirmationManager', () => {
  let cm: InstanceType<typeof ConfirmationManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    // windows.remove is called in handleConfirmationResponse and must return a thenable
    vi.mocked(browser.windows.remove).mockResolvedValue(undefined as never);
    cm = new ConfirmationManager();
  });

  it('rejects second concurrent requestConfirmation while first is pending', async () => {
    // Mock windows.create to resolve (but the returned Promise from
    // requestConfirmation won't settle until handleConfirmationResponse)
    const mockedCreate = vi.mocked(browser.windows.create);
    mockedCreate.mockResolvedValue({ id: 100, tabs: [] } as browser.Windows.Window);

    // Start first confirmation (don't await — it won't settle yet)
    const first = cm.requestConfirmation(
      { name: 'Plugin A', description: 'desc' },
      'req-1',
      'https://example.com',
    );

    // Let microtasks settle so the first call completes its sync portion
    await new Promise((r) => setTimeout(r, 10));

    // Second confirmation should be immediately rejected
    await expect(
      cm.requestConfirmation(
        { name: 'Plugin B', description: 'desc' },
        'req-2',
        'https://example.com',
      ),
    ).rejects.toThrow('Another plugin confirmation is already in progress');

    // Clean up: resolve the first confirmation so it doesn't leak
    cm.handleConfirmationResponse('req-1', false);
    await first;
  });

  it('allows new confirmation after previous one completes', async () => {
    const mockedCreate = vi.mocked(browser.windows.create);
    mockedCreate.mockResolvedValue({ id: 200, tabs: [] } as browser.Windows.Window);

    // Start and complete first confirmation
    const first = cm.requestConfirmation(
      { name: 'Plugin A', description: 'desc' },
      'req-1',
      'https://example.com',
    );

    // Let the async window creation settle
    await new Promise((r) => setTimeout(r, 10));

    cm.handleConfirmationResponse('req-1', true);
    const result = await first;
    expect(result).toBe(true);

    // Second confirmation should now work
    const second = cm.requestConfirmation(
      { name: 'Plugin B', description: 'desc' },
      'req-2',
      'https://example.com',
    );

    await new Promise((r) => setTimeout(r, 10));

    cm.handleConfirmationResponse('req-2', true);
    const result2 = await second;
    expect(result2).toBe(true);
  });

  it('cleans up placeholder if window creation fails', async () => {
    const mockedCreate = vi.mocked(browser.windows.create);
    mockedCreate.mockRejectedValue(new Error('Browser not available'));

    await expect(
      cm.requestConfirmation(
        { name: 'Plugin A', description: 'desc' },
        'req-1',
        'https://example.com',
      ),
    ).rejects.toThrow('Browser not available');

    // Should not be blocked — placeholder was cleaned up
    expect(cm.hasPendingConfirmation()).toBe(false);
  });

  it('cleans up placeholder if window has no id', async () => {
    const mockedCreate = vi.mocked(browser.windows.create);
    mockedCreate.mockResolvedValue({} as browser.Windows.Window);

    await expect(
      cm.requestConfirmation(
        { name: 'Plugin A', description: 'desc' },
        'req-1',
        'https://example.com',
      ),
    ).rejects.toThrow('Failed to create confirmation popup window');

    expect(cm.hasPendingConfirmation()).toBe(false);
  });
});
