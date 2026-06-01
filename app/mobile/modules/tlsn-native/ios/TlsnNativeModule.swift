import ExpoModulesCore
import os.log

// The tlsn_mobile.swift file is compiled together with this module,
// making initialize(), prove(), HttpHeader, etc. available as top-level symbols.

private let logger = OSLog(subsystem: "com.tlsn.mobile", category: "TlsnNative")

/// Bridge the UniFFI ProgressCallback interface to Expo event emission.
class SwiftProgressCallback: ProgressCallback {
    private let sendEvent: (_ name: String, _ body: [String: Any]) -> Void

    init(sendEvent: @escaping (_ name: String, _ body: [String: Any]) -> Void) {
        self.sendEvent = sendEvent
    }

    func onProgress(step: String, progress: Double, message: String) {
        sendEvent("onProveProgress", [
            "step": step,
            "progress": progress,
            "message": message
        ])
    }
}

// MARK: - Parsing helpers

private enum ParseError: Error {
    case missing(String)
    case invalid(String, String)
}

private func parseHttpRequest(_ dict: [String: Any]) throws -> HttpRequest {
    guard let url = dict["url"] as? String else { throw ParseError.missing("url") }
    guard let method = dict["method"] as? String else { throw ParseError.missing("method") }

    var headers: [HttpHeader] = []
    if let headersDict = dict["headers"] as? [String: String] {
        for (name, value) in headersDict {
            headers.append(HttpHeader(name: name, value: value))
        }
    }

    return HttpRequest(
        url: url,
        method: method,
        headers: headers,
        body: dict["body"] as? String
    )
}

private func parseProverOptions(_ dict: [String: Any]) throws -> ProverOptions {
    guard let verifierUrl = dict["verifierUrl"] as? String else {
        throw ParseError.missing("verifierUrl")
    }

    let maxSentData = (dict["maxSentData"] as? NSNumber)?.uint32Value ?? 4096
    let maxRecvData = (dict["maxRecvData"] as? NSNumber)?.uint32Value ?? 16384

    var handlers: [Handler] = []
    if let handlersArray = dict["handlers"] as? [[String: Any]] {
        for (index, handlerDict) in handlersArray.enumerated() {
            if let h = parseHandler(handlerDict, index: index) {
                handlers.append(h)
            }
        }
    }

    var mode: Mode? = nil
    if let modeStr = dict["mode"] as? String {
        switch modeStr {
        case "Mpc": mode = .mpc
        case "Proxy": mode = .proxy
        default:
            print("[TlsnNative] unknown mode '\(modeStr)', defaulting to Mpc")
        }
    }

    return ProverOptions(
        verifierUrl: verifierUrl,
        maxSentData: maxSentData,
        maxRecvData: maxRecvData,
        handlers: handlers,
        mode: mode
    )
}

private func parseHandler(_ dict: [String: Any], index: Int) -> Handler? {
    guard let handlerTypeStr = dict["handlerType"] as? String,
          let partStr = dict["part"] as? String,
          let actionDict = dict["action"] as? [String: Any],
          let actionType = actionDict["type"] as? String else {
        print("[TlsnNative] Handler \(index): missing required field")
        return nil
    }

    let handlerType: HandlerType
    switch handlerTypeStr {
    case "Sent": handlerType = .sent
    case "Recv": handlerType = .recv
    default: return nil
    }

    let part: HandlerPart
    switch partStr {
    case "StartLine": part = .startLine
    case "Protocol": part = .protocol
    case "Method": part = .method
    case "RequestTarget": part = .requestTarget
    case "StatusCode": part = .statusCode
    case "Headers": part = .headers
    case "Body": part = .body
    case "All": part = .all
    default: return nil
    }

    let action: HandlerAction
    switch actionType {
    case "Reveal":
        action = .reveal
    case "Hash":
        guard let algoStr = actionDict["algorithm"] as? String else { return nil }
        let algorithm: HashAlgorithm
        switch algoStr {
        case "Blake3": algorithm = .blake3
        case "Sha256": algorithm = .sha256
        case "Keccak256": algorithm = .keccak256
        default: return nil
        }
        action = .hash(algorithm: algorithm)
    default:
        return nil
    }

    var params: HandlerParams? = nil
    if let paramsDict = dict["params"] as? [String: Any] {
        params = HandlerParams(
            key: paramsDict["key"] as? String,
            hideKey: paramsDict["hideKey"] as? Bool,
            hideValue: paramsDict["hideValue"] as? Bool,
            contentType: paramsDict["contentType"] as? String,
            path: paramsDict["path"] as? String,
            regex: paramsDict["regex"] as? String,
            flags: paramsDict["flags"] as? String
        )
    }

    return Handler(handlerType: handlerType, part: part, action: action, params: params)
}

// MARK: - Result serialization

private func proofResultToDict(_ result: ProofResult, handlersPassed: Int) -> [String: Any] {
    var responseHeaders: [[String: String]] = []
    for header in result.response.headers {
        responseHeaders.append(["name": header.name, "value": header.value])
    }

    var bodyJson: Any = result.response.body
    if let jsonData = result.response.body.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: jsonData) {
        bodyJson = json
    }

    return [
        "status": Int(result.response.status),
        "headers": responseHeaders,
        "body": bodyJson,
        "transcript": [
            "sentLength": result.transcript.sent.count,
            "recvLength": result.transcript.recv.count
        ],
        "debug": [
            "handlersPassedToRust": handlersPassed,
            "handlersReceivedByRust": result.handlersReceived
        ]
    ]
}

private func revealPreparationToDict(_ prep: RevealPreparation) -> [String: Any] {
    var responseHeaders: [[String: String]] = []
    for header in prep.response.headers {
        responseHeaders.append(["name": header.name, "value": header.value])
    }

    var bodyJson: Any = prep.response.body
    if let jsonData = prep.response.body.data(using: .utf8),
       let json = try? JSONSerialization.jsonObject(with: jsonData) {
        bodyJson = json
    }

    let descriptors: [[String: Any]] = prep.descriptors.map { d in
        var entry: [String: Any] = [
            "direction": d.direction,
            "label": d.label,
            "action": d.action,
            "preview": d.preview
        ]
        if let alg = d.algorithm {
            entry["algorithm"] = alg
        }
        return entry
    }

    return [
        "sessionId": prep.sessionId,
        "response": [
            "status": Int(prep.response.status),
            "headers": responseHeaders,
            "body": bodyJson
        ],
        "descriptors": descriptors
    ]
}

// MARK: - Module

public class TlsnNativeModule: Module {
    public func definition() -> ModuleDefinition {
        Name("TlsnNative")

        Events("onProveProgress")

        Function("initialize") {
            do {
                try initialize()
            } catch {
                throw Exception(name: "TlsnError", description: "Failed to initialize: \(error)")
            }
        }

        // Drain buffered native tracing lines for the in-app Logs screen. The JS
        // side polls this; pulling keeps the prover's threads off the bridge.
        Function("drainNativeLogs") { () -> [[String: String]] in
            drainLogs().map { line in
                ["level": line.level, "target": line.target, "message": line.message]
            }
        }

        // Set native (tlsn) log verbosity at runtime, e.g. "tlsn_mobile=debug,tlsn=debug".
        Function("setLogLevel") { (filter: String) in
            setLogLevel(filter: filter)
        }

        // Legacy one-shot prove. Kept for backward compat.
        AsyncFunction("prove") { (requestDict: [String: Any], optionsDict: [String: Any], promise: Promise) in
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                do {
                    let request = try parseHttpRequest(requestDict)
                    let options = try parseProverOptions(optionsDict)
                    let handlersCount = options.handlers.count

                    let progressCallback = SwiftProgressCallback { name, body in
                        self?.sendEvent(name, body)
                    }

                    let result = try prove(request: request, options: options, progress: progressCallback)
                    NSLog("[TlsnNative] Proof complete! Sent: %d bytes, Recv: %d bytes",
                          result.transcript.sent.count, result.transcript.recv.count)
                    promise.resolve(proofResultToDict(result, handlersPassed: handlersCount))
                } catch let error as TlsnError {
                    promise.reject("TlsnError", "\(error)")
                } catch {
                    promise.reject("UnknownError", error.localizedDescription)
                }
            }
        }

        // Phase A: prove up to (but not including) reveal. Returns descriptors with
        // real byte previews of every range about to be revealed/hashed. Pair with
        // proveFinalize(sessionId, approved).
        AsyncFunction("proveUntilReveal") { (requestDict: [String: Any], optionsDict: [String: Any], promise: Promise) in
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                do {
                    let request = try parseHttpRequest(requestDict)
                    let options = try parseProverOptions(optionsDict)

                    let progressCallback = SwiftProgressCallback { name, body in
                        self?.sendEvent(name, body)
                    }

                    let prep = try proveUntilReveal(
                        request: request,
                        options: options,
                        progress: progressCallback
                    )
                    NSLog("[TlsnNative] proveUntilReveal complete: session=%@ descriptors=%d",
                          prep.sessionId, prep.descriptors.count)
                    promise.resolve(revealPreparationToDict(prep))
                } catch let error as TlsnError {
                    promise.reject("TlsnError", "\(error)")
                } catch {
                    promise.reject("UnknownError", error.localizedDescription)
                }
            }
        }

        // Phase B: finalize the prove (or drop it). Returns the proof result on
        // approval, or rejects with "User rejected reveal" on rejection.
        AsyncFunction("proveFinalize") { (sessionId: String, approved: Bool, promise: Promise) in
            DispatchQueue.global(qos: .userInitiated).async { [weak self] in
                do {
                    let progressCallback = SwiftProgressCallback { name, body in
                        self?.sendEvent(name, body)
                    }

                    let result = try proveFinalize(
                        sessionId: sessionId,
                        approved: approved,
                        progress: progressCallback
                    )
                    promise.resolve(proofResultToDict(result, handlersPassed: -1))
                } catch let error as TlsnError {
                    promise.reject("TlsnError", "\(error)")
                } catch {
                    promise.reject("UnknownError", error.localizedDescription)
                }
            }
        }

        Function("isAvailable") { () -> Bool in
            return true
        }
    }
}
