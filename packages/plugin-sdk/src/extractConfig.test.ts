import { describe, it, expect } from 'vitest';
import { extractConfig } from './index';

describe('extractConfig', () => {
  it('should extract config from valid plugin code', async () => {
    const code = `
      const config = {
        name: 'Test Plugin',
        description: 'A test plugin for testing',
      };

      function main() {
        return div({ className: 'test' });
      }

      export default { main, config };
    `;

    const result = await extractConfig(code);

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Test Plugin');
    expect(result?.description).toBe('A test plugin for testing');
  });

  it('should extract config with optional fields', async () => {
    const code = `
      const config = {
        name: 'Full Plugin',
        description: 'A complete plugin',
        version: '1.0.0',
        author: 'Test Author',
      };

      function main() {
        return null;
      }

      export default { main, config };
    `;

    const result = await extractConfig(code);

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Full Plugin');
    expect(result?.description).toBe('A complete plugin');
    expect(result?.version).toBe('1.0.0');
    expect(result?.author).toBe('Test Author');
  });

  it('should return null for code without config', async () => {
    const code = `
      function main() {
        return div({ className: 'test' });
      }

      export default { main };
    `;

    const result = await extractConfig(code);

    expect(result).toBeNull();
  });

  it('should return null for config without name', async () => {
    const code = `
      const config = {
        description: 'No name plugin',
      };

      function main() {
        return null;
      }

      export default { main, config };
    `;

    const result = await extractConfig(code);

    expect(result).toBeNull();
  });

  it('should return null for invalid/unparseable code', async () => {
    const code = `
      this is not valid javascript!!!
    `;

    const result = await extractConfig(code);

    expect(result).toBeNull();
  });

  it('should extract config with double quotes', async () => {
    const code = `
      const config = {
        name: "Double Quote Plugin",
        description: "Uses double quotes",
      };

      function main() { return null; }
      export default { main, config };
    `;

    const result = await extractConfig(code);

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Double Quote Plugin');
    expect(result?.description).toBe('Uses double quotes');
  });

  it('should handle minified-style code', async () => {
    const code = `const config={name:"Minified",description:"A minified plugin"};function main(){return null}`;

    const result = await extractConfig(code);

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Minified');
    expect(result?.description).toBe('A minified plugin');
  });

  it('should handle config with description before name', async () => {
    const code = `
      const config = {
        description: 'Description comes first',
        name: 'Reversed Order Plugin',
      };

      function main() { return null; }
    `;

    const result = await extractConfig(code);

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Reversed Order Plugin');
    expect(result?.description).toBe('Description comes first');
  });

  it('should handle backtick strings', async () => {
    const code = `
      const config = {
        name: \`Backtick Plugin\`,
        description: \`Uses template literals\`,
      };

      function main() { return null; }
    `;

    const result = await extractConfig(code);

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Backtick Plugin');
    expect(result?.description).toBe('Uses template literals');
  });

  // Note: The regex-based extractConfig cannot handle array fields like requests and urls.
  // For full config extraction including permissions, use Host.getPluginConfig() which uses QuickJS sandbox.
});
