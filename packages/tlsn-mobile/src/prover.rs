//! TLSNotary Prover Implementation

use crate::{
    Handler, HandlerPart, HandlerType, HttpHeader, HttpRequest, HttpResponse, ProofResult,
    ProverOptions, TlsnError, Transcript,
};
use bytes::Bytes;
use futures::{Sink, SinkExt, Stream, StreamExt, TryFutureExt};
use http_body_util::{BodyExt, Full};
use std::pin::Pin;
use std::task::{Context, Poll};
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
use tokio::io::{AsyncRead, AsyncWrite, ReadBuf};
use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::Message, MaybeTlsStream, WebSocketStream};
use tokio_util::compat::{FuturesAsyncReadCompatExt, TokioAsyncReadCompatExt};
use url::Url;

/// Wrapper to adapt WebSocket stream to AsyncRead + AsyncWrite
struct WsStreamAdapter {
    inner: WebSocketStream<MaybeTlsStream<TcpStream>>,
    read_buffer: Vec<u8>,
    read_offset: usize,
}

impl WsStreamAdapter {
    fn new(ws: WebSocketStream<MaybeTlsStream<TcpStream>>) -> Self {
        Self {
            inner: ws,
            read_buffer: Vec::new(),
            read_offset: 0,
        }
    }
}

impl AsyncRead for WsStreamAdapter {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        // If we have buffered data, return it
        if self.read_offset < self.read_buffer.len() {
            let remaining = &self.read_buffer[self.read_offset..];
            let to_copy = std::cmp::min(remaining.len(), buf.remaining());
            buf.put_slice(&remaining[..to_copy]);
            self.read_offset += to_copy;
            return Poll::Ready(Ok(()));
        }

        // Clear the buffer and read new data
        self.read_buffer.clear();
        self.read_offset = 0;

        match Pin::new(&mut self.inner).poll_next(cx) {
            Poll::Ready(Some(Ok(msg))) => {
                match msg {
                    Message::Binary(data) => {
                        let to_copy = std::cmp::min(data.len(), buf.remaining());
                        buf.put_slice(&data[..to_copy]);
                        if data.len() > to_copy {
                            self.read_buffer = data[to_copy..].to_vec();
                        }
                        Poll::Ready(Ok(()))
                    }
                    Message::Text(text) => {
                        let data = text.into_bytes();
                        let to_copy = std::cmp::min(data.len(), buf.remaining());
                        buf.put_slice(&data[..to_copy]);
                        if data.len() > to_copy {
                            self.read_buffer = data[to_copy..].to_vec();
                        }
                        Poll::Ready(Ok(()))
                    }
                    Message::Ping(_) | Message::Pong(_) => {
                        // Skip ping/pong and try again
                        cx.waker().wake_by_ref();
                        Poll::Pending
                    }
                    Message::Close(_) => {
                        Poll::Ready(Ok(())) // EOF
                    }
                    _ => {
                        cx.waker().wake_by_ref();
                        Poll::Pending
                    }
                }
            }
            Poll::Ready(Some(Err(e))) => {
                Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, e)))
            }
            Poll::Ready(None) => Poll::Ready(Ok(())), // EOF
            Poll::Pending => Poll::Pending,
        }
    }
}

impl AsyncWrite for WsStreamAdapter {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        match Pin::new(&mut self.inner).poll_ready(cx) {
            Poll::Ready(Ok(())) => {
                let msg = Message::Binary(buf.to_vec().into());
                match Pin::new(&mut self.inner).start_send(msg) {
                    Ok(()) => Poll::Ready(Ok(buf.len())),
                    Err(e) => Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, e))),
                }
            }
            Poll::Ready(Err(e)) => {
                Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, e)))
            }
            Poll::Pending => Poll::Pending,
        }
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match Pin::new(&mut self.inner).poll_flush(cx) {
            Poll::Ready(Ok(())) => Poll::Ready(Ok(())),
            Poll::Ready(Err(e)) => {
                Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, e)))
            }
            Poll::Pending => Poll::Pending,
        }
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        match Pin::new(&mut self.inner).poll_close(cx) {
            Poll::Ready(Ok(())) => Poll::Ready(Ok(())),
            Poll::Ready(Err(e)) => {
                Poll::Ready(Err(std::io::Error::new(std::io::ErrorKind::Other, e)))
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Wrapper for hyper compatibility
struct HyperIo<T>(T);

impl<T> HyperIo<T> {
    fn new(inner: T) -> Self {
        Self(inner)
    }
}

impl<T: AsyncRead + Unpin> hyper::rt::Read for HyperIo<T> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        mut buf: hyper::rt::ReadBufCursor<'_>,
    ) -> Poll<std::io::Result<()>> {
        // Safety: we need to initialize the buffer for tokio's ReadBuf
        let unfilled = unsafe { buf.as_mut() };
        let mut read_buf = ReadBuf::uninit(unfilled);

        match Pin::new(&mut self.0).poll_read(cx, &mut read_buf) {
            Poll::Ready(Ok(())) => {
                let filled = read_buf.filled().len();
                unsafe { buf.advance(filled) };
                Poll::Ready(Ok(()))
            }
            Poll::Ready(Err(e)) => Poll::Ready(Err(e)),
            Poll::Pending => Poll::Pending,
        }
    }
}

impl<T: AsyncWrite + Unpin> hyper::rt::Write for HyperIo<T> {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        Pin::new(&mut self.0).poll_write(cx, buf)
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.0).poll_flush(cx)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.0).poll_shutdown(cx)
    }
}

/// High-level async prove function
pub async fn prove_async(request: HttpRequest, options: ProverOptions) -> Result<ProofResult, TlsnError> {
    println!("[TLSN-RUST] Starting proof for {}", request.url);
    println!("[TLSN-RUST] ====================================");
    println!("[TLSN-RUST] HANDLERS RECEIVED: {}", options.handlers.len());
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

    // Parse HTTP message structures for range calculation
    let sent_parts = parse_http_parts(&sent_bytes)
        .ok_or_else(|| TlsnError::ProofFailed("Failed to parse HTTP request".to_string()))?;
    let recv_parts = parse_http_parts(&recv_bytes)
        .ok_or_else(|| TlsnError::ProofFailed("Failed to parse HTTP response".to_string()))?;

    if options.handlers.is_empty() {
        // No handlers specified - reveal everything (backwards compatible)
        println!("[TLSN-RUST] No handlers specified, revealing ALL data in MPC");
        tracing::info!("No handlers specified, revealing all data in MPC");
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
                        HandlerPart::StartLine => 0..sent_parts.start_line_end,
                        HandlerPart::Headers => sent_parts.headers_start..sent_parts.headers_end,
                        HandlerPart::Body => {
                            if sent_parts.body_start < sent_bytes.len() {
                                sent_parts.body_start..sent_bytes.len()
                            } else {
                                continue; // No body
                            }
                        }
                        HandlerPart::All => 0..sent_bytes.len(),
                    };
                    println!("[TLSN-RUST] MPC: Revealing SENT range {:?} for part {:?}", range, handler.part);
                    tracing::info!("MPC: Revealing SENT range {:?} for part {:?}", range, handler.part);
                    proof_builder.reveal_sent(&range)
                        .map_err(|e| TlsnError::ProofFailed(e.to_string()))?;
                }
                HandlerType::Recv => {
                    let range = match handler.part {
                        HandlerPart::StartLine => 0..recv_parts.start_line_end,
                        HandlerPart::Headers => {
                            // Check for specific header key
                            if let Some(params) = &handler.params {
                                if let Some(key) = &params.key {
                                    if let Some((start, end)) = find_header_range(&recv_bytes, key, &recv_parts) {
                                        start..end
                                    } else {
                                        println!("[TLSN-RUST] MPC: Header '{}' not found, skipping", key);
                                        tracing::warn!("MPC: Header '{}' not found, skipping", key);
                                        continue;
                                    }
                                } else {
                                    recv_parts.headers_start..recv_parts.headers_end
                                }
                            } else {
                                recv_parts.headers_start..recv_parts.headers_end
                            }
                        }
                        HandlerPart::Body => {
                            if recv_parts.body_start >= recv_bytes.len() {
                                continue; // No body
                            }
                            // For body with JSON path, reveal the whole body for now
                            // (selective JSON field reveal would require more complex range calculation)
                            recv_parts.body_start..recv_bytes.len()
                        }
                        HandlerPart::All => 0..recv_bytes.len(),
                    };
                    println!("[TLSN-RUST] MPC: Revealing RECV range {:?} for part {:?}", range, handler.part);
                    tracing::info!("MPC: Revealing RECV range {:?} for part {:?}", range, handler.part);
                    proof_builder.reveal_recv(&range)
                        .map_err(|e| TlsnError::ProofFailed(e.to_string()))?;
                }
            }
        }
    }

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

/// HTTP message structure parsed from bytes
struct HttpParts {
    start_line_end: usize,      // End of first line (after \r\n)
    headers_start: usize,       // Start of headers (after first \r\n)
    headers_end: usize,         // End of headers (before \r\n\r\n)
    body_start: usize,          // Start of body (after \r\n\r\n)
}

/// Parse HTTP message to find part boundaries
fn parse_http_parts(data: &[u8]) -> Option<HttpParts> {
    // Find end of first line
    let start_line_end = data.windows(2)
        .position(|w| w == b"\r\n")
        .map(|p| p + 2)?;

    // Find end of headers (double CRLF)
    let headers_end_marker = data.windows(4)
        .position(|w| w == b"\r\n\r\n")?;

    Some(HttpParts {
        start_line_end,
        headers_start: start_line_end,
        headers_end: headers_end_marker + 2, // Include the final \r\n of headers
        body_start: headers_end_marker + 4,  // After \r\n\r\n
    })
}

/// Find a specific header by name (case-insensitive) and return its byte range
fn find_header_range(data: &[u8], key: &str, parts: &HttpParts) -> Option<(usize, usize)> {
    let headers_data = &data[parts.headers_start..parts.headers_end];
    let headers_str = std::str::from_utf8(headers_data).ok()?;

    let search_key = format!("{}:", key.to_lowercase());
    let mut offset = 0;

    for line in headers_str.split("\r\n") {
        if line.to_lowercase().starts_with(&search_key) {
            let start = parts.headers_start + offset;
            let end = start + line.len();
            return Some((start, end));
        }
        offset += line.len() + 2; // +2 for \r\n
    }
    None
}

/// Build reveal config from handlers
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

    // Parse HTTP message structures
    let sent_parts = parse_http_parts(sent_bytes)
        .ok_or_else(|| TlsnError::ProofFailed("Failed to parse HTTP request".to_string()))?;
    let recv_parts = parse_http_parts(recv_bytes)
        .ok_or_else(|| TlsnError::ProofFailed("Failed to parse HTTP response".to_string()))?;

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
                    HandlerPart::StartLine => (0, sent_parts.start_line_end),
                    HandlerPart::Headers => (sent_parts.headers_start, sent_parts.headers_end),
                    HandlerPart::Body => {
                        if sent_parts.body_start < sent_bytes.len() {
                            (sent_parts.body_start, sent_bytes.len())
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
                    HandlerPart::StartLine => (0, recv_parts.start_line_end),
                    HandlerPart::Headers => {
                        // Check for specific header key in params
                        if let Some(params) = &handler.params {
                            if let Some(key) = &params.key {
                                if let Some(r) = find_header_range(recv_bytes, key, &recv_parts) {
                                    r
                                } else {
                                    tracing::warn!("Header '{}' not found in response", key);
                                    continue;
                                }
                            } else {
                                (recv_parts.headers_start, recv_parts.headers_end)
                            }
                        } else {
                            (recv_parts.headers_start, recv_parts.headers_end)
                        }
                    }
                    HandlerPart::Body => {
                        if recv_parts.body_start >= recv_bytes.len() {
                            tracing::warn!("No body in response, skipping Body handler");
                            continue; // No body
                        }

                        // Check for JSON path in params
                        if let Some(params) = &handler.params {
                            if params.content_type.as_deref() == Some("json") {
                                if let Some(path) = &params.path {
                                    let body_data = &recv_bytes[recv_parts.body_start..];
                                    let body_str = std::str::from_utf8(body_data).unwrap_or("");

                                    tracing::info!(
                                        "Looking for JSON path '{}' in body ({} bytes)",
                                        path,
                                        body_str.len()
                                    );
                                    tracing::debug!("Body content: {}", &body_str[..body_str.len().min(200)]);

                                    if let Some((start, end)) = find_json_path(body_str, path) {
                                        tracing::info!(
                                            "Found JSON path '{}' at body offset [{}, {})",
                                            path, start, end
                                        );
                                        (recv_parts.body_start + start, recv_parts.body_start + end)
                                    } else {
                                        // JSON path not found - skip this handler instead of revealing everything
                                        tracing::warn!(
                                            "JSON path '{}' not found in body, skipping handler",
                                            path
                                        );
                                        continue;
                                    }
                                } else {
                                    tracing::info!("No path specified for JSON body, revealing full body");
                                    (recv_parts.body_start, recv_bytes.len())
                                }
                            } else {
                                tracing::info!("Non-JSON body handler, revealing full body");
                                (recv_parts.body_start, recv_bytes.len())
                            }
                        } else {
                            tracing::info!("No params for Body handler, revealing full body");
                            (recv_parts.body_start, recv_bytes.len())
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

/// Decode chunked transfer encoding and return the actual body content
/// Returns (decoded_body, offset_to_first_chunk_data) for offset mapping
fn decode_chunked_body(body: &str) -> Option<(String, usize)> {
    let mut result = String::new();
    let mut pos = 0;
    let bytes = body.as_bytes();
    let mut first_data_offset = None;

    while pos < bytes.len() {
        // Find end of chunk size line
        let chunk_size_end = body[pos..].find("\r\n")?;
        let chunk_size_str = &body[pos..pos + chunk_size_end];

        // Parse chunk size (hex)
        let chunk_size = usize::from_str_radix(chunk_size_str.trim(), 16).ok()?;

        if chunk_size == 0 {
            break; // End of chunks
        }

        let data_start = pos + chunk_size_end + 2; // After \r\n
        let data_end = data_start + chunk_size;

        if data_end > bytes.len() {
            break;
        }

        if first_data_offset.is_none() {
            first_data_offset = Some(data_start);
        }

        result.push_str(&body[data_start..data_end]);
        pos = data_end + 2; // Skip \r\n after chunk data
    }

    first_data_offset.map(|offset| (result, offset))
}

/// Simple JSON path finder - returns (start, end) byte offsets within the string
/// Supports paths like "items[0].name"
fn find_json_path(json_str: &str, path: &str) -> Option<(usize, usize)> {
    // Try to parse directly first
    let (actual_json, base_offset) = if let Ok(_) = serde_json::from_str::<serde_json::Value>(json_str) {
        (json_str.to_string(), 0)
    } else {
        // Try to decode as chunked transfer encoding
        tracing::info!("Direct JSON parse failed, trying chunked decode");
        match decode_chunked_body(json_str) {
            Some((decoded, offset)) => {
                tracing::info!("Decoded chunked body ({} bytes), first chunk at offset {}", decoded.len(), offset);
                (decoded, offset)
            }
            None => {
                tracing::warn!("Failed to decode chunked body");
                return None;
            }
        }
    };

    // Parse the JSON
    let value: serde_json::Value = serde_json::from_str(&actual_json).ok()?;

    // Navigate the path
    let parts: Vec<&str> = path.split('.').collect();
    let mut current = &value;

    for part in &parts {
        // Check for array access like "items[0]"
        if let Some(bracket_pos) = part.find('[') {
            let key = &part[..bracket_pos];
            let index_str = &part[bracket_pos + 1..part.len() - 1];
            let index: usize = index_str.parse().ok()?;

            current = current.get(key)?.get(index)?;
        } else {
            current = current.get(*part)?;
        }
    }

    // Find the value in the actual JSON string (which may be decoded from chunks)
    // This is a simple approach - find the string representation
    let target = match current {
        serde_json::Value::String(s) => format!("\"{}\"", s),
        _ => current.to_string(),
    };

    // Search for the target in the actual JSON string
    // For nested paths, we need to find the last occurrence after finding the parent key
    let last_key = parts.last()?;
    let key_to_find = if last_key.contains('[') {
        last_key.split('[').next()?
    } else {
        last_key
    };

    // Find the key and then the value after it
    let key_pattern = format!("\"{}\"", key_to_find);
    let key_pos = actual_json.find(&key_pattern)?;
    let after_key = &actual_json[key_pos + key_pattern.len()..];

    // Skip whitespace and colon for object values
    let value_start_in_after = after_key.find(&target)?;
    let relative_start = key_pos + key_pattern.len() + value_start_in_after;
    let relative_end = relative_start + target.len();

    // For chunked responses, we need to find where this range falls in the original string
    // For simplicity, if the body was chunked, we reveal the whole body since offsets don't map directly
    if base_offset > 0 {
        // For chunked responses, find the target in the original string
        // The offsets don't map directly, so search for the value in the original
        if let Some(pos) = json_str.find(&target) {
            tracing::info!(
                "Found target '{}' at position {} in original chunked body",
                &target[..target.len().min(50)],
                pos
            );
            return Some((pos, pos + target.len()));
        }
        tracing::warn!("Could not find target in original chunked body");
        return None;
    }

    Some((relative_start, relative_end))
}
