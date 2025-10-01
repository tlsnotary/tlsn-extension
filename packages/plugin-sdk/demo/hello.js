// Simple WebAssembly Component implementation
// This will be compiled to a WASM component using componentize-js

export function greet(name) {
  return `Hello, ${name}! This is a WebAssembly Component.`;
}

export function add(a, b) {
  return a + b;
}