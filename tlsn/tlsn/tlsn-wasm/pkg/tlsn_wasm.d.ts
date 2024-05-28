/* tslint:disable */
/* eslint-disable */
/**
*/
export function setup_tracing_web(): void;
/**
*/
export class Prover {
  free(): void;
/**
* @param {any} config
*/
  constructor(config: any);
/**
* Set up the prover.
*
* This performs all MPC setup prior to establishing the connection to the
* application server.
* @param {string} verifier_url
* @returns {Promise<void>}
*/
  setup(verifier_url: string): Promise<void>;
/**
* Send the HTTP request to the server.
* @param {string} ws_proxy_url
* @param {any} request
* @returns {Promise<any>}
*/
  send_request(ws_proxy_url: string, request: any): Promise<any>;
/**
* Reveals data to the verifier, redacting the specified substrings.
* @param {any} redact
* @returns {Promise<void>}
*/
  reveal(redact: any): Promise<void>;
}
/**
*/
export class Verifier {
  free(): void;
/**
* @param {any} config
*/
  constructor(config: any);
/**
* @param {string} prover_url
* @returns {Promise<void>}
*/
  connect(prover_url: string): Promise<void>;
/**
* @returns {Promise<any>}
*/
  verify(): Promise<any>;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly __wbg_verifier_free: (a: number) => void;
  readonly verifier_new: (a: number, b: number) => void;
  readonly verifier_connect: (a: number, b: number, c: number) => number;
  readonly verifier_verify: (a: number) => number;
  readonly setup_tracing_web: () => void;
  readonly __wbg_prover_free: (a: number) => void;
  readonly prover_new: (a: number, b: number) => void;
  readonly prover_setup: (a: number, b: number, c: number) => number;
  readonly prover_send_request: (a: number, b: number, c: number, d: number) => number;
  readonly prover_reveal: (a: number, b: number) => number;
  readonly ring_core_0_17_8_bn_mul_mont: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly memory: WebAssembly.Memory;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export_3: WebAssembly.Table;
  readonly wasm_bindgen__convert__closures__invoke0_mut__h866fab451526a01b: (a: number, b: number) => void;
  readonly wasm_bindgen__convert__closures__invoke1_mut__hb5831b01f9504b58: (a: number, b: number, c: number) => void;
  readonly wasm_bindgen__convert__closures__invoke1_mut__ha34040edb27f2a7b: (a: number, b: number, c: number) => void;
  readonly _dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h04a8fc7e4fd75a48: (a: number, b: number, c: number) => void;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly wasm_bindgen__convert__closures__invoke2_mut__h921fd5652408deb6: (a: number, b: number, c: number, d: number) => void;
  readonly __wbindgen_thread_destroy: (a?: number, b?: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {SyncInitInput} module
* @param {WebAssembly.Memory} maybe_memory
*
* @returns {InitOutput}
*/
export function initSync(module: SyncInitInput, maybe_memory?: WebAssembly.Memory): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
* @param {WebAssembly.Memory} maybe_memory
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: InitInput | Promise<InitInput>, maybe_memory?: WebAssembly.Memory): Promise<InitOutput>;
