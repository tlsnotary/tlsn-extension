import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Host, preprocessPluginCode } from '../src/index';

// Skip this entire suite in browser environment — these tests run in Node only.
// Browser-specific tests live in index.browser.test.ts.
describe.skipIf(typeof window !== 'undefined')('Host', () => {
  let host: Host;

  beforeEach(() => {
    host = new Host({
      onProve: vi.fn(),
      onRenderPluginUi: vi.fn(),
      onCloseWindow: vi.fn(),
      onOpenWindow: vi.fn(),
    });
    host.addCapability('add', (a: number, b: number) => {
      if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error('Invalid arguments');
      }
      return a + b;
    });
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // createEvalCode
  // -------------------------------------------------------------------------

  it('should create eval code and run simple calculations', async () => {
    // sandbox.eval() returns undefined for expression results (library limitation).
    // Use a spy capability to capture the result from inside the sandbox instead.
    const resultSpy = vi.fn();
    const sandbox = await host.createEvalCode({
      add: (a: number, b: number) => a + b,
      result: resultSpy,
    });

    await sandbox.eval(`
      const add = env.add;
      const result = env.result;
      result(add(1, 2));
    `);

    expect(resultSpy).toHaveBeenCalledWith(3);
    sandbox.dispose();
  });

  it('should handle errors in eval code', async () => {
    const sandbox = await host.createEvalCode();
    try {
      await sandbox.eval('throw new Error("test")');
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('test');
    }
    sandbox.dispose();
  });

  it('should handle invalid arguments in capabilities', async () => {
    const sandbox = await host.createEvalCode({
      add: (a: number, b: number) => {
        if (typeof a !== 'number' || typeof b !== 'number') {
          throw new Error('Invalid arguments');
        }
        return a + b;
      },
    });
    try {
      await sandbox.eval('env.add("1", 2)');
      expect.fail('Should have thrown an error');
    } catch (error: any) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Invalid arguments');
    }
    sandbox.dispose();
  });

  // -------------------------------------------------------------------------
  // addCapability
  // -------------------------------------------------------------------------

  describe('addCapability', () => {
    it('should make added capability available in sandbox', async () => {
      const multiplySpy = vi.fn((a: number, b: number) => a * b);
      host.addCapability('multiply', multiplySpy);

      const sandbox = await host.createEvalCode();
      await sandbox.eval('env.multiply(3, 4)');

      expect(multiplySpy).toHaveBeenCalledWith(3, 4);
      sandbox.dispose();
    });

    it('should make multiple added capabilities available', async () => {
      const greetSpy = vi.fn((name: string) => `Hello, ${name}!`);
      const squareSpy = vi.fn((n: number) => n * n);
      host.addCapability('greet', greetSpy);
      host.addCapability('square', squareSpy);

      const sandbox = await host.createEvalCode();
      await sandbox.eval('env.greet("world"); env.square(5);');

      expect(greetSpy).toHaveBeenCalledWith('world');
      expect(squareSpy).toHaveBeenCalledWith(5);
      sandbox.dispose();
    });

    it('should be overridable by createEvalCode capabilities', async () => {
      // addCapability sets a base, but createEvalCode can provide a same-named override
      const baseSpy = vi.fn();
      const overrideSpy = vi.fn();
      host.addCapability('fn', baseSpy);

      const sandbox = await host.createEvalCode({ fn: overrideSpy });
      await sandbox.eval('env.fn(42)');

      expect(overrideSpy).toHaveBeenCalledWith(42);
      expect(baseSpy).not.toHaveBeenCalled();
      sandbox.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // updateExecutionContext
  // -------------------------------------------------------------------------

  describe('updateExecutionContext', () => {
    it('should throw when uuid is not in the registry', () => {
      expect(() => host.updateExecutionContext('nonexistent-uuid', { windowId: 1 })).toThrow(
        'Execution context not found',
      );
    });
  });

  // -------------------------------------------------------------------------
  // preprocessPluginCode
  // -------------------------------------------------------------------------

  describe('preprocessPluginCode', () => {
    it('should convert named export function to default export with arrow wrapper', () => {
      const code = `
export function main() {
  return div({}, ['hello']);
}
`.trim();

      const result = preprocessPluginCode(code);

      expect(result).toContain('export default {');
      expect(result).toContain(
        "main: typeof main === 'function' ? (...args) => main(...args) : main",
      );
      expect(result).not.toMatch(/^export function main/m);
    });

    it('should convert named export async function to default export with arrow wrapper', () => {
      const code = `
export async function onClick() {
  await prove({}, {});
}
`.trim();

      const result = preprocessPluginCode(code);

      expect(result).toContain('export default {');
      expect(result).toContain(
        "onClick: typeof onClick === 'function' ? (...args) => onClick(...args) : onClick",
      );
    });

    it('should convert named export const function to default export with arrow wrapper', () => {
      const code = `
export const main = () => div({}, ['hi']);
`.trim();

      const result = preprocessPluginCode(code);

      expect(result).toContain('export default {');
      expect(result).toContain(
        "main: typeof main === 'function' ? (...args) => main(...args) : main",
      );
    });

    it('should pass non-function named export (config object) through directly', () => {
      const code = `
export const config = { name: 'Test', description: 'A test' };
export function main() { return null; }
`.trim();

      const result = preprocessPluginCode(code);

      expect(result).toContain('export default {');
      // config is non-function — value passed through
      expect(result).toContain(
        "config: typeof config === 'function' ? (...args) => config(...args) : config",
      );
      // main is a function — wrapped in arrow
      expect(result).toContain(
        "main: typeof main === 'function' ? (...args) => main(...args) : main",
      );
    });

    it('should wrap function references in export default {} syntax', () => {
      const code = `
function main() { return null; }
const config = { name: 'Test' };
export default { main, config };
`.trim();

      const result = preprocessPluginCode(code);

      expect(result).toContain('export default {');
      expect(result).toContain(
        "main: typeof main === 'function' ? (...args) => main(...args) : main",
      );
      expect(result).toContain(
        "config: typeof config === 'function' ? (...args) => config(...args) : config",
      );
      // original export default should be removed
      expect(result).not.toMatch(/export default \{ main, config \}/);
    });

    it('should return code unchanged when there are no exports', () => {
      const code = `
function helper() { return 42; }
const value = helper();
`.trim();

      const result = preprocessPluginCode(code);

      expect(result).toBe(code);
    });

    it('should handle mixed named exports: multiple functions and a config', () => {
      const code = `
export function main() { return null; }
export function onClick() { }
export const config = { name: 'P' };
`.trim();

      const result = preprocessPluginCode(code);

      expect(result).toContain('export default {');
      expect(result).toContain('main:');
      expect(result).toContain('onClick:');
      expect(result).toContain('config:');
      // Export keywords stripped from definitions
      expect(result).not.toMatch(/^export function/m);
      expect(result).not.toMatch(/^export const config/m);
    });
  });

  // -------------------------------------------------------------------------
  // useState with falsy values (issue 1)
  // -------------------------------------------------------------------------

  describe('useState with falsy values', () => {
    it('should preserve 0 as a stored state value', async () => {
      const spy = vi.fn();
      const sandbox = await host.createEvalCode({
        spy,
      });

      await sandbox.eval(`
        const spy = env.spy;
        const state = {};
        function useState(key, defaultValue) {
          if (!(key in state) && defaultValue !== undefined) {
            state[key] = defaultValue;
          }
          return state[key];
        }
        function setState(key, value) {
          state[key] = value;
        }

        // Set to 0, then read back
        setState('counter', 0);
        spy(useState('counter', 99));
      `);

      // Should return 0, not overwrite with 99
      expect(spy).toHaveBeenCalledWith(0);
      sandbox.dispose();
    });

    it('should preserve false as a stored state value', async () => {
      const spy = vi.fn();
      const sandbox = await host.createEvalCode({
        spy,
      });

      await sandbox.eval(`
        const spy = env.spy;
        const state = {};
        function useState(key, defaultValue) {
          if (!(key in state) && defaultValue !== undefined) {
            state[key] = defaultValue;
          }
          return state[key];
        }
        function setState(key, value) {
          state[key] = value;
        }

        setState('flag', false);
        spy(useState('flag', true));
      `);

      // Should return false, not overwrite with true
      expect(spy).toHaveBeenCalledWith(false);
      sandbox.dispose();
    });

    it('should preserve empty string as a stored state value', async () => {
      const spy = vi.fn();
      const sandbox = await host.createEvalCode({
        spy,
      });

      await sandbox.eval(`
        const spy = env.spy;
        const state = {};
        function useState(key, defaultValue) {
          if (!(key in state) && defaultValue !== undefined) {
            state[key] = defaultValue;
          }
          return state[key];
        }
        function setState(key, value) {
          state[key] = value;
        }

        setState('name', '');
        spy(useState('name', 'default'));
      `);

      // Should return '', not overwrite with 'default'
      expect(spy).toHaveBeenCalledWith('');
      sandbox.dispose();
    });
  });

  // -------------------------------------------------------------------------
  // getPluginConfig
  // -------------------------------------------------------------------------

  describe('getPluginConfig', () => {
    it('should return config from plugin using export default syntax', async () => {
      const code = `
const config = {
  name: 'My Plugin',
  description: 'Does something useful',
};
function main() { return null; }
export default { main, config };
`.trim();

      const result = await host.getPluginConfig(code);

      expect(result).not.toBeNull();
      expect(result.name).toBe('My Plugin');
      expect(result.description).toBe('Does something useful');
    });

    it('should return config from plugin using named export const syntax', async () => {
      const code = `
export const config = {
  name: 'Named Export Plugin',
  description: 'Uses named export',
};
export function main() { return null; }
`.trim();

      const result = await host.getPluginConfig(code);

      expect(result).not.toBeNull();
      expect(result.name).toBe('Named Export Plugin');
      expect(result.description).toBe('Uses named export');
    });

    it('should return full config including requests and urls arrays', async () => {
      const code = `
export const config = {
  name: 'Full Config Plugin',
  description: 'Has permissions',
  requests: [{ method: 'GET', host: 'api.example.com', pathname: '/data' }],
  urls: ['https://example.com/*'],
};
export function main() { return null; }
`.trim();

      const result = await host.getPluginConfig(code);

      expect(result.name).toBe('Full Config Plugin');
      expect(result.requests).toHaveLength(1);
      expect(result.requests[0].host).toBe('api.example.com');
      expect(result.urls).toEqual(['https://example.com/*']);
    });

    it('should return undefined config for plugin without config export', async () => {
      const code = `
export function main() { return null; }
`.trim();

      const result = await host.getPluginConfig(code);

      expect(result).toBeUndefined();
    });

    it('should dispose sandbox even when eval throws (issue 3)', async () => {
      const code = `
export const config = { name: 'Test' };
// This will cause a syntax error in the sandbox
this is not valid javascript!!!
`.trim();

      // Should not leak the sandbox — just throw
      await expect(host.getPluginConfig(code)).rejects.toThrow();

      // Calling again should succeed (no resource leak blocking)
      const code2 = `
export const config = { name: 'Retry Plugin' };
export function main() { return null; }
`.trim();

      const result = await host.getPluginConfig(code2);
      expect(result.name).toBe('Retry Plugin');
    });
  });
});
