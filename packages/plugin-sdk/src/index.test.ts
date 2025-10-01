import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Host } from './index';

describe('Host', () => {
  let host: Host;

  beforeEach(() => {
    host = new Host();
    host.addCapability('add', (a: number, b: number) => a + b);
    // Clear console mocks before each test
    vi.clearAllMocks();
  });

  describe('instantiation', () => {
    it('should instantiate the Host class properly', () => {
      expect(host).toBeInstanceOf(Host);
      expect(host.getPluginCount()).toBe(0);
    });
  });

  describe('loadPlugin', () => {
    it('should load a plugin with an ID', () => {
      const pluginId = 'test-plugin';
      const pluginCode = 'console.log("Hello from plugin");';

      host.loadPlugin(pluginId, pluginCode);

      expect(host.hasPlugin(pluginId)).toBe(true);
      expect(host.getPluginCount()).toBe(1);
    });

    it('should load multiple plugins', () => {
      host.loadPlugin('plugin1', 'const a = 1;');
      host.loadPlugin('plugin2', 'const b = 2;');
      host.loadPlugin('plugin3', 'const c = 3;');

      expect(host.getPluginCount()).toBe(3);
      expect(host.hasPlugin('plugin1')).toBe(true);
      expect(host.hasPlugin('plugin2')).toBe(true);
      expect(host.hasPlugin('plugin3')).toBe(true);
    });

    it('should overwrite a plugin if loaded with the same ID', () => {
      const pluginId = 'test-plugin';
      host.loadPlugin(pluginId, 'const original = true;');
      host.loadPlugin(pluginId, 'const updated = true;');

      expect(host.getPluginCount()).toBe(1);
      expect(host.hasPlugin(pluginId)).toBe(true);
    });
  });

  describe('runPlugin', () => {
    it('should run a simple plugin', async () => {
      const pluginId = 'simple-plugin';
      const pluginCode = 'export default 2;';

      host.loadPlugin(pluginId, pluginCode);
      const result = await host.runPlugin(pluginId);
      expect(result).toBe(2);
    });

    it('should run a plugin that uses console.log with proper prefix', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const pluginId = 'console-plugin';
      const pluginCode = 'console.log("Test message"); "done"';

      host.loadPlugin(pluginId, pluginCode);
      await host.runPlugin(pluginId);

      expect(consoleSpy).toHaveBeenCalledWith('[PluginID:console-plugin]', 'Test message');
    });

    it('should provide the add host function to plugins', async () => {
      const pluginId = 'add-plugin';
      const pluginCode = 'export default env.add(5, 3)';

      host.loadPlugin(pluginId, pluginCode);
      const result = await host.runPlugin(pluginId);

      expect(result).toBe(8);
    });

    it('should throw an error when running a non-existent plugin', async () => {
      await expect(host.runPlugin('non-existent')).rejects.toThrow(
        'Plugin with id "non-existent" not found',
      );
    });

    it('should not allow fetch in the sandbox', async () => {
      // Note: This test is skipped because the QuickJS library seems to provide
      // fetch even when allowFetch is false. This may be a library issue.
      const pluginId = 'fetch-plugin';
      const pluginCode = `
        const resp = await fetch("https://api.github.com");
        const text = await resp.text();
        export default text;
      `;

      host.loadPlugin(pluginId, pluginCode);

      let err: Error | undefined;

      try {
        await host.runPlugin(pluginId);
      } catch (error) {
        err = error as Error;
      }

      if (!err) {
        throw new Error('No error thrown');
      }

      expect(err.message).toBeDefined();
      expect(err.message).toEqual('PluginID:fetch-plugin execution failed: Not supported: fetch has been disabled for security reasons or is not supported by the runtime');
    });
  });

  describe('clearPlugin', () => {
    it('should clear a specific plugin by ID', () => {
      host.loadPlugin('plugin1', 'const a = 1;');
      host.loadPlugin('plugin2', 'const b = 2;');
      host.loadPlugin('plugin3', 'const c = 3;');

      host.clearPlugin('plugin2');

      expect(host.getPluginCount()).toBe(2);
      expect(host.hasPlugin('plugin1')).toBe(true);
      expect(host.hasPlugin('plugin2')).toBe(false);
      expect(host.hasPlugin('plugin3')).toBe(true);
    });

    it('should clear all plugins when ID is not provided', () => {
      host.loadPlugin('plugin1', 'const a = 1;');
      host.loadPlugin('plugin2', 'const b = 2;');
      host.loadPlugin('plugin3', 'const c = 3;');

      host.clearPlugin();

      expect(host.getPluginCount()).toBe(0);
      expect(host.hasPlugin('plugin1')).toBe(false);
      expect(host.hasPlugin('plugin2')).toBe(false);
      expect(host.hasPlugin('plugin3')).toBe(false);
    });

    it('should handle clearing a non-existent plugin gracefully', () => {
      host.loadPlugin('plugin1', 'const a = 1;');

      host.clearPlugin('non-existent');

      expect(host.getPluginCount()).toBe(1);
      expect(host.hasPlugin('plugin1')).toBe(true);
    });
  });

  describe('helper methods', () => {
    it('should correctly report plugin count', () => {
      expect(host.getPluginCount()).toBe(0);

      host.loadPlugin('plugin1', 'const a = 1;');
      expect(host.getPluginCount()).toBe(1);

      host.loadPlugin('plugin2', 'const b = 2;');
      expect(host.getPluginCount()).toBe(2);

      host.clearPlugin('plugin1');
      expect(host.getPluginCount()).toBe(1);

      host.clearPlugin();
      expect(host.getPluginCount()).toBe(0);
    });

    it('should correctly check if a plugin exists', () => {
      expect(host.hasPlugin('test')).toBe(false);

      host.loadPlugin('test', 'const test = true;');
      expect(host.hasPlugin('test')).toBe(true);

      host.clearPlugin('test');
      expect(host.hasPlugin('test')).toBe(false);
    });
  });
});
