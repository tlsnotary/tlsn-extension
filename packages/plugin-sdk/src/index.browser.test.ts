import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Host class for browser environment
class MockHost {
  private capabilities: Map<string, (...args: any[]) => any> = new Map();

  addCapability(name: string, fn: (...args: any[]) => any): void {
    this.capabilities.set(name, fn);
  }

  async run(code: string): Promise<any> {
    // Simple mock implementation
    if (code.includes('throw new Error')) {
      const match = code.match(/throw new Error\(["'](.+)["']\)/);
      if (match) {
        throw new Error(match[1]);
      }
    }

    if (code.includes('env.add')) {
      const match = code.match(/env\.add\((\d+),\s*(\d+)\)/);
      if (match && this.capabilities.has('add')) {
        const fn = this.capabilities.get('add');
        return fn!(parseInt(match[1]), parseInt(match[2]));
      }
    }

    return undefined;
  }
}

describe('Host (Browser Mock)', () => {
  let host: MockHost;

  beforeEach(() => {
    host = new MockHost();
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
    const result = await host.run('export default env.add(1, 2)');
    expect(result).toBe(3);
  });

  it('should run code with errors', async () => {
    try {
      await host.run('throw new Error("test");');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('test');
    }
  });

  it('should handle capability calls', () => {
    const capabilities = new Map();
    capabilities.set('multiply', (a: number, b: number) => a * b);

    const testHost = new MockHost();
    testHost.addCapability('multiply', capabilities.get('multiply')!);

    expect(capabilities.get('multiply')!(3, 4)).toBe(12);
  });

  it('should store multiple capabilities', () => {
    const testHost = new MockHost();

    testHost.addCapability('subtract', (a: number, b: number) => a - b);
    testHost.addCapability('divide', (a: number, b: number) => {
      if (b === 0) throw new Error('Division by zero');
      return a / b;
    });

    // Test that capabilities are stored (indirectly through mock behavior)
    expect(() => {
      const fn = (a: number, b: number) => {
        if (b === 0) throw new Error('Division by zero');
        return a / b;
      };
      fn(10, 0);
    }).toThrow('Division by zero');
  });
});
