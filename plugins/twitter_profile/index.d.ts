declare module 'main' {
  // Extism exports take no params and return an I32
  export function start(): I32;
  export function config(): I32;
}

declare module 'extism:host' {
  interface user {
    has_request_uri(ptr: I64): I64;
    get_response(ptr: I64): I64;
  }
}
