package expo.modules.quickjsnative

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import kotlinx.coroutines.*

/**
 * Expo module that wraps QuickJS C engine for sandboxed JavaScript evaluation on Android.
 *
 * Uses JNI to bridge between Kotlin and the QuickJS C library.
 */
class QuickJSNativeModule : Module() {
    private val bridge = QuickJSBridge()
    private val activeContexts = mutableSetOf<String>()
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun definition() = ModuleDefinition {
        Name("QuickJSNative")

        Events("hostFunctionCall")

        OnDestroy {
            // Clean up all contexts
            for (contextId in activeContexts.toList()) {
                try {
                    bridge.nativeDisposeContext(contextId)
                } catch (e: Exception) {
                    // Ignore cleanup errors
                }
            }
            activeContexts.clear()
            scope.cancel()
        }

        Function("createContext") {
            val contextId = bridge.nativeCreateContext()
            if (contextId.isNotEmpty()) {
                activeContexts.add(contextId)
            }
            contextId
        }

        AsyncFunction("evalCode") { contextId: String, code: String, promise: Promise ->
            if (contextId !in activeContexts) {
                promise.reject("QuickJSError", "Context not found: $contextId", null)
                return@AsyncFunction
            }

            scope.launch {
                try {
                    val result = bridge.nativeEvalCode(contextId, code)
                    promise.resolve(result)
                } catch (e: Exception) {
                    promise.reject("QuickJSEvalError", e.message ?: "Unknown error", e)
                }
            }
        }

        Function("registerHostFunction") { contextId: String, name: String ->
            if (contextId !in activeContexts) {
                throw Exception("Context not found: $contextId")
            }

            // Install the host call bridge and wrapper function in the sandbox
            val bridgeCode = """
                if (typeof __hostCall__ === 'undefined') {
                    var _pendingResolvers = {};
                    var _callId = 0;

                    globalThis.__registerPendingCall = function(id, resolve, reject) {
                        _pendingResolvers[id] = { resolve: resolve, reject: reject };
                    };

                    globalThis.__resolvePendingCall = function(id, result) {
                        var p = _pendingResolvers[id];
                        if (p) {
                            delete _pendingResolvers[id];
                            p.resolve(result);
                        }
                    };

                    globalThis.__rejectPendingCall = function(id, error) {
                        var p = _pendingResolvers[id];
                        if (p) {
                            delete _pendingResolvers[id];
                            p.reject(typeof error === 'string' ? new Error(error) : error);
                        }
                    };

                    globalThis.__hostCallQueue = [];

                    globalThis.__hostCall__ = function(functionName, args) {
                        _callId++;
                        var id = "$contextId-call-" + _callId;
                        __hostCallQueue.push({
                            callId: id,
                            functionName: functionName,
                            argsJson: JSON.stringify(args)
                        });
                        return new Promise(function(resolve, reject) {
                            __registerPendingCall(id, resolve, reject);
                        });
                    };
                }

                env.$name = function() {
                    var args = [];
                    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
                    return __hostCall__("$name", args);
                };
            """.trimIndent()

            bridge.nativeEvalCode(contextId, bridgeCode)
        }

        Function("resolveHostCall") { contextId: String, callId: String, resultJson: String ->
            if (contextId !in activeContexts) return@Function

            val code = "__resolvePendingCall('$callId', $resultJson);"
            bridge.nativeResolvePromise(contextId, code)
        }

        Function("rejectHostCall") { contextId: String, callId: String, errorMessage: String ->
            if (contextId !in activeContexts) return@Function

            val escapedMsg = errorMessage.replace("'", "\\'").replace("\\", "\\\\")
            val code = "__rejectPendingCall('$callId', '$escapedMsg');"
            bridge.nativeResolvePromise(contextId, code)
        }

        Function("disposeContext") { contextId: String ->
            if (contextId in activeContexts) {
                bridge.nativeDisposeContext(contextId)
                activeContexts.remove(contextId)
            }
        }

        Function("isAvailable") {
            true
        }
    }
}
