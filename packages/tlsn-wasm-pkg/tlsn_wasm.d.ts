/* tslint:disable */
/* eslint-disable */
/**
 * Connection information.
 */
export interface ConnectionInfo {
    /**
     * Unix timestamp of the connection.
     */
    time: number;
    /**
     * TLS version used.
     */
    version: TlsVersion;
    /**
     * Transcript length information.
     */
    transcript_length: TranscriptLength;
}

/**
 * Full transcript of sent and received data.
 */
export interface Transcript {
    /**
     * Data sent to the server.
     */
    sent: number[];
    /**
     * Data received from the server.
     */
    recv: number[];
}

/**
 * HTTP method.
 */
export type Method = "GET" | "POST" | "PUT" | "DELETE";

/**
 * HTTP request body.
 */
export type Body = JsonValue;

/**
 * HTTP request.
 */
export interface HttpRequest {
    /**
     * Request URI.
     */
    uri: string;
    /**
     * HTTP method.
     */
    method: Method;
    /**
     * Request headers.
     */
    headers: Map<string, number[]>;
    /**
     * Optional request body.
     */
    body: Body | undefined;
}

/**
 * HTTP response.
 */
export interface HttpResponse {
    /**
     * HTTP status code.
     */
    status: number;
    /**
     * Response headers.
     */
    headers: [string, number[]][];
}

/**
 * Network setting for protocol optimization.
 */
export type NetworkSetting = "Bandwidth" | "Latency";

/**
 * Output from the verifier.
 */
export interface VerifierOutput {
    /**
     * Server name (if revealed).
     */
    server_name: string | undefined;
    /**
     * Connection information.
     */
    connection_info: ConnectionInfo;
    /**
     * Partial transcript (if revealed).
     */
    transcript: PartialTranscript | undefined;
}

/**
 * Partial transcript with authenticated ranges.
 */
export interface PartialTranscript {
    /**
     * Data sent to the server.
     */
    sent: number[];
    /**
     * Authenticated ranges of sent data.
     */
    sent_authed: { start: number; end: number }[];
    /**
     * Data received from the server.
     */
    recv: number[];
    /**
     * Authenticated ranges of received data.
     */
    recv_authed: { start: number; end: number }[];
}

/**
 * Ranges of data to commit.
 */
export interface Commit {
    /**
     * Ranges of sent data to commit.
     */
    sent: { start: number; end: number }[];
    /**
     * Ranges of received data to commit.
     */
    recv: { start: number; end: number }[];
}

/**
 * Ranges of data to reveal.
 */
export interface Reveal {
    /**
     * Ranges of sent data to reveal.
     */
    sent: { start: number; end: number }[];
    /**
     * Ranges of received data to reveal.
     */
    recv: { start: number; end: number }[];
    /**
     * Whether to reveal the server identity.
     */
    server_identity: boolean;
}

/**
 * TLS version.
 */
export type TlsVersion = "V1_2" | "V1_3";

/**
 * Transcript length information.
 */
export interface TranscriptLength {
    /**
     * Bytes sent.
     */
    sent: number;
    /**
     * Bytes received.
     */
    recv: number;
}

export interface CrateLogFilter {
    level: LoggingLevel;
    name: string;
}

export interface LoggingConfig {
    level: LoggingLevel | undefined;
    crate_filters: CrateLogFilter[] | undefined;
    span_events: SpanEvent[] | undefined;
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

export type LoggingLevel = "Off" | "Trace" | "Debug" | "Info" | "Warn" | "Error";

export type SpanEvent = "New" | "Close" | "Active";


/**
 * Prover for the TLSNotary protocol.
 *
 * The prover connects to both a verifier and a target server, executing the
 * MPC-TLS protocol to generate verifiable proofs of the TLS session.
 */
export class Prover {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Creates a new Prover with the given configuration.
     */
    constructor(config: ProverConfig);
    /**
     * Reveals data to the verifier and finalizes the protocol.
     */
    reveal(reveal: Reveal): Promise<void>;
    /**
     * Sends an HTTP request to the server.
     *
     * # Arguments
     *
     * * `server_io` - A JavaScript object implementing the IoChannel interface,
     *   connected to the server (typically via a WebSocket proxy).
     * * `request` - The HTTP request to send.
     */
    send_request(server_io: IoChannel, request: HttpRequest): Promise<HttpResponse>;
    /**
     * Sets up the prover with the verifier.
     *
     * This performs all MPC setup prior to establishing the connection to the
     * application server.
     *
     * # Arguments
     *
     * * `verifier_io` - A JavaScript object implementing the IoChannel interface,
     *   connected to the verifier.
     */
    setup(verifier_io: IoChannel): Promise<void>;
    /**
     * Returns the transcript of the TLS session.
     */
    transcript(): Transcript;
}

/**
 * Global spawner which spawns closures into web workers.
 */
export class Spawner {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    intoRaw(): number;
    /**
     * Runs the spawner.
     */
    run(url: string): Promise<void>;
}

/**
 * Verifier for the TLSNotary protocol.
 *
 * The verifier participates in the MPC-TLS protocol with the prover,
 * verifying the authenticity of the TLS session without seeing the
 * full plaintext.
 */
export class Verifier {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Connects to the prover.
     *
     * # Arguments
     *
     * * `prover_io` - A JavaScript object implementing the IoChannel interface,
     *   connected to the prover.
     */
    connect(prover_io: IoChannel): Promise<void>;
    /**
     * Creates a new Verifier with the given configuration.
     */
    constructor(config: VerifierConfig);
    /**
     * Verifies the connection and finalizes the protocol.
     */
    verify(): Promise<VerifierOutput>;
}

export class WorkerData {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}

/**
 * Initializes the module.
 */
export function initialize(logging_config: LoggingConfig | null | undefined, thread_count: number): Promise<void>;

/**
 * Starts the thread spawner on a dedicated worker thread.
 */
export function startSpawner(): Promise<any>;

export function web_spawn_recover_spawner(spawner: number): Spawner;

export function web_spawn_start_worker(worker: number): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly __wbg_prover_free: (a: number, b: number) => void;
    readonly __wbg_verifier_free: (a: number, b: number) => void;
    readonly initialize: (a: number, b: number) => any;
    readonly prover_new: (a: any) => [number, number, number];
    readonly prover_reveal: (a: number, b: any) => any;
    readonly prover_send_request: (a: number, b: any, c: any) => any;
    readonly prover_setup: (a: number, b: any) => any;
    readonly prover_transcript: (a: number) => [number, number, number];
    readonly verifier_connect: (a: number, b: any) => any;
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
    readonly wasm_bindgen_882de39c336d20b6___closure__destroy___dyn_core_a0678809250066c8___ops__function__FnMut__wasm_bindgen_882de39c336d20b6___JsValue____Output_______: (a: number, b: number) => void;
    readonly wasm_bindgen_882de39c336d20b6___convert__closures_____invoke___wasm_bindgen_882de39c336d20b6___JsValue__wasm_bindgen_882de39c336d20b6___JsValue_____: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen_882de39c336d20b6___convert__closures_____invoke___wasm_bindgen_882de39c336d20b6___JsValue_____: (a: number, b: number, c: any) => void;
    readonly memory: WebAssembly.Memory;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
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
