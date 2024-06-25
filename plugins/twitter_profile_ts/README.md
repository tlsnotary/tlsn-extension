# TLSNotary TypeScript plugin demo: Prove ownership of a Twitter handle

This is a demo demo plugin for the TLSNotary browser extension.

## Building

Build the plugin:
```
npm i
npm run build
```
This will the wasm binary in `dist/index.wasm`.
You can load the plugin in the browser extension by clicking **Add a plugin** in the main menu.

## More info

TLSNotary's plugin system is using [Extism](https://github.com/extism). For more documentation check https://github.com/extism/js-pdk.
