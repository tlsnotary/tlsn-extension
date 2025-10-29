mod axum_websocket;
mod config;
mod http_parser;
mod verifier;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use axum_websocket::{WebSocket, WebSocketUpgrade};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{Mutex, oneshot};
use tokio::time::timeout;
use tokio_util::compat::FuturesAsyncReadCompatExt;
use tower_http::cors::CorsLayer;
use tracing::{error, info};
use tracing_subscriber;
use uuid::Uuid;
use ws_stream_tungstenite::WsStream;
use verifier::verifier;

#[tokio::main]
async fn main() {
    // Initialize tracing with DEBUG level
    tracing_subscriber::fmt()
        .with_target(true)
        .with_max_level(tracing::Level::INFO)
        .with_thread_ids(true)
        .with_line_number(true)
        .init();

    // Create application state with session storage
    let app_state = Arc::new(AppState {
        sessions: Arc::new(Mutex::new(HashMap::new())),
    });

    // Build router with routes
    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/session", get(session_ws_handler))
        .route("/verifier", get(verifier_ws_handler))
        .route("/proxy", get(proxy_ws_handler))
        .layer(CorsLayer::permissive())
        .with_state(app_state);

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], 7047));
    info!("TLSNotary Verifier Server starting on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind to address");

    info!("Server listening on http://{}", addr);
    info!("Health endpoint: http://{}/health", addr);
    info!("Session WebSocket endpoint: ws://{}/session", addr);
    info!("Verifier WebSocket endpoint: ws://{}/verifier?sessionId=<id>", addr);
    info!("Proxy WebSocket endpoint: ws://{}/proxy?host=<host>", addr);

    axum::serve(listener, app)
        .await
        .expect("Server error");
}

// Handler data structures matching TypeScript types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
enum HandlerType {
    #[serde(rename = "SENT")]
    Sent,
    #[serde(rename = "RECV")]
    Recv,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum HandlerPart {
    #[serde(rename = "START_LINE")]
    StartLine,
    #[serde(rename = "PROTOCOL")]
    Protocol,
    #[serde(rename = "METHOD")]
    Method,
    #[serde(rename = "REQUEST_TARGET")]
    RequestTarget,
    #[serde(rename = "STATUS_CODE")]
    StatusCode,
    #[serde(rename = "HEADERS")]
    Headers,
    #[serde(rename = "BODY")]
    Body,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
enum HandlerAction {
    #[serde(rename = "REVEAL")]
    Reveal,
    #[serde(rename = "PEDERSEN")]
    Pedersen,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
enum HandlerParams {
    Headers {
        key: Option<String>,
        #[serde(rename = "hideKey")]
        hide_key: Option<bool>,
        #[serde(rename = "hideValue")]
        hide_value: Option<bool>,
    },
    BodyJson {
        #[serde(rename = "type")]
        body_type: String, // "json"
        path: String,
        #[serde(rename = "hideKey")]
        hide_key: Option<bool>,
        #[serde(rename = "hideValue")]
        hide_value: Option<bool>,
    },
    BodyRegex {
        #[serde(rename = "type")]
        body_type: String, // "regex"
        regex: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Handler {
    #[serde(rename = "type")]
    handler_type: String, // "SENT" or "RECV"
    part: String,
    action: String,
    params: Option<serde_json::Value>,
}

// Session data structure (without handlers - they come later with ranges)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SessionConfig {
    #[serde(rename = "maxRecvData")]
    max_recv_data: usize,
    #[serde(rename = "maxSentData")]
    max_sent_data: usize,
}

// Range with handler metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
struct RangeWithHandler {
    start: usize,
    end: usize,
    handler: Handler,
}

// Reveal configuration sent before prover.reveal()
#[derive(Debug, Clone, Serialize, Deserialize)]
struct RevealConfig {
    sent: Vec<RangeWithHandler>,
    recv: Vec<RangeWithHandler>,
}

// Handler result with revealed value
#[derive(Debug, Clone, Serialize)]
struct HandlerResult {
    #[serde(flatten)]
    handler: Handler,
    value: String,
}

// Verification result containing handler results
#[derive(Debug, Clone, Serialize)]
struct VerificationResult {
    results: Vec<HandlerResult>,
}

// Type alias for the prover WebSocket sender
type ProverSocketSender = oneshot::Sender<WebSocket>;

// Session data stored in AppState
struct SessionData {
    prover_socket_tx: ProverSocketSender,
    reveal_config: Arc<Mutex<Option<RevealConfig>>>,
}

// Application state for sharing data between handlers
#[derive(Clone)]
struct AppState {
    sessions: Arc<Mutex<HashMap<String, SessionData>>>,
}

// Response body for session creation (sent via WebSocket)
#[derive(Debug, Serialize)]
struct CreateSessionResponse {
    #[serde(rename = "sessionId")]
    session_id: String,
}

// Query parameters for verifier WebSocket connection
#[derive(Debug, Deserialize)]
struct VerifierQuery {
    #[serde(rename = "sessionId")]
    session_id: String,
}

// Query parameters for proxy WebSocket connection
#[derive(Debug, Deserialize)]
struct ProxyQuery {
    host: String,
}

// Health check endpoint handler
async fn health_handler() -> impl IntoResponse {
    "ok"
}

// WebSocket session handler for extension
async fn session_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_session_websocket(socket, state))
}

// Handle the session WebSocket connection
async fn handle_session_websocket(mut socket: WebSocket, state: Arc<AppState>) {
    use futures_util::StreamExt;

    // Generate a new session ID
    let session_id = Uuid::new_v4().to_string();
    info!("[{}] New session WebSocket connected", session_id);

    // Send session ID to client
    let session_response = CreateSessionResponse {
        session_id: session_id.clone(),
    };

    if let Err(e) = socket.send(axum_websocket::Message::Text(
        serde_json::to_string(&session_response).unwrap()
    )).await {
        error!("[{}] Failed to send session ID: {}", session_id, e);
        return;
    }

    info!("[{}] Sent session ID to extension", session_id);

    // Receive configuration from client
    let config_msg = match socket.next().await {
        Some(Ok(axum_websocket::Message::Text(text))) => text,
        Some(Ok(msg)) => {
            error!("[{}] Expected text message, got: {:?}", session_id, msg);
            return;
        }
        Some(Err(e)) => {
            error!("[{}] Error receiving config: {}", session_id, e);
            return;
        }
        None => {
            error!("[{}] Connection closed before receiving config", session_id);
            return;
        }
    };

    let config: SessionConfig = match serde_json::from_str(&config_msg) {
        Ok(config) => config,
        Err(e) => {
            error!("[{}] Failed to parse config: {}", session_id, e);
            return;
        }
    };

    info!(
        "[{}] Received config: maxRecvData={}, maxSentData={}",
        session_id, config.max_recv_data, config.max_sent_data
    );

    // Create channels for prover socket and results
    let (prover_socket_tx, prover_socket_rx) = oneshot::channel::<WebSocket>();
    let (result_tx, result_rx) = oneshot::channel::<VerificationResult>();

    // Create shared reveal config storage
    let reveal_config_storage = Arc::new(Mutex::new(None));

    // Store session data WITHOUT reveal config yet (so prover can connect)
    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(session_id.clone(), SessionData {
            prover_socket_tx,
            reveal_config: reveal_config_storage.clone(),
        });
    }

    info!("[{}] Session stored, prover can now connect to /verifier", session_id);

    // Spawn the verifier task with the result sender
    let session_id_clone = session_id.clone();
    let state_clone = state.clone();
    let reveal_config_storage_clone = reveal_config_storage.clone();
    tokio::spawn(async move {
        run_verifier_task(session_id_clone, config, reveal_config_storage_clone, prover_socket_rx, result_tx, state_clone).await;
    });

    info!("[{}] Verifier task spawned, waiting for prover connection and reveal config", session_id);

    // Wait for RevealConfig message (ranges + handlers) - can come anytime now
    let reveal_msg = match socket.next().await {
        Some(Ok(axum_websocket::Message::Text(text))) => text,
        Some(Ok(msg)) => {
            error!("[{}] Expected text message for reveal config, got: {:?}", session_id, msg);
            return;
        }
        Some(Err(e)) => {
            error!("[{}] Error receiving reveal config: {}", session_id, e);
            return;
        }
        None => {
            error!("[{}] Connection closed before receiving reveal config", session_id);
            return;
        }
    };

    let reveal_config: RevealConfig = match serde_json::from_str(&reveal_msg) {
        Ok(config) => config,
        Err(e) => {
            error!("[{}] Failed to parse reveal config: {}", session_id, e);
            return;
        }
    };

    info!(
        "[{}] Received reveal config: {} sent ranges, {} recv ranges",
        session_id, reveal_config.sent.len(), reveal_config.recv.len()
    );

    // Store reveal config in shared storage
    {
        let mut storage = reveal_config_storage.lock().await;
        *storage = Some(reveal_config);
    }

    info!("[{}] ✅ Reveal config stored, verifier task can now proceed", session_id);

    // Wait for verification result
    match result_rx.await {
        Ok(result) => {
            info!("[{}] Received verification result, sending to extension", session_id);

            // Send result to extension
            let result_json = serde_json::to_string(&result).unwrap();
            if let Err(e) = socket.send(axum_websocket::Message::Text(result_json)).await {
                error!("[{}] Failed to send result: {}", session_id, e);
            } else {
                info!("[{}] ✅ Sent verification result to extension", session_id);
            }
        }
        Err(_) => {
            error!("[{}] ❌ Verifier task closed without sending result", session_id);
        }
    }

    // Close the WebSocket
    let _ = socket.close().await;
    info!("[{}] Session WebSocket closed", session_id);
}

// WebSocket handler for verifier (prover connection)
async fn verifier_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Query(query): Query<VerifierQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let session_id = query.session_id;

    // Look up the session and extract the socket sender
    let prover_socket_tx = {
        let mut sessions = state.sessions.lock().await;
        sessions.remove(&session_id).map(|session_data| session_data.prover_socket_tx)
    };

    match prover_socket_tx {
        Some(sender) => {
            info!("[{}] Prover WebSocket connection established, passing to verifier", session_id);
            Ok(ws.on_upgrade(move |socket| async move {
                // Send the WebSocket to the waiting verifier
                if let Err(_) = sender.send(socket) {
                    error!("[{}] Failed to send socket to verifier - channel closed", session_id);
                } else {
                    info!("[{}] Prover socket passed to verifier successfully", session_id);
                }
            }))
        }
        None => {
            error!("[{}] Session not found or already connected", session_id);
            Err((
                StatusCode::NOT_FOUND,
                format!("Session not found or already connected: {}", session_id),
            ))
        }
    }
}

// WebSocket proxy handler - bridges WebSocket to TCP
async fn proxy_ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<ProxyQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let host = query.host;

    info!("[Proxy] New proxy request for host: {}", host);

    Ok(ws.on_upgrade(move |socket| handle_proxy_connection(socket, host)))
}

// Handle the proxy WebSocket connection by bridging to TCP
async fn handle_proxy_connection(ws: WebSocket, host: String) {
    use futures_util::{SinkExt, StreamExt};

    let proxy_id = Uuid::new_v4().to_string();
    info!("[{}] Proxy WebSocket connected for host: {}", proxy_id, host);

    // Parse host and port (default to 443 for HTTPS)
    let (hostname, port) = if host.contains(':') {
        let parts: Vec<&str> = host.split(':').collect();
        (parts[0].to_string(), parts.get(1).and_then(|p| p.parse().ok()).unwrap_or(443))
    } else {
        (host.clone(), 443)
    };

    info!("[{}] Connecting to {}:{}", proxy_id, hostname, port);

    // Connect to the remote TCP host
    let tcp_stream = match tokio::net::TcpStream::connect((hostname.as_str(), port)).await {
        Ok(stream) => {
            info!("[{}] TCP connection established to {}:{}", proxy_id, hostname, port);
            stream
        }
        Err(e) => {
            error!("[{}] Failed to connect to {}:{} - {}", proxy_id, hostname, port, e);
            return;
        }
    };

    // Split WebSocket into sink and stream
    let (mut ws_sink, mut ws_stream) = ws.split();

    // Split the TCP stream into read and write halves
    let (mut tcp_read, mut tcp_write) = tokio::io::split(tcp_stream);

    // Spawn task to forward WebSocket -> TCP
    // Read WebSocket Binary messages and write payload to TCP
    let proxy_id_clone = proxy_id.clone();
    let ws_to_tcp = tokio::spawn(async move {
        let mut total_bytes = 0u64;

        loop {
            match ws_stream.next().await {
                Some(Ok(msg)) => {
                    match msg {
                        axum_websocket::Message::Binary(data) => {
                            let len = data.len();
                            total_bytes += len as u64;

                            if let Err(e) = tcp_write.write_all(&data).await {
                                error!("[{}] Failed to write to TCP: {}", proxy_id_clone, e);
                                break;
                            }
                        }
                        axum_websocket::Message::Close(_) => {
                            info!("[{}] WebSocket close frame received, forwarded {} bytes total", proxy_id_clone, total_bytes);
                            break;
                        }
                        _ => {
                            // Ignore Text, Ping, Pong messages for now
                        }
                    }
                }
                Some(Err(e)) => {
                    error!("[{}] WebSocket read error: {}", proxy_id_clone, e);
                    break;
                }
                None => {
                    info!("[{}] WebSocket stream ended, forwarded {} bytes total", proxy_id_clone, total_bytes);
                    break;
                }
            }
        }

        total_bytes
    });

    // Spawn task to forward TCP -> WebSocket
    // Read from TCP and wrap in WebSocket Binary messages
    let proxy_id_clone = proxy_id.clone();
    let tcp_to_ws = tokio::spawn(async move {
        let mut buf = vec![0u8; 8192];
        let mut total_bytes = 0u64;

        loop {
            match tcp_read.read(&mut buf).await {
                Ok(0) => {
                    info!("[{}] TCP read EOF (server closed), forwarded {} bytes to WebSocket", proxy_id_clone, total_bytes);
                    break;
                }
                Ok(n) => {
                    total_bytes += n as u64;
                    let binary_msg = axum_websocket::Message::Binary(buf[..n].to_vec());

                    if let Err(e) = ws_sink.send(binary_msg).await {
                        error!("[{}] Failed to send to WebSocket: {}", proxy_id_clone, e);
                        break;
                    }
                }
                Err(e) => {
                    error!("[{}] TCP read error: {}", proxy_id_clone, e);
                    break;
                }
            }
        }

        total_bytes
    });

    // Wait for both tasks to complete
    let (ws_result, tcp_result) = tokio::join!(ws_to_tcp, tcp_to_ws);

    let ws_total = ws_result.unwrap_or(0);
    let tcp_total = tcp_result.unwrap_or(0);

    info!("[{}] Proxy closed: WS→TCP {} bytes, TCP→WS {} bytes", proxy_id, ws_total, tcp_total);
}

// Verifier task that waits for WebSocket and runs verification
async fn run_verifier_task(
    session_id: String,
    config: SessionConfig,
    reveal_config_storage: Arc<Mutex<Option<RevealConfig>>>,
    socket_rx: oneshot::Receiver<WebSocket>,
    result_tx: oneshot::Sender<VerificationResult>,
    state: Arc<AppState>,
) {
    info!(
        "[{}] Verifier task started, waiting for WebSocket connection...",
        session_id
    );
    info!(
        "[{}] Configuration: maxRecvData={}, maxSentData={}",
        session_id, config.max_recv_data, config.max_sent_data
    );

    // Wait for WebSocket connection with timeout
    let connection_timeout = Duration::from_secs(30);
    let socket_result = timeout(connection_timeout, socket_rx).await;

    let socket = match socket_result {
        Ok(Ok(socket)) => {
            info!("[{}] ✅ WebSocket received, starting verification", session_id);
            socket
        }
        Ok(Err(_)) => {
            error!("[{}] ❌ Socket channel closed before connection", session_id);
            cleanup_session(&state, &session_id).await;
            return;
        }
        Err(_) => {
            error!(
                "[{}] ⏱️  Timed out waiting for WebSocket connection after {:?}",
                session_id, connection_timeout
            );
            cleanup_session(&state, &session_id).await;
            return;
        }
    };

    // Convert WebSocket to WsStream for AsyncRead/AsyncWrite compatibility
    let stream = WsStream::new(socket.into_inner());
    info!("[{}] WebSocket converted to stream", session_id);

    // Convert from futures AsyncRead/AsyncWrite to tokio AsyncRead/AsyncWrite
    let stream = stream.compat();

    // Run the verifier with timeout
    let verification_timeout = Duration::from_secs(120);
    info!(
        "[{}] Starting verification with timeout of {:?}",
        session_id, verification_timeout
    );

    let verification_result = timeout(
        verification_timeout,
        verifier(stream, config.max_sent_data, config.max_recv_data),
    )
    .await;

    // Handle the verification result
    match verification_result {
        Ok(Ok((sent_data, received_data))) => {
            info!("[{}] ✅ Verification completed successfully!", session_id);
            info!("[{}] Sent data length: {} bytes", session_id, sent_data.len());
            info!("[{}] Received data length: {} bytes", session_id, received_data.len());

            // Wait for RevealConfig to be available (with polling and timeout)
            let reveal_config_wait_timeout = Duration::from_secs(30);
            let start_time = tokio::time::Instant::now();

            let reveal_config = loop {
                {
                    let storage = reveal_config_storage.lock().await;
                    if let Some(config) = storage.as_ref() {
                        info!("[{}] ✅ RevealConfig found, mapping results", session_id);
                        break config.clone();
                    }
                }

                // Check timeout
                if start_time.elapsed() > reveal_config_wait_timeout {
                    error!(
                        "[{}] ❌ Timed out waiting for RevealConfig after verification",
                        session_id
                    );
                    cleanup_session(&state, &session_id).await;
                    return;
                }

                // RevealConfig not available yet, wait a bit
                info!("[{}] Waiting for RevealConfig...", session_id);
                tokio::time::sleep(Duration::from_millis(100)).await;
            };

            // Map revealed ranges to handler results
            let mut handler_results = Vec::new();

            // Convert strings to bytes for slicing
            let sent_bytes = sent_data.as_bytes();
            let recv_bytes = received_data.as_bytes();

            // Process sent ranges
            for range_with_handler in &reveal_config.sent {
                let value = if range_with_handler.start < sent_bytes.len()
                    && range_with_handler.end <= sent_bytes.len()
                    && range_with_handler.start < range_with_handler.end {
                    let bytes = &sent_bytes[range_with_handler.start..range_with_handler.end];
                    String::from_utf8_lossy(bytes).to_string()
                } else {
                    format!("ERROR: Invalid range [{}, {})", range_with_handler.start, range_with_handler.end)
                };

                info!(
                    "[{}] Mapped SENT range [{}, {}) to handler {:?}: {} bytes",
                    session_id,
                    range_with_handler.start,
                    range_with_handler.end,
                    range_with_handler.handler.part,
                    value.len()
                );

                handler_results.push(HandlerResult {
                    handler: range_with_handler.handler.clone(),
                    value,
                });
            }

            // Process recv ranges
            for range_with_handler in &reveal_config.recv {
                let value = if range_with_handler.start < recv_bytes.len()
                    && range_with_handler.end <= recv_bytes.len()
                    && range_with_handler.start < range_with_handler.end {
                    let bytes = &recv_bytes[range_with_handler.start..range_with_handler.end];
                    String::from_utf8_lossy(bytes).to_string()
                } else {
                    format!("ERROR: Invalid range [{}, {})", range_with_handler.start, range_with_handler.end)
                };

                info!(
                    "[{}] Mapped RECV range [{}, {}) to handler {:?}: {} bytes",
                    session_id,
                    range_with_handler.start,
                    range_with_handler.end,
                    range_with_handler.handler.part,
                    value.len()
                );

                handler_results.push(HandlerResult {
                    handler: range_with_handler.handler.clone(),
                    value,
                });
            }

            // Send result to extension via the result channel
            let result = VerificationResult {
                results: handler_results,
            };

            if let Err(_) = result_tx.send(result) {
                error!("[{}] ❌ Failed to send result to extension - channel closed", session_id);
            } else {
                info!("[{}] ✅ Result sent to extension successfully", session_id);
            }
        }
        Ok(Err(e)) => {
            error!("[{}] ❌ Verification failed: {}", session_id, e);
            // Note: result_tx will be dropped, causing extension to receive an error
        }
        Err(_) => {
            error!(
                "[{}] ⏱️  Verification timed out after {:?}",
                session_id, verification_timeout
            );
            // Note: result_tx will be dropped, causing extension to receive an error
        }
    }

    // Clean up session (if it still exists in the map)
    cleanup_session(&state, &session_id).await;

    info!("[{}] Verifier task completed and cleaned up", session_id);
}

// Helper function to clean up session from state
async fn cleanup_session(state: &Arc<AppState>, session_id: &str) {
    let mut sessions = state.sessions.lock().await;
    if sessions.remove(session_id).is_some() {
        info!("[{}] Session removed from state", session_id);
    }
}
