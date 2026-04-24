import ExpoModulesCore
import QuickJSBridge

/// An isolated QuickJS execution context wrapping a JSRuntime + JSContext pair.
class QuickJSContextWrapper {
    let id: String
    let runtime: OpaquePointer     // JSRuntime*
    let context: OpaquePointer     // JSContext*

    init(id: String) {
        self.id = id
        self.runtime = qjsb_new_runtime()
        self.context = qjsb_new_context(runtime)

        // Set up the `env` object that host functions will be attached to
        let global = qjsb_get_global_object(context)
        let envObj = qjsb_new_object(context)
        // set_property_str takes ownership of envObj — do not free it
        qjsb_set_property_str(context, global, "env", envObj)
        qjsb_free_value(context, global)
    }

    deinit {
        qjsb_free_context(context)
        qjsb_free_runtime(runtime)
    }
}

public class QuickJSNativeModule: Module {
    private var contexts: [String: QuickJSContextWrapper] = [:]
    private var contextCounter: Int = 0

    public func definition() -> ModuleDefinition {
        Name("QuickJSNative")

        Events("hostFunctionCall")

        OnDestroy {
            self.contexts.removeAll()
        }

        // Create a new isolated JS context
        Function("createContext") { () -> String in
            self.contextCounter += 1
            let id = "qjs-ctx-\(self.contextCounter)"
            let wrapper = QuickJSContextWrapper(id: id)
            self.contexts[id] = wrapper
            return id
        }

        // Evaluate JavaScript code in a context, returns JSON-stringified result
        AsyncFunction("evalCode") { (contextId: String, code: String, promise: Promise) in
            guard let wrapper = self.contexts[contextId] else {
                promise.reject("QuickJSError", "Context not found: \(contextId)")
                return
            }

            DispatchQueue.global(qos: .userInitiated).async {
                let ctx = wrapper.context
                let codeLen = code.utf8.count
                let result = qjsb_eval_global(ctx, code, codeLen, "<eval>")

                if qjsb_is_exception(result) != 0 {
                    let exception = qjsb_get_exception(ctx)
                    let errStr = self.jsValueToString(ctx, exception)
                    qjsb_free_value(ctx, exception)
                    promise.reject("QuickJSEvalError", errStr ?? "Unknown error")
                    return
                }

                // Serialize result to JSON string
                let jsonVal = qjsb_json_stringify(ctx, result)
                let resultString = self.jsValueToString(ctx, jsonVal) ?? "null"
                qjsb_free_value(ctx, jsonVal)
                qjsb_free_value(ctx, result)

                promise.resolve(resultString)
            }
        }

        // Register a host function on the `env` object.
        // Uses a JS-side bridge pattern (same as Android): __hostCall__ pushes
        // calls onto __hostCallQueue and returns a Promise. The TS layer polls
        // the queue after evalCode and emits events.
        Function("registerHostFunction") { (contextId: String, name: String) in
            guard let wrapper = self.contexts[contextId] else {
                throw Exception(name: "QuickJSError", description: "Context not found: \(contextId)")
            }

            let ctx = wrapper.context

            // Install the host call bridge and wrapper function in the sandbox
            let bridgeCode = """
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
                    var id = "\(wrapper.id)-call-" + _callId;
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

            env.\(name) = function() {
                var args = [];
                for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
                return __hostCall__("\(name)", args);
            };
            """

            let bridgeLen = bridgeCode.utf8.count
            let result = qjsb_eval_global(ctx, bridgeCode, bridgeLen, "<host-bridge>")
            if qjsb_is_exception(result) != 0 {
                let exception = qjsb_get_exception(ctx)
                let errStr = self.jsValueToString(ctx, exception) ?? "Failed to register host function"
                qjsb_free_value(ctx, exception)
                qjsb_free_value(ctx, result)
                throw Exception(name: "QuickJSError", description: errStr)
            }
            qjsb_free_value(ctx, result)
        }

        // Resolve a pending host function call by evaluating resolver code
        Function("resolveHostCall") { (contextId: String, callId: String, resultJson: String) in
            guard let wrapper = self.contexts[contextId] else { return }

            let ctx = wrapper.context
            let code = "__resolvePendingCall('\(callId)', \(resultJson));"
            let codeLen = code.utf8.count
            let result = qjsb_eval_global(ctx, code, codeLen, "<resolve>")
            qjsb_free_value(ctx, result)

            // Execute pending microtasks
            qjsb_execute_pending_jobs(wrapper.runtime)
        }

        // Reject a pending host function call
        Function("rejectHostCall") { (contextId: String, callId: String, errorMessage: String) in
            guard let wrapper = self.contexts[contextId] else { return }

            let ctx = wrapper.context
            let escapedMsg = errorMessage
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            let code = "__rejectPendingCall('\(callId)', '\(escapedMsg)');"
            let codeLen = code.utf8.count
            let result = qjsb_eval_global(ctx, code, codeLen, "<reject>")
            qjsb_free_value(ctx, result)

            // Execute pending microtasks
            qjsb_execute_pending_jobs(wrapper.runtime)
        }

        // Dispose a context (deinit handles QuickJS cleanup)
        Function("disposeContext") { (contextId: String) in
            self.contexts.removeValue(forKey: contextId)
        }

        // Check availability
        Function("isAvailable") { () -> Bool in
            return true
        }
    }

    // MARK: - Private Helpers

    /// Convert a JSValue to a Swift String
    private func jsValueToString(_ ctx: OpaquePointer, _ value: QuickJSBridge.JSValue) -> String? {
        guard let cStr = qjsb_to_cstring(ctx, value) else { return nil }
        let str = String(cString: cStr)
        qjsb_free_cstring(ctx, cStr)
        return str
    }
}
