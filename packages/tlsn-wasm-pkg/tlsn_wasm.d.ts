/* tslint:disable */
/* eslint-disable */
/**
 * Initializes the module.
 */
export function initialize(logging_config: LoggingConfig | null | undefined, thread_count: number): Promise<void>;
/**
 * Starts the thread spawner on a dedicated worker thread.
 */
export function startSpawner(): Promise<any>;
export function web_spawn_start_worker(worker: number): void;
export function web_spawn_recover_spawner(spawner: number): Spawner;
export type LoggingLevel = "Trace" | "Debug" | "Info" | "Warn" | "Error";

export interface CrateLogFilter {
    level: LoggingLevel;
    name: string;
}

export interface LoggingConfig {
    level: LoggingLevel | undefined;
    crate_filters: CrateLogFilter[] | undefined;
    span_events: SpanEvent[] | undefined;
}

export type SpanEvent = "New" | "Close" | "Active";

export interface Reveal {
    sent: { start: number; end: number }[];
    recv: { start: number; end: number }[];
    server_identity: boolean;
}

export interface Transcript {
    sent: number[];
    recv: number[];
}

export type Method = "GET" | "POST" | "PUT" | "DELETE";

export type TlsVersion = "V1_2" | "V1_3";

export type NetworkSetting = "Bandwidth" | "Latency";

export type Body = JsonValue;

export interface Commit {
    sent: { start: number; end: number }[];
    recv: { start: number; end: number }[];
}

export interface PartialTranscript {
    sent: number[];
    sent_authed: { start: number; end: number }[];
    recv: number[];
    recv_authed: { start: number; end: number }[];
}

export interface HttpResponse {
    status: number;
    headers: [string, number[]][];
}

export interface ConnectionInfo {
    time: number;
    version: TlsVersion;
    transcript_length: TranscriptLength;
}

export interface HttpRequest {
    uri: string;
    method: Method;
    headers: Map<string, number[]>;
    body: Body | undefined;
}

export interface TranscriptLength {
    sent: number;
    recv: number;
}

export interface VerifierOutput {
    server_name: string | undefined;
    connection_info: ConnectionInfo;
    transcript: PartialTranscript | undefined;
}

export interface ProverConfig {
    server_name: string;
    max_sent_data: number;
    max_sent_records: number | undefined;
    max_recv_data_online: number | undefined;
    max_recv_data: number;
    max_recv_records_online: number | undefined;
    defer_decryption_from_start: boolean | undefined;
    network: NetworkSetting;
    client_auth: [number[][], number[]] | undefined;
}

export interface VerifierConfig {
    max_sent_data: number;
    max_recv_data: number;
    max_sent_records: number | undefined;
    max_recv_records_online: number | undefined;
}

export class Prover {
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Returns the transcript.
   */
  transcript(): Transcript;
  /**
   * Send the HTTP request to the server.
   */
  send_request(ws_proxy_url: string, request: HttpRequest): Promise<HttpResponse>;
  constructor(config: ProverConfig);
  /**
   * Set up the prover.
   *
   * This performs all MPC setup prior to establishing the connection to the
   * application server.
   */
  setup(verifier_url: string): Promise<void>;
  /**
   * Reveals data to the verifier and finalizes the protocol.
   */
  reveal(reveal: Reveal): Promise<void>;
}
/**
 * Global spawner which spawns closures into web workers.
 */
export class Spawner {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  /**
   * Runs the spawner.
   */
  run(url: string): Promise<void>;
  intoRaw(): number;
}
export class Verifier {
  free(): void;
  [Symbol.dispose](): void;
  constructor(config: VerifierConfig);
  /**
   * Verifies the connection and finalizes the protocol.
   */
  verify(): Promise<VerifierOutput>;
  /**
   * Connect to the prover.
   */
  connect(prover_url: string): Promise<void>;
}
export class WorkerData {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly __wbg_prover_free: (a: number, b: number) => void;
  readonly __wbg_verifier_free: (a: number, b: number) => void;
  readonly initialize: (a: number, b: number) => any;
  readonly prover_new: (a: any) => [number, number, number];
  readonly prover_reveal: (a: number, b: any) => any;
  readonly prover_send_request: (a: number, b: number, c: number, d: any) => any;
  readonly prover_setup: (a: number, b: number, c: number) => any;
  readonly prover_transcript: (a: number) => [number, number, number];
  readonly verifier_connect: (a: number, b: number, c: number) => any;
  readonly verifier_new: (a: any) => number;
  readonly verifier_verify: (a: number) => any;
  readonly __wbg_spawner_free: (a: number, b: number) => void;
  readonly __wbg_workerdata_free: (a: number, b: number) => void;
  readonly spawner_intoRaw: (a: number) => number;
  readonly spawner_run: (a: number, b: number, c: number) => any;
  readonly startSpawner: () => any;
  readonly web_spawn_recover_spawner: (a: number) => number;
  readonly web_spawn_start_worker: (a: number) => void;
  readonly ring_core_0_17_14__bn_mul_mont: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  readonly memory: WebAssembly.Memory;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_5: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export_7: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly wasm_bindgen__convert__closures_____invoke__h5261d4aab6ab8312: (a: number, b: number) => void;
  readonly closure1906_externref_shim: (a: number, b: number, c: any) => void;
  readonly closure43_externref_shim: (a: number, b: number, c: any) => void;
  readonly closure3297_externref_shim: (a: number, b: number, c: any, d: any) => void;
  readonly __wbindgen_thread_destroy: (a?: number, b?: number, c?: number) => void;
  readonly __wbindgen_start: (a: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number }} module - Passing `SyncInitInput` directly is deprecated.
* @param {WebAssembly.Memory} memory - Deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput, memory?: WebAssembly.Memory, thread_stack_size?: number } | SyncInitInput, memory?: WebAssembly.Memory): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number }} module_or_path - Passing `InitInput` directly is deprecated.
* @param {WebAssembly.Memory} memory - Deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput>, memory?: WebAssembly.Memory, thread_stack_size?: number } | InitInput | Promise<InitInput>, memory?: WebAssembly.Memory): Promise<InitOutput>;
