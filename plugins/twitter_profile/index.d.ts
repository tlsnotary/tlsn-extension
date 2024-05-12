declare module 'main' {
  // Extism exports take no params and return an I32
  export function start(): I32;
  export function checkCookies(): I32;
  export function notarize(): I32;
  export function config(): I32;
}

declare module 'extism:host' {
  interface user {
    redirect(ptr: I64): void;
  }
}
