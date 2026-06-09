package expo.modules.tlsnnative

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import uniffi.tlsn_mobile.HttpHeader
import uniffi.tlsn_mobile.HttpRequest
import uniffi.tlsn_mobile.Mode
import uniffi.tlsn_mobile.ProverOptions
import uniffi.tlsn_mobile.Handler
import uniffi.tlsn_mobile.HandlerType
import uniffi.tlsn_mobile.HandlerPart
import uniffi.tlsn_mobile.HandlerAction
import uniffi.tlsn_mobile.HandlerParams
import uniffi.tlsn_mobile.HashAlgorithm
import uniffi.tlsn_mobile.AssertOp
import uniffi.tlsn_mobile.AssertValueType
import uniffi.tlsn_mobile.ProgressCallback
import uniffi.tlsn_mobile.ProofResult
import uniffi.tlsn_mobile.RevealPreparation
import uniffi.tlsn_mobile.initialize as rustInitialize
import uniffi.tlsn_mobile.drainLogs as rustDrainLogs
import uniffi.tlsn_mobile.setLogLevel as rustSetLogLevel
import uniffi.tlsn_mobile.prove as rustProve
import uniffi.tlsn_mobile.proveUntilReveal as rustProveUntilReveal
import uniffi.tlsn_mobile.proveFinalize as rustProveFinalize
import org.json.JSONObject
import org.json.JSONArray

/** Convert org.json types to native Map/List that Expo can bridge to JS. */
private fun jsonToNative(value: Any?): Any? = when (value) {
    is JSONObject -> {
        val map = mutableMapOf<String, Any?>()
        for (key in value.keys()) {
            map[key] = jsonToNative(value.get(key))
        }
        map
    }
    is JSONArray -> {
        val list = mutableListOf<Any?>()
        for (i in 0 until value.length()) {
            list.add(jsonToNative(value.get(i)))
        }
        list
    }
    JSONObject.NULL -> null
    else -> value
}

private fun parseHttpRequest(requestObj: JSONObject): HttpRequest {
    val url = requestObj.optString("url", "")
    val method = requestObj.optString("method", "")

    val headers = mutableListOf<HttpHeader>()
    val headersJsonObj = requestObj.optJSONObject("headers")
    if (headersJsonObj != null) {
        for (name in headersJsonObj.keys()) {
            headers.add(HttpHeader(name, headersJsonObj.getString(name)))
        }
    }

    val body: String? = if (requestObj.has("body") && !requestObj.isNull("body")) {
        requestObj.getString("body")
    } else null

    return HttpRequest(url = url, method = method, headers = headers, body = body)
}

private fun parseProverOptions(optionsObj: JSONObject): ProverOptions {
    val verifierUrl = optionsObj.optString("verifierUrl", "")
    val maxSentData = optionsObj.optInt("maxSentData", 4096).toUInt()
    val maxRecvData = optionsObj.optInt("maxRecvData", 16384).toUInt()

    val handlers = mutableListOf<Handler>()
    val handlersArray = optionsObj.optJSONArray("handlers")
    if (handlersArray != null) {
        for (index in 0 until handlersArray.length()) {
            val handlerObj = handlersArray.getJSONObject(index)
            parseHandler(handlerObj)?.let { handlers.add(it) }
        }
    }

    val modeStr = optionsObj.optString("mode", "")
    val mode: Mode? = when (modeStr) {
        "Mpc" -> Mode.MPC
        "Proxy" -> Mode.PROXY
        "" -> null
        else -> {
            android.util.Log.w("TlsnNative", "unknown mode '$modeStr', defaulting to Mpc")
            null
        }
    }

    return ProverOptions(
        verifierUrl = verifierUrl,
        maxSentData = maxSentData,
        maxRecvData = maxRecvData,
        handlers = handlers,
        mode = mode
    )
}

private fun parseHandler(handlerObj: JSONObject): Handler? {
    val handlerTypeStr = handlerObj.optString("handlerType", "")
    val partStr = handlerObj.optString("part", "")
    val actionObj = handlerObj.optJSONObject("action") ?: return null
    val actionType = actionObj.optString("type", "")

    if (handlerTypeStr.isEmpty() || partStr.isEmpty() || actionType.isEmpty()) return null

    val handlerType = when (handlerTypeStr) {
        "Sent" -> HandlerType.SENT
        "Recv" -> HandlerType.RECV
        else -> return null
    }

    val part = when (partStr) {
        "StartLine" -> HandlerPart.START_LINE
        "Protocol" -> HandlerPart.PROTOCOL
        "Method" -> HandlerPart.METHOD
        "RequestTarget" -> HandlerPart.REQUEST_TARGET
        "StatusCode" -> HandlerPart.STATUS_CODE
        "Headers" -> HandlerPart.HEADERS
        "Body" -> HandlerPart.BODY
        "All" -> HandlerPart.ALL
        else -> return null
    }

    val action: HandlerAction = when (actionType) {
        "Reveal" -> HandlerAction.Reveal
        "Hash" -> {
            val algoStr = actionObj.optString("algorithm", "")
            val algorithm = when (algoStr) {
                "Blake3" -> HashAlgorithm.BLAKE3
                "Sha256" -> HashAlgorithm.SHA256
                "Keccak256" -> HashAlgorithm.KECCAK256
                else -> return null
            }
            HandlerAction.Hash(algorithm)
        }
        "Assert" -> {
            val op = when (actionObj.optString("op", "")) {
                "gt" -> AssertOp.GT
                "gte" -> AssertOp.GTE
                "lt" -> AssertOp.LT
                "lte" -> AssertOp.LTE
                "between" -> AssertOp.BETWEEN
                "in" -> AssertOp.IN
                else -> return null
            }
            val valueType = when (actionObj.optString("valueType", "")) {
                "number" -> AssertValueType.NUMBER
                "bigint" -> AssertValueType.BIGINT
                "date" -> AssertValueType.DATE
                "string" -> AssertValueType.STRING
                else -> null
            }
            // Operands arrive as strings; the verifier parses them per valueType.
            val value = if (actionObj.has("value")) actionObj.optString("value") else null
            val min = if (actionObj.has("min")) actionObj.optString("min") else null
            val max = if (actionObj.has("max")) actionObj.optString("max") else null
            val inclusive = if (actionObj.has("inclusive")) actionObj.optBoolean("inclusive") else null
            val values = actionObj.optJSONArray("values")?.let { arr ->
                (0 until arr.length()).map { arr.get(it).toString() }
            }
            HandlerAction.Assert(
                op = op,
                valueType = valueType,
                value = value,
                min = min,
                max = max,
                inclusive = inclusive,
                values = values
            )
        }
        else -> return null
    }

    val paramsObj = handlerObj.optJSONObject("params")
    val params = if (paramsObj != null) {
        HandlerParams(
            key = if (paramsObj.has("key")) paramsObj.optString("key") else null,
            hideKey = if (paramsObj.has("hideKey")) paramsObj.optBoolean("hideKey") else null,
            hideValue = if (paramsObj.has("hideValue")) paramsObj.optBoolean("hideValue") else null,
            contentType = if (paramsObj.has("contentType")) paramsObj.optString("contentType") else null,
            path = if (paramsObj.has("path")) paramsObj.optString("path") else null,
            regex = if (paramsObj.has("regex")) paramsObj.optString("regex") else null,
            flags = if (paramsObj.has("flags")) paramsObj.optString("flags") else null
        )
    } else null

    return Handler(handlerType, part, action, params)
}

private fun proofResultToMap(result: ProofResult, handlersPassed: Int): Map<String, Any> {
    val responseHeaders = result.response.headers.map { header ->
        mapOf("name" to header.name, "value" to header.value)
    }

    val bodyJson: Any = try {
        jsonToNative(JSONObject(result.response.body))!!
    } catch (_: Exception) {
        try { jsonToNative(JSONArray(result.response.body))!! } catch (_: Exception) { result.response.body }
    }

    return mapOf(
        "status" to result.response.status.toInt(),
        "headers" to responseHeaders,
        "body" to bodyJson,
        "transcript" to mapOf(
            "sentLength" to result.transcript.sent.size,
            "recvLength" to result.transcript.recv.size
        ),
        "debug" to mapOf(
            "handlersPassedToRust" to handlersPassed,
            "handlersReceivedByRust" to result.handlersReceived.toInt()
        )
    )
}

private fun revealPreparationToMap(prep: RevealPreparation): Map<String, Any> {
    val responseHeaders = prep.response.headers.map { h ->
        mapOf("name" to h.name, "value" to h.value)
    }
    val bodyJson: Any = try {
        jsonToNative(JSONObject(prep.response.body))!!
    } catch (_: Exception) {
        try { jsonToNative(JSONArray(prep.response.body))!! } catch (_: Exception) { prep.response.body }
    }
    val descriptors = prep.descriptors.map { d ->
        val entry = mutableMapOf<String, Any>(
            "direction" to d.direction,
            "label" to d.label,
            "action" to d.action,
            "preview" to d.preview
        )
        d.algorithm?.let { entry["algorithm"] = it }
        entry
    }
    return mapOf(
        "sessionId" to prep.sessionId,
        "response" to mapOf(
            "status" to prep.response.status.toInt(),
            "headers" to responseHeaders,
            "body" to bodyJson
        ),
        "descriptors" to descriptors
    )
}

class TlsnNativeModule : Module() {
    private fun makeProgressCallback(): ProgressCallback = object : ProgressCallback {
        override fun onProgress(step: String, progress: Double, message: String) {
            sendEvent("onProveProgress", mapOf(
                "step" to step,
                "progress" to progress,
                "message" to message
            ))
        }
    }

    override fun definition() = ModuleDefinition {
        Name("TlsnNative")

        // Declare events that can be sent to JS
        Events("onProveProgress")

        Function("initialize") {
            rustInitialize()
        }

        // Drain buffered native tracing lines for the in-app Logs screen. The JS
        // side polls this; pulling keeps the prover's threads off the bridge.
        Function("drainNativeLogs") {
            rustDrainLogs().map {
                mapOf("level" to it.level, "target" to it.target, "message" to it.message)
            }
        }

        // Set native (tlsn) log verbosity at runtime, e.g. "tlsn_mobile=debug,tlsn=debug".
        Function("setLogLevel") { filter: String ->
            rustSetLogLevel(filter)
        }

        // Accept JSON strings to avoid Expo Kotlin bridge type conversion issues
        // with nested objects. The JS side JSON.stringifies before calling.
        AsyncFunction("prove") { requestJson: String, optionsJson: String, promise: Promise ->
            Thread {
                try {
                    val request = parseHttpRequest(JSONObject(requestJson))
                    val options = parseProverOptions(JSONObject(optionsJson))
                    if (request.url.isEmpty()) {
                        return@Thread promise.reject("InvalidRequest", "Missing url", null)
                    }
                    if (request.method.isEmpty()) {
                        return@Thread promise.reject("InvalidRequest", "Missing method", null)
                    }
                    if (options.verifierUrl.isEmpty()) {
                        return@Thread promise.reject("InvalidOptions", "Missing verifierUrl", null)
                    }

                    val result = rustProve(request, options, makeProgressCallback())

                    android.util.Log.i("TlsnNative",
                        "Proof complete! Sent: ${result.transcript.sent.size} bytes, Recv: ${result.transcript.recv.size} bytes")

                    promise.resolve(proofResultToMap(result, options.handlers.size))

                } catch (e: uniffi.tlsn_mobile.TlsnException) {
                    promise.reject("TlsnError", "$e", null)
                } catch (e: Exception) {
                    promise.reject("UnknownError", e.localizedMessage, null)
                }
            }.start()
        }

        // Phase A: prove until reveal — JSON-string args (Android bridge ergonomics).
        AsyncFunction("proveUntilReveal") { requestJson: String, optionsJson: String, promise: Promise ->
            Thread {
                try {
                    val request = parseHttpRequest(JSONObject(requestJson))
                    val options = parseProverOptions(JSONObject(optionsJson))
                    if (request.url.isEmpty()) {
                        return@Thread promise.reject("InvalidRequest", "Missing url", null)
                    }
                    if (options.verifierUrl.isEmpty()) {
                        return@Thread promise.reject("InvalidOptions", "Missing verifierUrl", null)
                    }

                    val prep = rustProveUntilReveal(request, options, makeProgressCallback())
                    android.util.Log.i("TlsnNative",
                        "proveUntilReveal complete: session=${prep.sessionId} descriptors=${prep.descriptors.size}")
                    promise.resolve(revealPreparationToMap(prep))
                } catch (e: uniffi.tlsn_mobile.TlsnException) {
                    promise.reject("TlsnError", "$e", null)
                } catch (e: Exception) {
                    promise.reject("UnknownError", e.localizedMessage, null)
                }
            }.start()
        }

        // Phase B: finalize the prove (or drop it).
        AsyncFunction("proveFinalize") { sessionId: String, approved: Boolean, promise: Promise ->
            Thread {
                try {
                    val result = rustProveFinalize(sessionId, approved, makeProgressCallback())
                    promise.resolve(proofResultToMap(result, -1))
                } catch (e: uniffi.tlsn_mobile.TlsnException) {
                    promise.reject("TlsnError", "$e", null)
                } catch (e: Exception) {
                    promise.reject("UnknownError", e.localizedMessage, null)
                }
            }.start()
        }

        Function("isAvailable") {
            true
        }
    }
}
