// Mock node:fs/promises for browser compatibility
// memfs extends FileHandle, so we need a base class
export class FileHandle {
  close() {
    return Promise.resolve();
  }
}

export function readFile() {
  return Promise.resolve('');
}
export function writeFile() {
  return Promise.resolve();
}
export function stat() {
  return Promise.resolve({ isFile: () => false, isDirectory: () => false });
}
export function mkdir() {
  return Promise.resolve();
}
export function readdir() {
  return Promise.resolve([]);
}
export function access() {
  return Promise.reject(new Error('ENOENT'));
}
export function open() {
  return Promise.resolve(new FileHandle());
}

export default {
  FileHandle,
  readFile,
  writeFile,
  stat,
  mkdir,
  readdir,
  access,
  open,
};
