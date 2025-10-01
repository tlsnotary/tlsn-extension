# WebAssembly Component Model Demo

A minimal example demonstrating the WebAssembly Component Model workflow:

## Files

- **hello.wit** - WebAssembly Interface Types definition
- **hello.js** - JavaScript implementation of the component
- **index.html** - Browser demo page

## Build Process

1. **Componentize**: `hello.js` → `hello.component.wasm`
   - Uses `jco componentize` to create a WebAssembly Component

2. **Transpile**: `hello.component.wasm` → `browser/hello.component.js`
   - Uses `jco transpile` to generate browser-compatible JavaScript

## Running the Demo

```bash
# From plugin-sdk directory:
npm run demo:browser
```

This will:
1. Build the component
2. Transpile it for browser
3. Start a local server at http://localhost:8081/demo/

## Component Functions

- `greet(name: string) → string` - Returns a greeting message
- `add(a: u32, b: u32) → u32` - Adds two numbers

## Key Insights

- WebAssembly Components use the Component Model (version `0d 00 01 00`)
- Browsers only support core WebAssembly modules (version `01 00 00 00`)
- The transpilation step bridges this gap by creating JavaScript wrappers