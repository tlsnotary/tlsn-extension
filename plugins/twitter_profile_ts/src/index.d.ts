declare module 'main' {
    // Extism exports take no params and return an I32
    export function start(): I32;
    export function two(): I32;
    export function parseTwitterResp(): I32;
    export function three(): I32;
    export function config(): I32;
}

declare module 'extism:host' {
    interface user {
        redirect(ptr: I64): void;
        notarize(ptr: I64): I64;
    }
}
