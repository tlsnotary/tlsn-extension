/* @ts-self-types="./tlsn_wasm.d.ts" */
import { startSpawnerWorker } from './snippets/web-spawn-a9a7b723410ab3ab/js/spawn.js';

/**
 * Prover for the TLSNotary protocol.
 *
 * The prover connects to both a verifier and a target server, executing the
 * MPC-TLS protocol to generate verifiable proofs of the TLS session.
 */
export class Prover {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ProverFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_prover_free(ptr, 0);
    }
    /**
     * Creates a new Prover with the given configuration.
     * @param {ProverConfig} config
     */
    constructor(config) {
        const ret = wasm.prover_new(config);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        this.__wbg_ptr = ret[0] >>> 0;
        ProverFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Reveals data to the verifier and finalizes the protocol.
     * @param {Reveal} reveal
     * @returns {Promise<void>}
     */
    reveal(reveal) {
        const ret = wasm.prover_reveal(this.__wbg_ptr, reveal);
        return ret;
    }
    /**
     * Sends an HTTP request to the server.
     *
     * # Arguments
     *
     * * `server_io` - A JavaScript object implementing the IoChannel
     *   interface, connected to the server (typically via a WebSocket proxy).
     * * `request` - The HTTP request to send.
     * @param {IoChannel} server_io
     * @param {HttpRequest} request
     * @returns {Promise<HttpResponse>}
     */
    send_request(server_io, request) {
        const ret = wasm.prover_send_request(this.__wbg_ptr, server_io, request);
        return ret;
    }
    /**
     * Sets a progress callback that receives structured progress updates.
     *
     * The callback receives a single argument: `{ step: string, progress: number, message: string }`.
     *
     * Steps emitted: `MPC_SETUP`, `CONNECTING_TO_SERVER`, `SENDING_REQUEST`,
     * `REQUEST_COMPLETE`, `REVEAL`, `FINALIZED`.
     * @param {Function} callback
     */
    set_progress_callback(callback) {
        wasm.prover_set_progress_callback(this.__wbg_ptr, callback);
    }
    /**
     * Sets up the prover with the verifier.
     *
     * This performs all MPC setup prior to establishing the connection to the
     * application server.
     *
     * # Arguments
     *
     * * `verifier_io` - A JavaScript object implementing the IoChannel
     *   interface, connected to the verifier.
     * @param {IoChannel} verifier_io
     * @returns {Promise<void>}
     */
    setup(verifier_io) {
        const ret = wasm.prover_setup(this.__wbg_ptr, verifier_io);
        return ret;
    }
    /**
     * Returns the transcript of the TLS session.
     * @returns {Transcript}
     */
    transcript() {
        const ret = wasm.prover_transcript(this.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
}
if (Symbol.dispose) Prover.prototype[Symbol.dispose] = Prover.prototype.free;

/**
 * Global spawner which spawns closures into web workers.
 */
export class Spawner {
    static __wrap(ptr) {
        ptr = ptr >>> 0;
        const obj = Object.create(Spawner.prototype);
        obj.__wbg_ptr = ptr;
        SpawnerFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SpawnerFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_spawner_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    intoRaw() {
        const ptr = this.__destroy_into_raw();
        const ret = wasm.spawner_intoRaw(ptr);
        return ret >>> 0;
    }
    /**
     * Runs the spawner.
     * @param {string} url
     * @returns {Promise<void>}
     */
    run(url) {
        const ptr0 = passStringToWasm0(url, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.spawner_run(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
}
if (Symbol.dispose) Spawner.prototype[Symbol.dispose] = Spawner.prototype.free;

/**
 * Verifier for the TLSNotary protocol.
 *
 * The verifier participates in the MPC-TLS protocol with the prover,
 * verifying the authenticity of the TLS session without seeing the
 * full plaintext.
 */
export class Verifier {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        VerifierFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_verifier_free(ptr, 0);
    }
    /**
     * Connects to the prover.
     *
     * # Arguments
     *
     * * `prover_io` - A JavaScript object implementing the IoChannel
     *   interface, connected to the prover.
     * @param {IoChannel} prover_io
     * @returns {Promise<void>}
     */
    connect(prover_io) {
        const ret = wasm.verifier_connect(this.__wbg_ptr, prover_io);
        return ret;
    }
    /**
     * Creates a new Verifier with the given configuration.
     * @param {VerifierConfig} config
     */
    constructor(config) {
        const ret = wasm.verifier_new(config);
        this.__wbg_ptr = ret >>> 0;
        VerifierFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Verifies the connection and finalizes the protocol.
     * @returns {Promise<VerifierOutput>}
     */
    verify() {
        const ret = wasm.verifier_verify(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) Verifier.prototype[Symbol.dispose] = Verifier.prototype.free;

export class WorkerData {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WorkerDataFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_workerdata_free(ptr, 0);
    }
}
if (Symbol.dispose) WorkerData.prototype[Symbol.dispose] = WorkerData.prototype.free;

/**
 * Parses HTTP request/response transcripts and maps handlers to byte ranges.
 *
 * This is the WASM wrapper around `tlsn_sdk_core::compute_reveal`.
 *
 * # Arguments
 *
 * * `sent` - Raw bytes of the HTTP request (sent data).
 * * `recv` - Raw bytes of the HTTP response (received data).
 * * `handlers` - Array of handler objects (deserialized from JS).
 *
 * # Returns
 *
 * A `ComputeRevealOutput` object containing:
 * - `sentRanges` / `recvRanges`: byte ranges for `Prover.reveal()`
 * - `sentRangesWithHandlers` / `recvRangesWithHandlers`: ranges annotated with
 *   handlers
 * @param {Uint8Array} sent
 * @param {Uint8Array} recv
 * @param {any} handlers
 * @returns {any}
 */
export function compute_reveal(sent, recv, handlers) {
    const ptr0 = passArray8ToWasm0(sent, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray8ToWasm0(recv, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_reveal(ptr0, len0, ptr1, len1, handlers);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return takeFromExternrefTable0(ret[0]);
}

/**
 * Initializes the module.
 * @param {LoggingConfig | null | undefined} logging_config
 * @param {number} thread_count
 * @returns {Promise<void>}
 */
export function initialize(logging_config, thread_count) {
    const ret = wasm.initialize(isLikeNone(logging_config) ? 0 : addToExternrefTable0(logging_config), thread_count);
    return ret;
}

/**
 * Starts the thread spawner on a dedicated worker thread.
 * @returns {Promise<any>}
 */
export function startSpawner() {
    const ret = wasm.startSpawner();
    return ret;
}

/**
 * @param {number} spawner
 * @returns {Spawner}
 */
export function web_spawn_recover_spawner(spawner) {
    const ret = wasm.web_spawn_recover_spawner(spawner);
    return Spawner.__wrap(ret);
}

/**
 * @param {number} worker
 */
export function web_spawn_start_worker(worker) {
    wasm.web_spawn_start_worker(worker);
}

function __wbg_get_imports(memory) {
    const import0 = {
        __proto__: null,
        __wbg_Error_4577686b3a6d9b3a: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_Number_e89e48a2fe1a6355: function(arg0) {
            const ret = Number(arg0);
            return ret;
        },
        __wbg_String_8564e559799eccda: function(arg0, arg1) {
            const ret = String(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_bigint_get_as_i64_578010f8442e0319: function(arg0, arg1) {
            const v = arg1;
            const ret = typeof(v) === 'bigint' ? v : undefined;
            getDataViewMemory0().setBigInt64(arg0 + 8 * 1, isLikeNone(ret) ? BigInt(0) : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_boolean_get_18c4ed9422296fff: function(arg0) {
            const v = arg0;
            const ret = typeof(v) === 'boolean' ? v : undefined;
            return isLikeNone(ret) ? 0xFFFFFF : ret ? 1 : 0;
        },
        __wbg___wbindgen_debug_string_ddde1867f49c2442: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_in_1064a108f4d18b9e: function(arg0, arg1) {
            const ret = arg0 in arg1;
            return ret;
        },
        __wbg___wbindgen_is_bigint_a157f0734ca85901: function(arg0) {
            const ret = typeof(arg0) === 'bigint';
            return ret;
        },
        __wbg___wbindgen_is_function_d633e708baf0d146: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_a2a19127c13e7126: function(arg0) {
            const ret = arg0 === null;
            return ret;
        },
        __wbg___wbindgen_is_object_4b3de556756ee8a8: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_7debe47dc1e045c2: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_c18285b9fc34cb7d: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_jsval_eq_a6afb59d8c5e78d6: function(arg0, arg1) {
            const ret = arg0 === arg1;
            return ret;
        },
        __wbg___wbindgen_jsval_loose_eq_1562ceb9af84e990: function(arg0, arg1) {
            const ret = arg0 == arg1;
            return ret;
        },
        __wbg___wbindgen_memory_f1258f0b3cab52b2: function() {
            const ret = wasm.memory;
            return ret;
        },
        __wbg___wbindgen_module_39ff3d28752148a9: function() {
            const ret = wasmModule;
            return ret;
        },
        __wbg___wbindgen_number_get_5854912275df1894: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_rethrow_0803fa3da1b498f1: function(arg0) {
            throw arg0;
        },
        __wbg___wbindgen_string_get_3e5751597f39a112: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_39bc967c0e5a9b58: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_b6d832240a919168: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_async_d823d36f294f15c4: function(arg0) {
            const ret = arg0.async;
            return ret;
        },
        __wbg_buffer_0501472a2adb62a1: function(arg0) {
            const ret = arg0.buffer;
            return ret;
        },
        __wbg_call_08ad0d89caa7cb79: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_call_73af281463ec8b58: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_close_4f7654f3808882a2: function() { return handleError(function (arg0) {
            const ret = arg0.close();
            return ret;
        }, arguments); },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_data_826b7d645a40043f: function(arg0) {
            const ret = arg0.data;
            return ret;
        },
        __wbg_done_5aad55ec6b1954b1: function(arg0) {
            const ret = arg0.done;
            return ret;
        },
        __wbg_entries_28d32ba4cd93f5fc: function(arg0) {
            const ret = Object.entries(arg0);
            return ret;
        },
        __wbg_error_a6fa202b58aa1cd3: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_getRandomValues_b2176991427f6db8: function() { return handleError(function (arg0) {
            globalThis.crypto.getRandomValues(arg0);
        }, arguments); },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_get_4920fefd3451364b: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_get_f09c3a16f8848381: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_unchecked_3d0f4b91c8eca4f0: function(arg0, arg1) {
            const ret = arg0[arg1 >>> 0];
            return ret;
        },
        __wbg_get_with_ref_key_6412cf3094599694: function(arg0, arg1) {
            const ret = arg0[arg1];
            return ret;
        },
        __wbg_instanceof_ArrayBuffer_15859862b80b732d: function(arg0) {
            let result;
            try {
                result = arg0 instanceof ArrayBuffer;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Map_9df16bf25ceb4ecb: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Map;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_Uint8Array_2240b7046ac16f05: function(arg0) {
            let result;
            try {
                result = arg0 instanceof Uint8Array;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isArray_fad08a0d12828686: function(arg0) {
            const ret = Array.isArray(arg0);
            return ret;
        },
        __wbg_isSafeInteger_10e4151eb694e42a: function(arg0) {
            const ret = Number.isSafeInteger(arg0);
            return ret;
        },
        __wbg_iterator_fc7ad8d33bab9e26: function() {
            const ret = Symbol.iterator;
            return ret;
        },
        __wbg_length_5855c1f289dfffc1: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_length_a31e05262e09b7f8: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_log_a08c94858b7b3f5d: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.log(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_log_af57d76a20981228: function(arg0, arg1, arg2, arg3, arg4, arg5, arg6, arg7) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.log(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3), getStringFromWasm0(arg4, arg5), getStringFromWasm0(arg6, arg7));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_mark_be5ec5c35d91d156: function(arg0, arg1) {
            performance.mark(getStringFromWasm0(arg0, arg1));
        },
        __wbg_measure_dc9d16991bb9411f: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            let deferred0_0;
            let deferred0_1;
            let deferred1_0;
            let deferred1_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                deferred1_0 = arg2;
                deferred1_1 = arg3;
                performance.measure(getStringFromWasm0(arg0, arg1), getStringFromWasm0(arg2, arg3));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
                wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
            }
        }, arguments); },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_09959f7b4c92c246: function(arg0) {
            const ret = new Uint8Array(arg0);
            return ret;
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_5249bab2d955c841: function(arg0) {
            const ret = new Int32Array(arg0);
            return ret;
        },
        __wbg_new_6eed8f87fc95618e: function() { return handleError(function (arg0, arg1) {
            const ret = new Worker(getStringFromWasm0(arg0, arg1));
            return ret;
        }, arguments); },
        __wbg_new_79ce7968119cfd96: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen_ac83de04fc99fbbd___convert__closures_____invoke___js_sys_c035ef050bbf6fd2___Function_fn_wasm_bindgen_ac83de04fc99fbbd___JsValue_____wasm_bindgen_ac83de04fc99fbbd___sys__Undefined___js_sys_c035ef050bbf6fd2___Function_fn_wasm_bindgen_ac83de04fc99fbbd___JsValue_____wasm_bindgen_ac83de04fc99fbbd___sys__Undefined______(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = state0.b = 0;
            }
        },
        __wbg_new_cbee8c0d5c479eac: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_ed69e637b553a997: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_from_slice_d7e202fdbee3c396: function(arg0, arg1) {
            const ret = new Uint8Array(getArrayU8FromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_typed_8258a0d8488ef2a2: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen_ac83de04fc99fbbd___convert__closures_____invoke___js_sys_c035ef050bbf6fd2___Function_fn_wasm_bindgen_ac83de04fc99fbbd___JsValue_____wasm_bindgen_ac83de04fc99fbbd___sys__Undefined___js_sys_c035ef050bbf6fd2___Function_fn_wasm_bindgen_ac83de04fc99fbbd___JsValue_____wasm_bindgen_ac83de04fc99fbbd___sys__Undefined______(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = state0.b = 0;
            }
        },
        __wbg_new_with_length_c8449d782396d344: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_new_with_options_6430dd96b9678e36: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = new Worker(getStringFromWasm0(arg0, arg1), arg2);
            return ret;
        }, arguments); },
        __wbg_next_a5fe6f328f7affc2: function(arg0) {
            const ret = arg0.next;
            return ret;
        },
        __wbg_next_e592122bb4ed4c67: function() { return handleError(function (arg0) {
            const ret = arg0.next();
            return ret;
        }, arguments); },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_now_e7c6795a7f81e10f: function(arg0) {
            const ret = arg0.now();
            return ret;
        },
        __wbg_now_edd718b3004d8631: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_of_332bf1b25b068982: function(arg0, arg1, arg2) {
            const ret = Array.of(arg0, arg1, arg2);
            return ret;
        },
        __wbg_performance_3fcf6e32a7e1ed0a: function(arg0) {
            const ret = arg0.performance;
            return ret;
        },
        __wbg_postMessage_af6209ddad5840b9: function() { return handleError(function (arg0, arg1) {
            arg0.postMessage(arg1);
        }, arguments); },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_f034d444741426c3: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_push_a6f9488ffd3fae3b: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_queueMicrotask_2c8dfd1056f24fdc: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_queueMicrotask_8985ad63815852e7: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_read_ce13639cf26d6554: function() { return handleError(function (arg0) {
            const ret = arg0.read();
            return ret;
        }, arguments); },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_resolve_5d61e0d10c14730a: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_set_4c81cfb5dc3a333c: function(arg0, arg1, arg2) {
            arg0[arg1 >>> 0] = arg2;
        },
        __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
            arg0[arg1] = arg2;
        },
        __wbg_set_bad5c505cc70b5f8: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_set_name_64dfe9f26c661077: function(arg0, arg1, arg2) {
            arg0.name = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_onmessage_a073f657459fcfe6: function(arg0, arg1) {
            arg0.onmessage = arg1;
        },
        __wbg_set_type_237f99ae058909d5: function(arg0, arg1) {
            arg0.type = __wbindgen_enum_WorkerType[arg1];
        },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_startSpawnerWorker_185ed7a4c4d6b068: function(arg0, arg1, arg2) {
            const ret = startSpawnerWorker(arg0, arg1, Spawner.__wrap(arg2));
            return ret;
        },
        __wbg_static_accessor_GLOBAL_THIS_14325d8cca34bb77: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_f3a1e69f9c5a7e8e: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_50cdb5b517789aca: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_d6c4126e4c244380: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_subarray_7ad5f01d4a9c1c4d: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_then_6e88c9d5b003f517: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_then_d4163530723f56f4: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_then_f1c954fe00733701: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_timeOrigin_f3d5cb4f4a06c2b7: function(arg0) {
            const ret = arg0.timeOrigin;
            return ret;
        },
        __wbg_value_667dcb90597486a6: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbg_value_ad1c1726993ce63e: function(arg0) {
            const ret = arg0.value;
            return ret;
        },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbg_waitAsync_207a52eee200ef0a: function(arg0, arg1, arg2) {
            const ret = Atomics.waitAsync(arg0, arg1 >>> 0, arg2);
            return ret;
        },
        __wbg_waitAsync_f6c74926be2d0dac: function() {
            const ret = Atomics.waitAsync;
            return ret;
        },
        __wbg_write_65c545b6209ff3b9: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.write(arg1);
            return ret;
        }, arguments); },
        __wbindgen_cast_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 1679, function: Function { arguments: [Externref], shim_idx: 1680, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.wasm_bindgen_ac83de04fc99fbbd___closure__destroy___dyn_core_a0678809250066c8___ops__function__FnMut__wasm_bindgen_ac83de04fc99fbbd___JsValue____Output_______, wasm_bindgen_ac83de04fc99fbbd___convert__closures_____invoke___wasm_bindgen_ac83de04fc99fbbd___JsValue_____);
            return ret;
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 3749, function: Function { arguments: [Externref], shim_idx: 3750, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.wasm_bindgen_ac83de04fc99fbbd___closure__destroy___dyn_core_a0678809250066c8___ops__function__FnMut__wasm_bindgen_ac83de04fc99fbbd___JsValue____Output___core_a0678809250066c8___result__Result_____wasm_bindgen_ac83de04fc99fbbd___JsError___, wasm_bindgen_ac83de04fc99fbbd___convert__closures_____invoke___wasm_bindgen_ac83de04fc99fbbd___JsValue__core_a0678809250066c8___result__Result_____wasm_bindgen_ac83de04fc99fbbd___JsError__);
            return ret;
        },
        __wbindgen_cast_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { dtor_idx: 3749, function: Function { arguments: [NamedExternref("MessageEvent")], shim_idx: 3752, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm.wasm_bindgen_ac83de04fc99fbbd___closure__destroy___dyn_core_a0678809250066c8___ops__function__FnMut__wasm_bindgen_ac83de04fc99fbbd___JsValue____Output___core_a0678809250066c8___result__Result_____wasm_bindgen_ac83de04fc99fbbd___JsError___, wasm_bindgen_ac83de04fc99fbbd___convert__closures_____invoke___web_sys_a252a7efd31eb9c9___features__gen_MessageEvent__MessageEvent_____);
            return ret;
        },
        __wbindgen_cast_0000000000000004: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000005: function(arg0) {
            // Cast intrinsic for `I64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_cast_0000000000000006: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000007: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_cast_0000000000000008: function(arg0) {
            // Cast intrinsic for `U64 -> Externref`.
            const ret = BigInt.asUintN(64, arg0);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
        __wbindgen_link_922dd8fcb05d94cd: function(arg0) {
            const val = `onmessage = function (ev) {
                let [ia, index, value] = ev.data;
                ia = new Int32Array(ia.buffer);
                let result = Atomics.wait(ia, index, value);
                postMessage(result);
            };
            `;
            const ret = typeof URL.createObjectURL === 'undefined' ? "data:application/javascript," + encodeURIComponent(val) : URL.createObjectURL(new Blob([val], { type: "text/javascript" }));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        memory: memory || new WebAssembly.Memory({initial:226,maximum:65536,shared:true}),
    };
    return {
        __proto__: null,
        "./tlsn_wasm_bg.js": import0,
    };
}

function wasm_bindgen_ac83de04fc99fbbd___convert__closures_____invoke___wasm_bindgen_ac83de04fc99fbbd___JsValue_____(arg0, arg1, arg2) {
    wasm.wasm_bindgen_ac83de04fc99fbbd___convert__closures_____invoke___wasm_bindgen_ac83de04fc99fbbd___JsValue_____(arg0, arg1, arg2);
}

function wasm_bindgen_ac83de04fc99fbbd___convert__closures_____invoke___web_sys_a252a7efd31eb9c9___features__gen_MessageEvent__MessageEvent_____(arg0, arg1, arg2) {
    wasm.wasm_bindgen_ac83de04fc99fbbd___convert__closures_____invoke___web_sys_a252a7efd31eb9c9___features__gen_MessageEvent__MessageEvent_____(arg0, arg1, arg2);
}

function wasm_bindgen_ac83de04fc99fbbd___convert__closures_____invoke___wasm_bindgen_ac83de04fc99fbbd___JsValue__core_a0678809250066c8___result__Result_____wasm_bindgen_ac83de04fc99fbbd___JsError__(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_ac83de04fc99fbbd___convert__closures_____invoke___wasm_bindgen_ac83de04fc99fbbd___JsValue__core_a0678809250066c8___result__Result_____wasm_bindgen_ac83de04fc99fbbd___JsError__(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_ac83de04fc99fbbd___convert__closures_____invoke___js_sys_c035ef050bbf6fd2___Function_fn_wasm_bindgen_ac83de04fc99fbbd___JsValue_____wasm_bindgen_ac83de04fc99fbbd___sys__Undefined___js_sys_c035ef050bbf6fd2___Function_fn_wasm_bindgen_ac83de04fc99fbbd___JsValue_____wasm_bindgen_ac83de04fc99fbbd___sys__Undefined______(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen_ac83de04fc99fbbd___convert__closures_____invoke___js_sys_c035ef050bbf6fd2___Function_fn_wasm_bindgen_ac83de04fc99fbbd___JsValue_____wasm_bindgen_ac83de04fc99fbbd___sys__Undefined___js_sys_c035ef050bbf6fd2___Function_fn_wasm_bindgen_ac83de04fc99fbbd___JsValue_____wasm_bindgen_ac83de04fc99fbbd___sys__Undefined______(arg0, arg1, arg2, arg3);
}


const __wbindgen_enum_WorkerType = ["classic", "module"];
const ProverFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_prover_free(ptr >>> 0, 1));
const SpawnerFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_spawner_free(ptr >>> 0, 1));
const VerifierFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_verifier_free(ptr >>> 0, 1));
const WorkerDataFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_workerdata_free(ptr >>> 0, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => state.dtor(state.a, state.b));

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer !== wasm.memory.buffer) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.buffer !== wasm.memory.buffer) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, dtor, f) {
    const state = { a: arg0, b: arg1, cnt: 1, dtor };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            state.dtor(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : undefined);
if (cachedTextDecoder) cachedTextDecoder.decode();

const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().slice(ptr, ptr + len));
}

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder() : undefined);

if (cachedTextEncoder) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module, thread_stack_size) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    if (typeof thread_stack_size !== 'undefined' && (typeof thread_stack_size !== 'number' || thread_stack_size === 0 || thread_stack_size % 65536 !== 0)) {
        throw new Error('invalid stack size');
    }

    wasm.__wbindgen_start(thread_stack_size);
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module, memory) {
    if (wasm !== undefined) return wasm;

    let thread_stack_size
    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module, memory, thread_stack_size} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports(memory);
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module, thread_stack_size);
}

async function __wbg_init(module_or_path, memory) {
    if (wasm !== undefined) return wasm;

    let thread_stack_size
    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path, memory, thread_stack_size} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('tlsn_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports(memory);

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module, thread_stack_size);
}

export { initSync, __wbg_init as default };
