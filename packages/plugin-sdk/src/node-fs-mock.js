// Mock fs module for browser compatibility
export function readFileSync() {
  return '';
}

export function writeFileSync() {}
export function existsSync() {
  return false;
}
export function mkdirSync() {}
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