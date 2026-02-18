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

        AsyncFunction("prove") { requestMap: Map<String, Any?>, optionsMap: Map<String, Any?>, promise: Promise ->
            Thread {
                try {
                    // Parse HTTP request
                    val url = requestMap["url"] as? String
                        ?: return@Thread promise.reject("InvalidRequest", "Missing url", null)
                    val method = requestMap["method"] as? String
                        ?: return@Thread promise.reject("InvalidRequest", "Missing method", null)

                    val headers = mutableListOf<HttpHeader>()
                    @Suppress("UNCHECKED_CAST")
                    val headersMap = requestMap["headers"] as? Map<String, String> ?: emptyMap()
                    for ((name, value) in headersMap) {
                        headers.add(HttpHeader(name, value))
                    }

                    val body = requestMap["body"] as? String

                    val request = HttpRequest(
                        url = url,
                        method = method,
                        headers = headers,
                        body = body
                    )

                    // Parse prover options
                    val verifierUrl = optionsMap["verifierUrl"] as? String
                        ?: return@Thread promise.reject("InvalidOptions", "Missing verifierUrl", null)

                    val maxSentData = (optionsMap["maxSentData"] as? Number)?.toInt()?.toUInt() ?: 4096u
                    val maxRecvData = (optionsMap["maxRecvData"] as? Number)?.toInt()?.toUInt() ?: 16384u

                    // Parse handlers for selective disclosure
                    val handlers = mutableListOf<Handler>()
                    @Suppress("UNCHECKED_CAST")
                    val handlersList = optionsMap["handlers"] as? List<Map<String, Any?>> ?: emptyList()

                    for ((index, handlerMap) in handlersList.withIndex()) {
                        val handlerTypeStr = handlerMap["handlerType"] as? String ?: continue
                        val partStr = handlerMap["part"] as? String ?: continue
                        val actionStr = handlerMap["action"] as? String ?: continue

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

                        @Suppress("UNCHECKED_CAST")
                        val paramsMap = handlerMap["params"] as? Map<String, Any?>
                        val params = if (paramsMap != null) {
                            HandlerParams(
                                key = paramsMap["key"] as? String,
                                hideKey = paramsMap["hideKey"] as? Boolean,
                                hideValue = paramsMap["hideValue"] as? Boolean,
                                contentType = paramsMap["contentType"] as? String,
                                path = paramsMap["path"] as? String,
                                regex = paramsMap["regex"] as? String,
                                flags = paramsMap["flags"] as? String
                            )
                        } else {
                            null
                        }

                        handlers.add(Handler(handlerType, part, action, params))
                        android.util.Log.i("TlsnNative", "Handler $index: type=$handlerTypeStr, part=$partStr, action=$actionStr")
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
