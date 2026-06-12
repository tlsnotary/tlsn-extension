import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('pluginExecutionCounts', () => {
  beforeEach(async () => {
    const { IDBFactory } = await import('fake-indexeddb');
    vi.stubGlobal('indexedDB', new IDBFactory());
    vi.resetModules();
  });

  it('getPluginCount returns 0 for unknown hash', async () => {
    const { getPluginCount } = await import('../../src/util/pluginExecutionCounts.js');
    const count = await getPluginCount('nonexistent-hash');
    expect(count).toBe(0);
  });

  it('incrementPluginCount then getPluginCount returns 1', async () => {
    const { getPluginCount, incrementPluginCount } =
      await import('../../src/util/pluginExecutionCounts.js');
    await incrementPluginCount('test-hash');
    const count = await getPluginCount('test-hash');
    expect(count).toBe(1);
  });

  it('second incrementPluginCount returns 2', async () => {
    const { getPluginCount, incrementPluginCount } =
      await import('../../src/util/pluginExecutionCounts.js');
    await incrementPluginCount('test-hash');
    await incrementPluginCount('test-hash');
    const count = await getPluginCount('test-hash');
    expect(count).toBe(2);
  });

  it('different hashes are counted independently', async () => {
    const { getPluginCount, incrementPluginCount } =
      await import('../../src/util/pluginExecutionCounts.js');
    await incrementPluginCount('hash-a');
    await incrementPluginCount('hash-a');
    await incrementPluginCount('hash-b');
    expect(await getPluginCount('hash-a')).toBe(2);
    expect(await getPluginCount('hash-b')).toBe(1);
  });
});
