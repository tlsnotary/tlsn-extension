package expo.modules.tlsnnative

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import uniffi.tlsn_mobile.HttpHeader
import uniffi.tlsn_mobile.HttpRequest
import uniffi.tlsn_mobile.ProverOptions
import uniffi.tlsn_mobile.Handler
import uniffi.tlsn_mobile.HandlerType
import uniffi.tlsn_mobile.HandlerPart
import uniffi.tlsn_mobile.HandlerAction
import uniffi.tlsn_mobile.HandlerParams
import uniffi.tlsn_mobile.initialize as rustInitialize
import uniffi.tlsn_mobile.prove as rustProve
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

class TlsnNativeModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("TlsnNative")

        Function("initialize") {
            rustInitialize()
        }

        // Accept JSON strings to avoid Expo Kotlin bridge type conversion issues
        // with nested objects. The JS side JSON.stringifies before calling.
        AsyncFunction("prove") { requestJson: String, optionsJson: String, promise: Promise ->
            Thread {
                try {
                    val requestObj = JSONObject(requestJson)
                    val optionsObj = JSONObject(optionsJson)

                    // Parse HTTP request
                    val url = requestObj.optString("url", "")
                        .ifEmpty { return@Thread promise.reject("InvalidRequest", "Missing url", null) }
                    val method = requestObj.optString("method", "")
                        .ifEmpty { return@Thread promise.reject("InvalidRequest", "Missing method", null) }

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

                    val request = HttpRequest(
                        url = url,
                        method = method,
                        headers = headers,
                        body = body
                    )

                    // Parse prover options
                    val verifierUrl = optionsObj.optString("verifierUrl", "")
                        .ifEmpty { return@Thread promise.reject("InvalidOptions", "Missing verifierUrl", null) }

                    val maxSentData = optionsObj.optInt("maxSentData", 4096).toUInt()
                    val maxRecvData = optionsObj.optInt("maxRecvData", 16384).toUInt()

                    // Parse handlers for selective disclosure
                    val handlers = mutableListOf<Handler>()
                    val handlersArray = optionsObj.optJSONArray("handlers")

                    if (handlersArray != null) {
                        for (index in 0 until handlersArray.length()) {
                            val handlerObj = handlersArray.getJSONObject(index)
                            val handlerTypeStr = handlerObj.optString("handlerType", "")
                            val partStr = handlerObj.optString("part", "")
                            val actionStr = handlerObj.optString("action", "")

                            if (handlerTypeStr.isEmpty() || partStr.isEmpty() || actionStr.isEmpty()) continue

                            val handlerType = when (handlerTypeStr) {
                                "Sent" -> HandlerType.SENT
                                "Recv" -> HandlerType.RECV
                                else -> continue
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
                                else -> continue
                            }

                            val action = when (actionStr) {
                                "Reveal" -> HandlerAction.REVEAL
                                "Pedersen" -> HandlerAction.PEDERSEN
                                else -> continue
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
                            } else {
                                null
                            }

                            handlers.add(Handler(handlerType, part, action, params))
                            android.util.Log.i("TlsnNative", "Handler $index: type=$handlerTypeStr, part=$partStr, action=$actionStr")
                        }
                    }

                    android.util.Log.i("TlsnNative", "Final handlers count: ${handlers.size}")

                    val options = ProverOptions(
                        verifierUrl = verifierUrl,
                        maxSentData = maxSentData,
                        maxRecvData = maxRecvData,
                        handlers = handlers
                    )

                    // Call the prove function
                    val result = rustProve(request, options)

                    // Convert response headers
                    val responseHeaders = result.response.headers.map { header ->
                        mapOf("name" to header.name, "value" to header.value)
                    }

                    // Parse response body as JSON, converting to native Map/List for Expo bridge
                    val bodyJson: Any = try {
                        jsonToNative(JSONObject(result.response.body))!!
                    } catch (_: Exception) {
                        try {
                            jsonToNative(JSONArray(result.response.body))!!
                        } catch (_: Exception) {
                            result.response.body
                        }
                    }

                    android.util.Log.i("TlsnNative",
                        "Proof complete! Sent: ${result.transcript.sent.size} bytes, Recv: ${result.transcript.recv.size} bytes")

                    // Build result dictionary
                    val resultMap = mapOf(
                        "status" to result.response.status.toInt(),
                        "headers" to responseHeaders,
                        "body" to bodyJson,
                        "transcript" to mapOf(
                            "sentLength" to result.transcript.sent.size,
                            "recvLength" to result.transcript.recv.size
                        ),
                        "debug" to mapOf(
                            "handlersPassedToRust" to handlers.size,
                            "handlersReceivedByRust" to result.handlersReceived.toInt()
                        )
                    )

                    promise.resolve(resultMap)

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
