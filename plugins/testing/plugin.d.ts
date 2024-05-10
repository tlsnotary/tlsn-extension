declare module 'main' {
  export function greet(): I32;
}

declare module 'extism:host' {
  interface user {
    get_response(): I32;
  }
}
