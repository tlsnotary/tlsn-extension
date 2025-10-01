import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Host } from './index';

describe('Host', () => {
  let host: Host;

  beforeEach(() => {
    host = new Host();
    host.addCapability('add', (a: number, b: number) => {
      if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error('Invalid arguments');
      }
      return a + b;
    });
    // Clear console mocks before each test
    vi.clearAllMocks();
  });

  it('should run code', async () => {
    const result = await host.run('add(1, 2)');
    expect(result).toBe(3);
  });

  it('should run code with errors', async () => {
    try {
      await host.run('throw new Error("test");')
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('test');
    }
  });

  it('should run code with invalid arguments', async () => {
    try { 
      await host.run('add("1", 2)');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Invalid arguments');
    }
  });
});
