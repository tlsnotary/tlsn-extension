# @tlsn/plugin-sdk

SDK for developing and running TLSN WebAssembly plugins using the Component Model.

## Overview

This package provides:

- **Host Environment**: Runtime for executing WASM Component Model plugins
- **Development Tools**: Utilities for building and testing plugins
- **Plugin Demos**: Example plugins demonstrating SDK capabilities
- **Type Definitions**: TypeScript types for plugin development

## Structure

```
plugin-sdk/
├── src/              # SDK source code
│   ├── host/         # Plugin host runtime
│   ├── builder/      # Build utilities
│   └── types/        # Type definitions
├── examples/         # Example plugins and demos
│   ├── hello-world/  # Basic plugin example
│   └── http-logger/  # HTTP request logging plugin
└── dist/             # Built SDK (generated)
```

## Usage

### Installation

```bash
npm install @tlsn/plugin-sdk
```

### Creating a Plugin Host

```typescript
import { PluginHost } from '@tlsn/plugin-sdk';

const host = new PluginHost({
  console: {
    log: (msg) => console.log('[Plugin]', msg)
  }
});

const plugin = await host.loadPlugin({
  id: 'my-plugin',
  url: 'path/to/plugin.wasm'
});

await plugin.exports.run();
```

### Developing a Plugin

See `examples/` directory for complete plugin examples.

## Development

_Implementation in progress_

## License

MIT