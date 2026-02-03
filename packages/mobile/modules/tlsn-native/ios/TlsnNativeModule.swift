import ExpoModulesCore
import os.log

// The tlsn_mobile.swift file is compiled together with this module,
// making initialize(), prove(), HttpHeader, etc. available as top-level symbols.

private let logger = OSLog(subsystem: "com.tlsn.mobile", category: "TlsnNative")

public class TlsnNativeModule: Module {
    public func definition() -> ModuleDefinition {
        Name("TlsnNative")

        // Initialize the TLSN library
        Function("initialize") {
            do {
                try initialize()
            } catch {
                throw Exception(name: "TlsnError", description: "Failed to initialize: \(error)")
            }
        }

        // High-level prove function that matches the React Native interface
        AsyncFunction("prove") { (requestDict: [String: Any], optionsDict: [String: Any], promise: Promise) in
            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    // Parse HTTP request
                    guard let url = requestDict["url"] as? String,
                          let method = requestDict["method"] as? String else {
                        promise.reject("InvalidRequest", "Missing url or method")
                        return
                    }

                    var headers: [HttpHeader] = []
                    if let headersDict = requestDict["headers"] as? [String: String] {
                        for (name, value) in headersDict {
                            headers.append(HttpHeader(name: name, value: value))
                        }
                    }

                    let body = requestDict["body"] as? String

                    let request = HttpRequest(
                        url: url,
                        method: method,
                        headers: headers,
                        body: body
                    )

                    // Parse prover options
                    guard let verifierUrl = optionsDict["verifierUrl"] as? String,
                          let proxyUrl = optionsDict["proxyUrl"] as? String else {
                        promise.reject("InvalidOptions", "Missing verifierUrl or proxyUrl")
                        return
                    }

                    let maxSentData = (optionsDict["maxSentData"] as? NSNumber)?.uint32Value ?? 4096
                    let maxRecvData = (optionsDict["maxRecvData"] as? NSNumber)?.uint32Value ?? 16384

                    // Parse handlers for selective disclosure
                    var handlers: [Handler] = []
                    print("[TlsnNative] optionsDict keys: \(optionsDict.keys)")
                    print("[TlsnNative] handlers raw value: \(String(describing: optionsDict["handlers"]))")

                    if let handlersArray = optionsDict["handlers"] as? [[String: Any]] {
                        print("[TlsnNative] Found \(handlersArray.count) handlers to parse")
                        for (index, handlerDict) in handlersArray.enumerated() {
                            print("[TlsnNative] Handler \(index) dict: \(handlerDict)")

                            guard let handlerTypeStr = handlerDict["handlerType"] as? String else {
                                print("[TlsnNative] Handler \(index): missing handlerType")
                                continue
                            }
                            guard let partStr = handlerDict["part"] as? String else {
                                print("[TlsnNative] Handler \(index): missing part")
                                continue
                            }
                            guard let actionStr = handlerDict["action"] as? String else {
                                print("[TlsnNative] Handler \(index): missing action")
                                continue
                            }

                            print("[TlsnNative] Handler \(index): type=\(handlerTypeStr), part=\(partStr), action=\(actionStr)")

                            // Parse handler type
                            let handlerType: HandlerType
                            switch handlerTypeStr {
                            case "Sent": handlerType = .sent
                            case "Recv": handlerType = .recv
                            default:
                                print("[TlsnNative] Handler \(index): unknown handlerType '\(handlerTypeStr)'")
                                continue
                            }

                            // Parse handler part
                            let part: HandlerPart
                            switch partStr {
                            case "StartLine": part = .startLine
                            case "Headers": part = .headers
                            case "Body": part = .body
                            case "All": part = .all
                            default:
                                print("[TlsnNative] Handler \(index): unknown part '\(partStr)'")
                                continue
                            }

                            // Parse handler action
                            let action: HandlerAction
                            switch actionStr {
                            case "Reveal": action = .reveal
                            default:
                                print("[TlsnNative] Handler \(index): unknown action '\(actionStr)'")
                                continue
                            }

                            // Parse optional params
                            var params: HandlerParams? = nil
                            if let paramsDict = handlerDict["params"] as? [String: Any] {
                                let key = paramsDict["key"] as? String
                                let contentType = paramsDict["contentType"] as? String
                                let path = paramsDict["path"] as? String
                                params = HandlerParams(key: key, contentType: contentType, path: path)
                                print("[TlsnNative] Handler \(index) params: key=\(String(describing: key)), contentType=\(String(describing: contentType)), path=\(String(describing: path))")
                            }

                            handlers.append(Handler(handlerType: handlerType, part: part, action: action, params: params))
                            print("[TlsnNative] Handler \(index) successfully parsed")
                        }
                    } else {
                        print("[TlsnNative] Could not parse handlers array - checking raw type")
                        if let rawHandlers = optionsDict["handlers"] {
                            print("[TlsnNative] handlers type: \(type(of: rawHandlers))")
                        } else {
                            print("[TlsnNative] handlers key not found in optionsDict")
                        }
                    }

                    NSLog("[TlsnNative] Final handlers count: %d", handlers.count)
                    os_log("[TlsnNative] Handlers to Rust: %d", log: logger, type: .info, handlers.count)

                    let options = ProverOptions(
                        verifierUrl: verifierUrl,
                        proxyUrl: proxyUrl,
                        maxSentData: maxSentData,
                        maxRecvData: maxRecvData,
                        handlers: handlers
                    )

                    // Call the prove function
                    let result = try prove(request: request, options: options)

                    // Convert response headers to dictionary
                    var responseHeaders: [[String: String]] = []
                    for header in result.response.headers {
                        responseHeaders.append(["name": header.name, "value": header.value])
                    }

                    // Parse response body as JSON if possible
                    var bodyJson: Any = result.response.body
                    if let jsonData = result.response.body.data(using: .utf8),
                       let json = try? JSONSerialization.jsonObject(with: jsonData) {
                        bodyJson = json
                    }

                    // Log transcript info
                    NSLog("[TlsnNative] Proof complete! Sent: %d bytes, Recv: %d bytes",
                          result.transcript.sent.count, result.transcript.recv.count)

                    // Build result dictionary
                    let resultDict: [String: Any] = [
                        "status": Int(result.response.status),
                        "headers": responseHeaders,
                        "body": bodyJson,
                        "transcript": [
                            "sentLength": result.transcript.sent.count,
                            "recvLength": result.transcript.recv.count
                        ],
                        "debug": [
                            "handlersPassedToRust": handlers.count,
                            "handlersReceivedByRust": result.handlersReceived
                        ]
                    ]

                    promise.resolve(resultDict)

                } catch let error as TlsnError {
                    promise.reject("TlsnError", "\(error)")
                } catch {
                    promise.reject("UnknownError", error.localizedDescription)
                }
            }
        }

        // Check if native module is available
        Function("isAvailable") { () -> Bool in
            return true
        }
    }
}
