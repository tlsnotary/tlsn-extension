//! TLSNotary Prover Implementation

use crate::{
    io_adapters::{HyperIo, WsStreamAdapter},
    Handler, HandlerPart, HandlerType, HttpHeader, HttpRequest, HttpResponse, ProofResult,
    ProverOptions, TlsnError, Transcript,
};
use bytes::Bytes;
use futures::{SinkExt, StreamExt, TryFutureExt};
use http_body_util::{BodyExt, Full};
use tls_client_async::TlsConnection;
use tlsn::{
    config::{
        prove::ProveConfig,
        tls::TlsClientConfig,
        tls_commit::{mpc::MpcTlsConfig, TlsCommitConfig},
    },
    connection::ServerName,
    webpki::RootCertStore,
    Session,
};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tokio_util::compat::{FuturesAsyncReadCompatExt, TokioAsyncReadCompatExt};
use url::Url;

/// High-level async prove function
pub async fn prove_async(request: HttpRequest, options: ProverOptions) -> Result<ProofResult, TlsnError> {
    // Capture handler count immediately - before any potential issues
    let handlers_received = options.handlers.len() as u32;

    println!("[TLSN-RUST] Starting proof for {}", request.url);
    println!("[TLSN-RUST] ====================================");
    println!("[TLSN-RUST] HANDLERS RECEIVED: {} (captured as {})", options.handlers.len(), handlers_received);
    for (i, h) in options.handlers.iter().enumerate() {
        println!("[TLSN-RUST]   Handler[{}]: type={:?}, part={:?}, action={:?}", i, h.handler_type, h.part, h.action);
    }
    println!("[TLSN-RUST] ====================================");
    tracing::info!("Starting proof for {}", request.url);

    // Parse URL to get hostname
    let url = Url::parse(&request.url)
        .map_err(|e| TlsnError::InvalidConfig(format!("Invalid URL: {}", e)))?;
    let hostname = url.host_str().unwrap_or("localhost").to_string();

    // Configure TLS commit (MPC parameters)
    let tls_commit_config = TlsCommitConfig::builder()
        .protocol(
            MpcTlsConfig::builder()
                .max_sent_data(options.max_sent_data as usize)
                .max_recv_data(options.max_recv_data as usize)
                .build()
                .map_err(|e| TlsnError::SetupFailed(e.to_string()))?
        )
        .build()
        .map_err(|e| TlsnError::SetupFailed(e.to_string()))?;

    // Convert verifier URL to WebSocket URL
    let verifier_url = Url::parse(&options.verifier_url)
        .map_err(|e| TlsnError::InvalidConfig(format!("Invalid verifier URL: {}", e)))?;

    let ws_protocol = if verifier_url.scheme() == "https" { "wss" } else { "ws" };
    let base_ws_url = format!(
        "{}://{}{}",
        ws_protocol,
        verifier_url.host_str().unwrap_or("localhost"),
        verifier_url.port().map(|p| format!(":{}", p)).unwrap_or_default()
    );

    // Step 1: Connect to /session endpoint and register
    let session_ws_url = format!("{}/session", base_ws_url);
    tracing::info!("Connecting to session endpoint: {}", session_ws_url);

    let (mut session_ws, _) = connect_async(&session_ws_url)
        .await
        .map_err(|e| TlsnError::ConnectionFailed(format!("Failed to connect to session: {}", e)))?;

    tracing::info!("Connected to session endpoint, registering...");

    // Send register message
    let register_msg = serde_json::json!({
        "type": "register",
        "maxRecvData": options.max_recv_data,
        "maxSentData": options.max_sent_data,
        "sessionData": {}
    });
    session_ws.send(Message::Text(register_msg.to_string().into()))
        .await
        .map_err(|e| TlsnError::ConnectionFailed(format!("Failed to send register message: {}", e)))?;

    // Wait for session_registered response (keep session_ws for later)
    let (session_id, mut session_ws) = {
        let mut ws = session_ws;
        let id = loop {
            match ws.next().await {
                Some(Ok(Message::Text(text))) => {
                    let response: serde_json::Value = serde_json::from_str(&text)
                        .map_err(|e| TlsnError::ConnectionFailed(format!("Invalid JSON response: {}", e)))?;

                    if response["type"] == "session_registered" {
                        let id = response["sessionId"].as_str()
                            .ok_or_else(|| TlsnError::ConnectionFailed("Missing sessionId".to_string()))?
                            .to_string();
                        tracing::info!("Got session ID: {}", id);
                        break id;
                    } else if response["type"] == "error" {
                        return Err(TlsnError::ConnectionFailed(
                            response["message"].as_str().unwrap_or("Unknown error").to_string()
                        ));
                    }
                }
                Some(Ok(_)) => continue, // Skip non-text messages
                Some(Err(e)) => return Err(TlsnError::ConnectionFailed(format!("WebSocket error: {}", e))),
                None => return Err(TlsnError::ConnectionFailed("Session WebSocket closed unexpectedly".to_string())),
            }
        };
        (id, ws)
    };

    // Step 2: Connect to /verifier endpoint with session ID
    let verifier_ws_url = format!("{}/verifier?sessionId={}", base_ws_url, session_id);
    tracing::info!("Connecting to verifier: {}", verifier_ws_url);

    let (verifier_ws, _) = connect_async(&verifier_ws_url)
        .await
        .map_err(|e| TlsnError::ConnectionFailed(format!("Failed to connect to verifier: {}", e)))?;

    tracing::info!("Connected to verifier");

    // Create session with verifier
    let verifier_io = WsStreamAdapter::new(verifier_ws).compat();
    let session = Session::new(verifier_io);
    let (driver, mut handle) = session.split();

    // Spawn session driver
    let driver_handle = tokio::spawn(async move {
        if let Err(e) = driver.await {
            tracing::error!("Session driver error: {}", e);
        }
    });

    // Create prover
    let prover_config = tlsn::config::prover::ProverConfig::builder()
        .build()
        .map_err(|e| TlsnError::SetupFailed(e.to_string()))?;

    let prover = handle
        .new_prover(prover_config)
        .map_err(|e| TlsnError::SetupFailed(e.to_string()))?;

    tracing::info!("Performing MPC setup...");

    // Commit to TLS configuration (performs MPC setup)
    let prover = prover
        .commit(tls_commit_config)
        .await
        .map_err(|e| TlsnError::SetupFailed(format!("MPC setup failed: {}", e)))?;

    tracing::info!("MPC setup complete, connecting to server proxy");

    // Configure TLS client
    let tls_config = TlsClientConfig::builder()
        .server_name(
            ServerName::Dns(
                hostname.clone().try_into()
                    .map_err(|_| TlsnError::InvalidConfig("Invalid server name".to_string()))?
            )
        )
        .root_store(RootCertStore::mozilla())
        .build()
        .map_err(|e| TlsnError::SetupFailed(e.to_string()))?;

    // Connect to server proxy via WebSocket
    let (server_ws, _) = connect_async(&options.proxy_url)
        .await
        .map_err(|e| TlsnError::ConnectionFailed(format!("Failed to connect to proxy: {}", e)))?;

    tracing::info!("Connected to proxy, establishing TLS connection");

    let server_io = WsStreamAdapter::new(server_ws).compat();

    // Connect TLS through the prover
    let (tls_conn, prover_fut) = prover
        .connect(tls_config, server_io)
        .await
        .map_err(|e| TlsnError::ConnectionFailed(format!("TLS connection failed: {}", e)))?;

    tracing::info!("TLS connection established, sending HTTP request");

    // Send HTTP request and get response
    let (response, mut prover) = futures::try_join!(
        send_http_request(tls_conn, &request),
        prover_fut.map_err(|e| TlsnError::RequestFailed(e.to_string()))
    )?;

    tracing::info!("HTTP response received: status {}", response.status);

    // Get transcript
    let transcript = prover.transcript();
    let sent_bytes = transcript.sent().to_vec();
    let recv_bytes = transcript.received().to_vec();

    tracing::info!(
        "Transcript: {} bytes sent, {} bytes received",
        sent_bytes.len(),
        recv_bytes.len()
    );

    // Configure proof reveal based on handlers
    let mut proof_builder = ProveConfig::builder(transcript);

    // Parse HTTP messages using spansy for range calculation
    let parsed_request = parse_request(&sent_bytes[..])
        .map_err(|e| TlsnError::ProofFailed(format!("Failed to parse HTTP request: {}", e)))?;
    let parsed_response = parse_response(&recv_bytes[..])
        .map_err(|e| TlsnError::ProofFailed(format!("Failed to parse HTTP response: {}", e)))?;

    // Calculate structure info for logging
    let sent_start_line_end = parsed_request.request.offset() + parsed_request.request.len();
    let sent_headers_start = parsed_request.headers.first().map(|h| h.offset()).unwrap_or(sent_start_line_end);
    let sent_headers_end = parsed_request.headers.last().map(|h| h.offset() + h.len()).unwrap_or(sent_headers_start);
    let sent_body_start = parsed_request.body.as_ref().map(|b| b.offset()).unwrap_or(sent_bytes.len());

    let recv_start_line_end = parsed_response.status.offset() + parsed_response.status.len();
    let recv_headers_start = parsed_response.headers.first().map(|h| h.offset()).unwrap_or(recv_start_line_end);
    let recv_headers_end = parsed_response.headers.last().map(|h| h.offset() + h.len()).unwrap_or(recv_headers_start);
    let recv_body_start = parsed_response.body.as_ref().map(|b| b.offset()).unwrap_or(recv_bytes.len());

    println!("[TLSN-RUST] ====== HTTP STRUCTURE (spansy) ======");
    println!("[TLSN-RUST] SENT ({} bytes total):", sent_bytes.len());
    println!("[TLSN-RUST]   StartLine: 0..{}", sent_start_line_end);
    println!("[TLSN-RUST]   Headers:   {}..{}", sent_headers_start, sent_headers_end);
    println!("[TLSN-RUST]   Body:      {}..{}", sent_body_start, sent_bytes.len());
    println!("[TLSN-RUST] RECV ({} bytes total):", recv_bytes.len());
    println!("[TLSN-RUST]   StartLine: 0..{}", recv_start_line_end);
    println!("[TLSN-RUST]   Headers:   {}..{}", recv_headers_start, recv_headers_end);
    println!("[TLSN-RUST]   Body:      {}..{}", recv_body_start, recv_bytes.len());
    println!("[TLSN-RUST] ============================");

    // Track what we're revealing for summary
    let mut sent_revealed: Vec<std::ops::Range<usize>> = Vec::new();
    let mut recv_revealed: Vec<std::ops::Range<usize>> = Vec::new();

    // DEBUG: Check handlers at reveal time
    println!("[TLSN-RUST] >>> REVEAL DECISION: handlers.len() = {}, is_empty() = {}",
             options.handlers.len(), options.handlers.is_empty());

    if options.handlers.is_empty() {
        // No handlers specified - reveal everything (backwards compatible)
        println!("[TLSN-RUST] No handlers specified, revealing ALL data in MPC");
        tracing::info!("No handlers specified, revealing all data in MPC");
        sent_revealed.push(0..sent_bytes.len());
        recv_revealed.push(0..recv_bytes.len());
        proof_builder.reveal_sent(&(0..sent_bytes.len()))
            .map_err(|e| TlsnError::ProofFailed(e.to_string()))?;
        proof_builder.reveal_recv(&(0..recv_bytes.len()))
            .map_err(|e| TlsnError::ProofFailed(e.to_string()))?;
    } else {
        // Build reveal ranges from handlers
        println!("[TLSN-RUST] Building MPC reveal ranges from {} handlers", options.handlers.len());
        tracing::info!("Building MPC reveal ranges from {} handlers", options.handlers.len());

        for handler in &options.handlers {
            match handler.handler_type {
                HandlerType::Sent => {
                    let range = match handler.part {
                        HandlerPart::StartLine => {
                            let start = parsed_request.request.offset();
                            let end = start + parsed_request.request.len();
                            start..end
                        }
                        HandlerPart::Headers => {
                            if let (Some(first), Some(last)) = (parsed_request.headers.first(), parsed_request.headers.last()) {
                                let start = first.offset();
                                let end = last.offset() + last.len();
                                start..end
                            } else {
                                continue; // No headers
                            }
                        }
                        HandlerPart::Body => {
                            if let Some(body) = &parsed_request.body {
                                let start = body.offset();
                                let end = start + body.len();
                                start..end
                            } else {
                                continue; // No body
                            }
                        }
                        HandlerPart::All => 0..sent_bytes.len(),
                    };
                    println!("[TLSN-RUST] MPC: Revealing SENT range {:?} for part {:?}", range, handler.part);
                    tracing::info!("MPC: Revealing SENT range {:?} for part {:?}", range, handler.part);
                    sent_revealed.push(range.clone());
                    proof_builder.reveal_sent(&range)
                        .map_err(|e| TlsnError::ProofFailed(e.to_string()))?;
                }
                HandlerType::Recv => {
                    let range = match handler.part {
                        HandlerPart::StartLine => {
                            let start = parsed_response.status.offset();
                            let end = start + parsed_response.status.len();
                            start..end
                        }
                        HandlerPart::Headers => {
                            // Check for specific header key
                            if let Some(params) = &handler.params {
                                if let Some(key) = &params.key {
                                    if let Some(header) = parsed_response.headers_with_name(key).next() {
                                        let start = header.offset();
                                        let end = start + header.len();
                                        start..end
                                    } else {
                                        println!("[TLSN-RUST] MPC: Header '{}' not found, skipping", key);
                                        tracing::warn!("MPC: Header '{}' not found, skipping", key);
                                        continue;
                                    }
                                } else {
                                    if let (Some(first), Some(last)) = (parsed_response.headers.first(), parsed_response.headers.last()) {
                                        let start = first.offset();
                                        let end = last.offset() + last.len();
                                        start..end
                                    } else {
                                        continue; // No headers
                                    }
                                }
                            } else {
                                if let (Some(first), Some(last)) = (parsed_response.headers.first(), parsed_response.headers.last()) {
                                    let start = first.offset();
                                    let end = last.offset() + last.len();
                                    start..end
                                } else {
                                    continue; // No headers
                                }
                            }
                        }
                        HandlerPart::Body => {
                            let body = match &parsed_response.body {
                                Some(b) => b,
                                None => continue, // No body
                            };

                            // Check for JSON path in params
                            if let Some(params) = &handler.params {
                                if params.content_type.as_deref() == Some("json") {
                                    if let Some(path) = &params.path {
                                        // Use spansy's JSON parsing if available
                                        if let BodyContent::Json(json_doc) = &body.content {
                                            if let Some(value) = json_doc.get(path) {
                                                let view = value.view();
                                                let start = view.offset();
                                                let end = start + view.len();
                                                println!("[TLSN-RUST] MPC: JSON path '{}' found at [{}, {})", path, start, end);
                                                start..end
                                            } else {
                                                println!("[TLSN-RUST] MPC: JSON path '{}' not found, skipping", path);
                                                continue;
                                            }
                                        } else {
                                            println!("[TLSN-RUST] MPC: Body not detected as JSON by spansy, skipping");
                                            continue;
                                        }
                                    } else {
                                        // JSON but no path - reveal full body
                                        let start = body.offset();
                                        let end = start + body.len();
                                        start..end
                                    }
                                } else {
                                    // Non-JSON content type - reveal full body
                                    let start = body.offset();
                                    let end = start + body.len();
                                    start..end
                                }
                            } else {
                                // No params - reveal full body
                                let start = body.offset();
                                let end = start + body.len();
                                start..end
                            }
                        }
                        HandlerPart::All => 0..recv_bytes.len(),
                    };
                    println!("[TLSN-RUST] MPC: Revealing RECV range {:?} for part {:?}", range, handler.part);
                    tracing::info!("MPC: Revealing RECV range {:?} for part {:?}", range, handler.part);
                    recv_revealed.push(range.clone());
                    proof_builder.reveal_recv(&range)
                        .map_err(|e| TlsnError::ProofFailed(e.to_string()))?;
                }
            }
        }
    }

    // Print summary
    println!("[TLSN-RUST] ====== MPC REVEAL SUMMARY ======");
    println!("[TLSN-RUST] SENT: {} ranges revealed", sent_revealed.len());
    for (i, r) in sent_revealed.iter().enumerate() {
        println!("[TLSN-RUST]   [{}] {}..{} ({} bytes)", i, r.start, r.end, r.end - r.start);
    }
    println!("[TLSN-RUST] RECV: {} ranges revealed", recv_revealed.len());
    for (i, r) in recv_revealed.iter().enumerate() {
        println!("[TLSN-RUST]   [{}] {}..{} ({} bytes)", i, r.start, r.end, r.end - r.start);
    }
    if sent_revealed.is_empty() {
        println!("[TLSN-RUST] ⚠️  NO SENT DATA REVEALED - Request will be redacted!");
    }
    println!("[TLSN-RUST] ================================");

    // Reveal server identity
    proof_builder.server_identity();

    let prove_config = proof_builder.build()
        .map_err(|e| TlsnError::ProofFailed(e.to_string()))?;

    tracing::info!("Generating proof...");

    // Generate proof
    prover
        .prove(&prove_config)
        .await
        .map_err(|e| TlsnError::ProofFailed(format!("Proof generation failed: {}", e)))?;

    tracing::info!("Proof generated, sending reveal config to verifier...");

    // Build reveal_config based on handlers
    let reveal_config_msg = build_reveal_config(&sent_bytes, &recv_bytes, &options.handlers)?;

    session_ws.send(Message::Text(reveal_config_msg.to_string().into()))
        .await
        .map_err(|e| TlsnError::ProofFailed(format!("Failed to send reveal config: {}", e)))?;

    tracing::info!("Reveal config sent, waiting for session completion...");

    // Wait for session_completed response
    loop {
        match session_ws.next().await {
            Some(Ok(Message::Text(text))) => {
                let response: serde_json::Value = serde_json::from_str(&text)
                    .map_err(|e| TlsnError::ProofFailed(format!("Invalid JSON response: {}", e)))?;

                if response["type"] == "session_completed" {
                    tracing::info!("Session completed successfully");
                    break;
                } else if response["type"] == "error" {
                    return Err(TlsnError::ProofFailed(
                        response["message"].as_str().unwrap_or("Unknown error").to_string()
                    ));
                }
            }
            Some(Ok(_)) => continue,
            Some(Err(e)) => return Err(TlsnError::ProofFailed(format!("WebSocket error: {}", e))),
            None => {
                tracing::warn!("Session WebSocket closed before completion");
                break;
            }
        }
    }

    // Close prover
    prover
        .close()
        .await
        .map_err(|e| TlsnError::ProofFailed(format!("Failed to close prover: {}", e)))?;

    // Close session handle
    handle.close();

    // Wait for driver to finish
    let _ = driver_handle.await;

    tracing::info!("Proof complete!");

    Ok(ProofResult {
        response,
        transcript: Transcript {
            sent: sent_bytes,
            recv: recv_bytes,
        },
        handlers_received,
    })
}

/// Send HTTP request through TLS connection
async fn send_http_request(conn: TlsConnection, request: &HttpRequest) -> Result<HttpResponse, TlsnError> {
    // Convert TlsConnection (futures::AsyncRead) to tokio-compatible, then wrap for hyper
    let conn = HyperIo::new(conn.compat());

    // Build hyper request
    let mut builder = hyper::Request::builder()
        .method(request.method.as_str())
        .uri(&request.url);

    for header in &request.headers {
        builder = builder.header(&header.name, &header.value);
    }

    let body = request.body.clone().unwrap_or_default();
    let hyper_request: hyper::Request<Full<Bytes>> = builder
        .body(Full::new(Bytes::from(body)))
        .map_err(|e| TlsnError::RequestFailed(format!("Failed to build request: {}", e)))?;

    // Perform HTTP/1.1 handshake
    let (mut request_sender, conn) = hyper::client::conn::http1::handshake(conn)
        .await
        .map_err(|e| TlsnError::RequestFailed(format!("HTTP handshake failed: {}", e)))?;

    // Spawn connection driver
    tokio::spawn(async move {
        if let Err(e) = conn.await {
            tracing::error!("HTTP connection error: {}", e);
        }
    });

    // Send request
    let response: hyper::Response<hyper::body::Incoming> = request_sender
        .send_request(hyper_request)
        .await
        .map_err(|e| TlsnError::RequestFailed(format!("Failed to send request: {}", e)))?;

    // Parse response
    let (parts, body) = response.into_parts();

    let body_bytes = body
        .collect()
        .await
        .map_err(|e| TlsnError::RequestFailed(format!("Failed to read response body: {}", e)))?
        .to_bytes();

    let headers: Vec<HttpHeader> = parts
        .headers
        .iter()
        .map(|(name, value): (&hyper::header::HeaderName, &hyper::header::HeaderValue)| HttpHeader {
            name: name.to_string(),
            value: value.to_str().unwrap_or("").to_string(),
        })
        .collect();

    Ok(HttpResponse {
        status: parts.status.as_u16(),
        headers,
        body: String::from_utf8_lossy(&body_bytes).to_string(),
    })
}

/// Range with handler for reveal config
#[derive(Debug, Clone, serde::Serialize)]
struct RangeWithHandler {
    start: usize,
    end: usize,
    handler: serde_json::Value,
}

use spansy::{Span, http::{parse_request, parse_response, BodyContent}};

/// Build reveal config from handlers using spansy for HTTP parsing
fn build_reveal_config(
    sent_bytes: &[u8],
    recv_bytes: &[u8],
    handlers: &[Handler],
) -> Result<serde_json::Value, TlsnError> {
    tracing::info!("Building reveal config with {} handlers", handlers.len());
    for (i, h) in handlers.iter().enumerate() {
        tracing::info!(
            "  Handler {}: type={:?}, part={:?}, params={:?}",
            i, h.handler_type, h.part, h.params
        );
    }

    // If no handlers, reveal everything
    if handlers.is_empty() {
        tracing::info!("No handlers specified, revealing everything");
        return Ok(serde_json::json!({
            "type": "reveal_config",
            "sent": [{
                "start": 0,
                "end": sent_bytes.len(),
                "handler": { "type": "SENT", "part": "ALL" }
            }],
            "recv": [{
                "start": 0,
                "end": recv_bytes.len(),
                "handler": { "type": "RECV", "part": "ALL" }
            }]
        }));
    }

    // Parse HTTP messages using spansy
    let request = parse_request(sent_bytes)
        .map_err(|e| TlsnError::ProofFailed(format!("Failed to parse HTTP request: {}", e)))?;
    let response = parse_response(recv_bytes)
        .map_err(|e| TlsnError::ProofFailed(format!("Failed to parse HTTP response: {}", e)))?;

    let mut sent_ranges: Vec<RangeWithHandler> = Vec::new();
    let mut recv_ranges: Vec<RangeWithHandler> = Vec::new();

    for handler in handlers {
        let part_str = match handler.part {
            HandlerPart::StartLine => "START_LINE",
            HandlerPart::Headers => "HEADERS",
            HandlerPart::Body => "BODY",
            HandlerPart::All => "ALL",
        };

        match handler.handler_type {
            HandlerType::Sent => {
                let range = match handler.part {
                    HandlerPart::StartLine => {
                        let start = request.request.offset();
                        let end = start + request.request.len();
                        (start, end)
                    }
                    HandlerPart::Headers => {
                        // Get range covering all headers
                        if let (Some(first), Some(last)) = (request.headers.first(), request.headers.last()) {
                            let start = first.offset();
                            let end = last.offset() + last.len();
                            (start, end)
                        } else {
                            continue; // No headers
                        }
                    }
                    HandlerPart::Body => {
                        if let Some(body) = &request.body {
                            let start = body.offset();
                            let end = start + body.len();
                            (start, end)
                        } else {
                            continue; // No body
                        }
                    }
                    HandlerPart::All => (0, sent_bytes.len()),
                };

                tracing::info!(
                    "Adding SENT range [{}, {}) for part {}",
                    range.0, range.1, part_str
                );
                sent_ranges.push(RangeWithHandler {
                    start: range.0,
                    end: range.1,
                    handler: serde_json::json!({
                        "type": "SENT",
                        "part": part_str
                    }),
                });
            }
            HandlerType::Recv => {
                let range = match handler.part {
                    HandlerPart::StartLine => {
                        let start = response.status.offset();
                        let end = start + response.status.len();
                        (start, end)
                    }
                    HandlerPart::Headers => {
                        // Check for specific header key in params
                        if let Some(params) = &handler.params {
                            if let Some(key) = &params.key {
                                if let Some(header) = response.headers_with_name(key).next() {
                                    let start = header.offset();
                                    let end = start + header.len();
                                    (start, end)
                                } else {
                                    tracing::warn!("Header '{}' not found in response", key);
                                    continue;
                                }
                            } else {
                                // Get range covering all headers
                                if let (Some(first), Some(last)) = (response.headers.first(), response.headers.last()) {
                                    let start = first.offset();
                                    let end = last.offset() + last.len();
                                    (start, end)
                                } else {
                                    continue; // No headers
                                }
                            }
                        } else {
                            // Get range covering all headers
                            if let (Some(first), Some(last)) = (response.headers.first(), response.headers.last()) {
                                let start = first.offset();
                                let end = last.offset() + last.len();
                                (start, end)
                            } else {
                                continue; // No headers
                            }
                        }
                    }
                    HandlerPart::Body => {
                        let body = match &response.body {
                            Some(b) => b,
                            None => {
                                tracing::warn!("No body in response, skipping Body handler");
                                continue;
                            }
                        };

                        // Check for JSON path in params
                        if let Some(params) = &handler.params {
                            if params.content_type.as_deref() == Some("json") {
                                if let Some(path) = &params.path {
                                    tracing::info!(
                                        "Looking for JSON path '{}' in body ({} bytes)",
                                        path,
                                        body.len()
                                    );

                                    // Use spansy's JSON parsing if available
                                    if let BodyContent::Json(json_doc) = &body.content {
                                        if let Some(value) = json_doc.get(path) {
                                            let view = value.view();
                                            let start = view.offset();
                                            let end = start + view.len();
                                            tracing::info!(
                                                "Found JSON path '{}' at [{}, {})",
                                                path, start, end
                                            );
                                            (start, end)
                                        } else {
                                            tracing::warn!(
                                                "JSON path '{}' not found in body, skipping handler",
                                                path
                                            );
                                            continue;
                                        }
                                    } else {
                                        // Body is not JSON, try to parse it manually
                                        tracing::warn!(
                                            "Body is not detected as JSON by spansy, skipping JSON path handler"
                                        );
                                        continue;
                                    }
                                } else {
                                    tracing::info!("No path specified for JSON body, revealing full body");
                                    let start = body.offset();
                                    let end = start + body.len();
                                    (start, end)
                                }
                            } else {
                                tracing::info!("Non-JSON body handler, revealing full body");
                                let start = body.offset();
                                let end = start + body.len();
                                (start, end)
                            }
                        } else {
                            tracing::info!("No params for Body handler, revealing full body");
                            let start = body.offset();
                            let end = start + body.len();
                            (start, end)
                        }
                    }
                    HandlerPart::All => (0, recv_bytes.len()),
                };

                tracing::info!(
                    "Adding RECV range [{}, {}) for part {}",
                    range.0, range.1, part_str
                );
                recv_ranges.push(RangeWithHandler {
                    start: range.0,
                    end: range.1,
                    handler: serde_json::json!({
                        "type": "RECV",
                        "part": part_str
                    }),
                });
            }
        }
    }

    tracing::info!(
        "Total ranges: {} sent, {} recv",
        sent_ranges.len(),
        recv_ranges.len()
    );

    // NOTE: We intentionally do NOT add fallback ranges here.
    // If handlers were specified but no ranges were added for a direction,
    // that direction will be fully redacted (not revealed).
    // The verifier will only see ranges that are explicitly added.

    let config = serde_json::json!({
        "type": "reveal_config",
        "sent": sent_ranges,
        "recv": recv_ranges
    });

    tracing::info!("Final reveal_config: {}", serde_json::to_string_pretty(&config).unwrap_or_default());

    Ok(config)
}
