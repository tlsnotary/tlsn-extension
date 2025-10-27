// Mock fs module for browser compatibility
export function readFileSync() {
  return '';
}

export function writeFileSync() {
  // No-op mock for browser compatibility
}
export function existsSync() {
  return false;
}
export function mkdirSync() {
  // No-op mock for browser compatibility
}
export function readdirSync() {
  return [];
}
export function statSync() {
  return {
    isFile: () => false,
    isDirectory: () => false,
  };
}

export default {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
};
