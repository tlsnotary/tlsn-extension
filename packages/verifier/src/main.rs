mod axum_websocket;
mod verifier;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use axum_websocket::{WebSocket, WebSocketUpgrade};
use rangeset::RangeSet;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tlsn::transcript::PartialTranscript;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::{oneshot, Mutex};
use tokio::time::timeout;
use tokio_util::compat::FuturesAsyncReadCompatExt;
use tower_http::cors::CorsLayer;
use tracing::{debug, error, info, warn};
use uuid::Uuid;
use verifier::verifier;
use ws_stream_tungstenite::WsStream;

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_target(true)
        .with_max_level(tracing::Level::INFO)
        .with_thread_ids(true)
        .with_line_number(true)
        .init();

    // Load configuration from YAML file
    let config = Config::load(Path::new("config.yaml"));
    info!(
        "Webhook configurations loaded: {} endpoints",
        config.webhooks.len()
    );
    for (server_name, webhook) in &config.webhooks {
        info!("  {} -> {}", server_name, webhook.url);
    }

    // Create application state with session storage and config
    let app_state = Arc::new(AppState {
        sessions: Arc::new(Mutex::new(HashMap::new())),
        config: Arc::new(config),
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
    info!(
        "Verifier WebSocket endpoint: ws://{}/verifier?sessionId=<id>",
        addr
    );
    info!("Proxy WebSocket endpoint: ws://{}/proxy?host=<host>", addr);

    axum::serve(listener, app)
        .tcp_nodelay(true)
        .await
        .expect("Server error");
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
enum HandlerType {
    Sent,
    Recv,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum HandlerPart {
    StartLine,
    Protocol,
    Method,
    RequestTarget,
    StatusCode,
    Headers,
    Body,
    All,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Handler {
    #[serde(rename = "type")]
    handler_type: HandlerType,
    part: HandlerPart,
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

// Session data stored in AppState (only prover socket sender - config/sessionData passed directly to verifier task)
struct SessionData {
    prover_socket_tx: ProverSocketSender,
}

// Application state for sharing data between handlers
#[derive(Clone)]
struct AppState {
    sessions: Arc<Mutex<HashMap<String, SessionData>>>,
    config: Arc<Config>,
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

// ============================================================================
// WebSocket Message Protocol (Typed Messages)
// ============================================================================

/// Incoming messages from client (extension)
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    /// Registration message - sent first to establish session
    Register {
        #[serde(rename = "maxRecvData")]
        max_recv_data: usize,
        #[serde(rename = "maxSentData")]
        max_sent_data: usize,
        #[serde(rename = "sessionData", default)]
        session_data: HashMap<String, String>,
    },
    /// Reveal configuration - sent with ranges and handlers
    RevealConfig {
        sent: Vec<RangeWithHandler>,
        recv: Vec<RangeWithHandler>,
    },
}

/// Outgoing messages to client (extension)
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMessage {
    /// Session registered successfully
    SessionRegistered {
        #[serde(rename = "sessionId")]
        session_id: String,
    },
    /// Session completed with results
    SessionCompleted {
        results: Vec<HandlerResult>,
    },
    /// Error occurred
    Error {
        message: String,
    },
}

// ============================================================================
// Webhook Types
// ============================================================================

/// Webhook configuration for a specific server
#[derive(Debug, Clone, Deserialize)]
struct WebhookConfig {
    url: String,
    #[serde(default)]
    headers: HashMap<String, String>,
}

/// Application configuration loaded from YAML
#[derive(Debug, Clone, Deserialize, Default)]
struct Config {
    #[serde(default)]
    webhooks: HashMap<String, WebhookConfig>,
}

impl Config {
    /// Load configuration from YAML file, returns default if file doesn't exist
    fn load(path: &Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(contents) => match serde_yaml::from_str(&contents) {
                Ok(config) => {
                    info!("Loaded config from {:?}", path);
                    config
                }
                Err(e) => {
                    warn!("Failed to parse config file {:?}: {}", path, e);
                    Self::default()
                }
            },
            Err(_) => {
                info!("No config file found at {:?}, using defaults", path);
                Self::default()
            }
        }
    }

    /// Get webhook configuration for a server name (with wildcard fallback)
    fn get_webhook(&self, server_name: &str) -> Option<&WebhookConfig> {
        self.webhooks
            .get(server_name)
            .or_else(|| self.webhooks.get("*"))
    }
}

/// Webhook payload sent to configured endpoints
#[derive(Debug, Serialize)]
struct WebhookPayload {
    /// The server name (hostname) from the TLS connection
    server_name: String,
    /// Handler results with revealed values
    results: Vec<HandlerResult>,
    /// The reveal configuration (ranges + handlers)
    config: RevealConfigForWebhook,
    /// Session metadata
    session: SessionInfo,
    /// Redacted transcripts (bytes outside revealed ranges replaced with 0x00)
    transcript: RedactedTranscript,
}

/// Reveal config for webhook (same structure, different purpose)
#[derive(Debug, Serialize)]
struct RevealConfigForWebhook {
    sent: Vec<RangeWithHandler>,
    recv: Vec<RangeWithHandler>,
}

/// Session information for webhook
#[derive(Debug, Serialize)]
struct SessionInfo {
    id: String,
    #[serde(flatten)]
    data: HashMap<String, String>,
}

/// Redacted transcript data - bytes outside revealed ranges are zeroed out
#[derive(Debug, Serialize)]
struct RedactedTranscript {
    /// Redacted sent data (request) - unrevealed bytes replaced with 0x00
    sent: String,
    /// Redacted received data (response) - unrevealed bytes replaced with 0x00
    recv: String,
    /// Original sent length before redaction
    sent_length: usize,
    /// Original recv length before redaction
    recv_length: usize,
}

impl RedactedTranscript {
    /// Create redacted transcript from raw bytes and reveal config
    fn from_transcript(
        sent_bytes: &[u8],
        recv_bytes: &[u8],
        reveal_config: &RevealConfig,
    ) -> Self {
        Self {
            sent: Self::redact_bytes(sent_bytes, &reveal_config.sent),
            recv: Self::redact_bytes(recv_bytes, &reveal_config.recv),
            sent_length: sent_bytes.len(),
            recv_length: recv_bytes.len(),
        }
    }

    /// Redact bytes by zeroing out bytes outside the revealed ranges
    fn redact_bytes(bytes: &[u8], ranges: &[RangeWithHandler]) -> String {
        let mut redacted = vec![0u8; bytes.len()];

        for range in ranges {
            if range.start < bytes.len() && range.end <= bytes.len() {
                redacted[range.start..range.end].copy_from_slice(&bytes[range.start..range.end]);
            }
        }

        // Convert to string - using lossy conversion for non-UTF8 bytes
        String::from_utf8_lossy(&redacted).to_string()
    }
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

/// Helper to send typed server messages
async fn send_server_message(socket: &mut WebSocket, message: &ServerMessage) -> bool {
    match socket
        .send(axum_websocket::Message::Text(
            serde_json::to_string(message).unwrap(),
        ))
        .await
    {
        Ok(_) => true,
        Err(e) => {
            error!("Failed to send message: {}", e);
            false
        }
    }
}

/// Helper to send error message
async fn send_error(socket: &mut WebSocket, message: &str) {
    let _ = send_server_message(socket, &ServerMessage::Error {
        message: message.to_string(),
    })
    .await;
}

// Handle the session WebSocket connection with typed message protocol
async fn handle_session_websocket(mut socket: WebSocket, state: Arc<AppState>) {
    use futures_util::StreamExt;

    // Generate session ID upfront (but don't send yet - wait for register)
    let session_id = Uuid::new_v4().to_string();
    info!("[{}] New session WebSocket connected", session_id);

    // Wait for "register" message first
    let register_msg = match socket.next().await {
        Some(Ok(axum_websocket::Message::Text(text))) => text,
        Some(Ok(msg)) => {
            error!("[{}] Expected text message, got: {:?}", session_id, msg);
            send_error(&mut socket, "Expected text message").await;
            return;
        }
        Some(Err(e)) => {
            error!("[{}] Error receiving message: {}", session_id, e);
            return;
        }
        None => {
            error!("[{}] Connection closed before registration", session_id);
            return;
        }
    };

    // Parse as ClientMessage
    let client_msg: ClientMessage = match serde_json::from_str(&register_msg) {
        Ok(msg) => msg,
        Err(e) => {
            error!("[{}] Failed to parse message: {}", session_id, e);
            send_error(&mut socket, &format!("Invalid message format: {}", e)).await;
            return;
        }
    };

    // Expect "register" message type
    let (max_recv_data, max_sent_data, session_data) = match client_msg {
        ClientMessage::Register {
            max_recv_data,
            max_sent_data,
            session_data,
        } => (max_recv_data, max_sent_data, session_data),
        _ => {
            error!("[{}] Expected 'register' message type", session_id);
            send_error(&mut socket, "Expected 'register' message type").await;
            return;
        }
    };

    info!(
        "[{}] Received registration: maxRecvData={}, maxSentData={}, sessionData keys: {:?}",
        session_id,
        max_recv_data,
        max_sent_data,
        session_data.keys().collect::<Vec<_>>()
    );

    // Send session_registered response
    if !send_server_message(
        &mut socket,
        &ServerMessage::SessionRegistered {
            session_id: session_id.clone(),
        },
    )
    .await
    {
        error!("[{}] Failed to send session_registered", session_id);
        return;
    }

    info!("[{}] Sent session_registered to client", session_id);

    // Create channels for prover socket and results
    let (prover_socket_tx, prover_socket_rx) = oneshot::channel::<WebSocket>();
    let (result_tx, result_rx) = oneshot::channel::<VerificationResult>();

    // Create shared reveal config storage and session data storage
    let reveal_config_storage = Arc::new(Mutex::new(None));
    let session_data_storage = Arc::new(session_data.clone());

    let session_config = SessionConfig {
        max_recv_data,
        max_sent_data,
    };

    // Store session data (so prover can connect)
    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(session_id.clone(), SessionData { prover_socket_tx });
    }

    info!(
        "[{}] Session stored, prover can now connect to /verifier",
        session_id
    );

    // Spawn the verifier task with the result sender
    let session_id_clone = session_id.clone();
    let state_clone = state.clone();
    let reveal_config_storage_clone = reveal_config_storage.clone();
    let session_data_clone = session_data_storage.clone();
    tokio::spawn(async move {
        run_verifier_task(
            session_id_clone,
            session_config,
            (*session_data_clone).clone(),
            reveal_config_storage_clone,
            prover_socket_rx,
            result_tx,
            state_clone,
        )
        .await;
    });

    info!(
        "[{}] Verifier task spawned, waiting for prover connection and reveal config",
        session_id
    );

    // Wait for reveal_config message
    let reveal_msg = match socket.next().await {
        Some(Ok(axum_websocket::Message::Text(text))) => text,
        Some(Ok(msg)) => {
            error!(
                "[{}] Expected text message for reveal_config, got: {:?}",
                session_id, msg
            );
            send_error(&mut socket, "Expected text message").await;
            return;
        }
        Some(Err(e)) => {
            error!("[{}] Error receiving reveal_config: {}", session_id, e);
            return;
        }
        None => {
            error!(
                "[{}] Connection closed before receiving reveal_config",
                session_id
            );
            return;
        }
    };

    // Parse as ClientMessage
    let client_msg: ClientMessage = match serde_json::from_str(&reveal_msg) {
        Ok(msg) => msg,
        Err(e) => {
            error!("[{}] Failed to parse reveal_config: {}", session_id, e);
            send_error(&mut socket, &format!("Invalid message format: {}", e)).await;
            return;
        }
    };

    // Expect "reveal_config" message type
    let reveal_config = match client_msg {
        ClientMessage::RevealConfig { sent, recv } => RevealConfig { sent, recv },
        _ => {
            error!("[{}] Expected 'reveal_config' message type", session_id);
            send_error(&mut socket, "Expected 'reveal_config' message type").await;
            return;
        }
    };

    info!(
        "[{}] Received reveal_config: {} sent ranges, {} recv ranges",
        session_id,
        reveal_config.sent.len(),
        reveal_config.recv.len()
    );

    // Store reveal config in shared storage
    {
        let mut storage = reveal_config_storage.lock().await;
        *storage = Some(reveal_config);
    }

    info!(
        "[{}] ✅ Reveal config stored, verifier task can now proceed",
        session_id
    );

    // Wait for verification result
    match result_rx.await {
        Ok(result) => {
            info!(
                "[{}] Received verification result, sending to extension",
                session_id
            );

            // Send session_completed to extension
            if send_server_message(
                &mut socket,
                &ServerMessage::SessionCompleted {
                    results: result.results,
                },
            )
            .await
            {
                info!("[{}] ✅ Sent session_completed to extension", session_id);
            } else {
                error!("[{}] Failed to send session_completed", session_id);
            }
        }
        Err(_) => {
            error!(
                "[{}] ❌ Verifier task closed without sending result",
                session_id
            );
            send_error(&mut socket, "Verification failed").await;
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
        sessions
            .remove(&session_id)
            .map(|session_data| session_data.prover_socket_tx)
    };

    match prover_socket_tx {
        Some(sender) => {
            info!(
                "[{}] Prover WebSocket connection established, passing to verifier",
                session_id
            );
            Ok(ws.on_upgrade(move |socket| async move {
                // Send the WebSocket to the waiting verifier
                if sender.send(socket).is_err() {
                    error!(
                        "[{}] Failed to send socket to verifier - channel closed",
                        session_id
                    );
                } else {
                    info!(
                        "[{}] Prover socket passed to verifier successfully",
                        session_id
                    );
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
    info!(
        "[{}] Proxy WebSocket connected for host: {}",
        proxy_id, host
    );

    // Parse host and port (default to 443 for HTTPS)
    let (hostname, port) = if host.contains(':') {
        let parts: Vec<&str> = host.split(':').collect();
        (
            parts[0].to_string(),
            parts.get(1).and_then(|p| p.parse().ok()).unwrap_or(443),
        )
    } else {
        (host.clone(), 443)
    };

    info!("[{}] Connecting to {}:{}", proxy_id, hostname, port);

    // Connect to the remote TCP host
    let tcp_stream = match tokio::net::TcpStream::connect((hostname.as_str(), port)).await {
        Ok(stream) => {
            info!(
                "[{}] TCP connection established to {}:{}",
                proxy_id, hostname, port
            );
            stream
        }
        Err(e) => {
            error!(
                "[{}] Failed to connect to {}:{} - {}",
                proxy_id, hostname, port, e
            );
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
                            info!(
                                "[{}] WebSocket close frame received, forwarded {} bytes total",
                                proxy_id_clone, total_bytes
                            );
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
                    info!(
                        "[{}] WebSocket stream ended, forwarded {} bytes total",
                        proxy_id_clone, total_bytes
                    );
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
                    info!(
                        "[{}] TCP read EOF (server closed), forwarded {} bytes to WebSocket",
                        proxy_id_clone, total_bytes
                    );
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

    info!(
        "[{}] Proxy closed: WS→TCP {} bytes, TCP→WS {} bytes",
        proxy_id, ws_total, tcp_total
    );
}

// Verifier task that waits for WebSocket and runs verification
async fn run_verifier_task(
    session_id: String,
    config: SessionConfig,
    session_data: HashMap<String, String>,
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
            info!(
                "[{}] ✅ WebSocket received, starting verification",
                session_id
            );
            socket
        }
        Ok(Err(_)) => {
            error!(
                "[{}] ❌ Socket channel closed before connection",
                session_id
            );
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
        Ok(Ok((server_name, transcript))) => {
            info!("[{}] ✅ Verification completed successfully!", session_id);

            // Extract sent and received data
            let sent_bytes = transcript.sent_unsafe().to_vec();
            let recv_bytes = transcript.received_unsafe().to_vec();

            info!(
                "[{}] Sent data length: {} bytes (authed: {} bytes)",
                session_id,
                sent_bytes.len(),
                transcript.sent_authed().iter().sum::<usize>(),
            );
            info!(
                "[{}] Received data length: {} bytes (authed: {} bytes)",
                session_id,
                recv_bytes.len(),
                transcript.received_authed().iter().sum::<usize>()
            );

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

            // Validate that reveal_config ranges match authenticated transcript ranges
            if let Err((direction, start, end)) = verify_reveal_config(&reveal_config, &transcript)
            {
                error!(
                    "[{}] ❌ Invalid {} range [{}, {}) - not fully within authenticated ranges",
                    session_id, direction, start, end
                );
                cleanup_session(&state, &session_id).await;
                return;
            }

            info!(
                "[{}] ✅ All reveal_config ranges validated against authenticated transcript",
                session_id
            );

            // Map revealed ranges to handler results using raw transcript bytes

            let mut handler_results = Vec::new();

            // Process ranges using unified function to eliminate duplication
            handler_results.extend(process_ranges(
                &reveal_config.sent,
                &sent_bytes,
                "SENT",
                &session_id,
            ));
            handler_results.extend(process_ranges(
                &reveal_config.recv,
                &recv_bytes,
                "RECV",
                &session_id,
            ));

            // Check if webhook is configured for this server_name
            let server_name_str = server_name.as_ref();
            if let Some(webhook_config) = state.config.get_webhook(server_name_str) {
                info!(
                    "[{}] Webhook configured for {}, sending POST to {}",
                    session_id, server_name_str, webhook_config.url
                );

                // Create redacted transcript - only revealed ranges are visible
                let redacted_transcript = RedactedTranscript::from_transcript(
                    &sent_bytes,
                    &recv_bytes,
                    &reveal_config,
                );

                let payload = WebhookPayload {
                    server_name: server_name_str.to_string(),
                    results: handler_results.clone(),
                    config: RevealConfigForWebhook {
                        sent: reveal_config.sent.clone(),
                        recv: reveal_config.recv.clone(),
                    },
                    session: SessionInfo {
                        id: session_id.clone(),
                        data: session_data.clone(),
                    },
                    transcript: redacted_transcript,
                };

                // Fire and forget - don't block on webhook
                let webhook_config = webhook_config.clone();
                let session_id_for_webhook = session_id.clone();
                tokio::spawn(async move {
                    send_webhook(&webhook_config, &payload, &session_id_for_webhook).await;
                });
            }

            // Send result to extension via the result channel
            let result = VerificationResult {
                results: handler_results,
            };

            if result_tx.send(result).is_err() {
                error!(
                    "[{}] ❌ Failed to send result to extension - channel closed",
                    session_id
                );
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

/// Validates that all ranges in reveal config are fully within authenticated transcript ranges.
/// Returns error with (direction, start, end) if any range contains unauthenticated data.
fn verify_reveal_config(
    reveal_config: &RevealConfig,
    transcript: &PartialTranscript,
) -> Result<(), (String, usize, usize)> {
    fn validate_ranges_against_auth_set(
        ranges: &[RangeWithHandler],
        auth_set: &RangeSet<usize>,
        direction: &str,
    ) -> Result<(), (String, usize, usize)> {
        for range in ranges {
            if !(range.start..range.end).all(|i| auth_set.contains(&i)) {
                return Err((direction.to_string(), range.start, range.end));
            }

            debug!(
                "✅ {} range [{}, {}) validated - fully within authenticated ranges",
                direction, range.start, range.end
            );
        }
        Ok(())
    }

    validate_ranges_against_auth_set(&reveal_config.sent, transcript.sent_authed(), "sent")?;
    validate_ranges_against_auth_set(&reveal_config.recv, transcript.received_authed(), "recv")?;

    Ok(())
}

// Helper function to clean up session from state
async fn cleanup_session(state: &Arc<AppState>, session_id: &str) {
    let mut sessions = state.sessions.lock().await;
    if sessions.remove(session_id).is_some() {
        info!("[{}] Session removed from state", session_id);
    }
}

/// Processes ranges and extracts values from transcript bytes
fn process_ranges(
    ranges: &[RangeWithHandler],
    bytes: &[u8],
    direction: &str,
    session_id: &str,
) -> Vec<HandlerResult> {
    ranges
        .iter()
        .map(|range_with_handler| {
            let value = if range_with_handler.start < bytes.len()
                && range_with_handler.end <= bytes.len()
                && range_with_handler.start < range_with_handler.end
            {
                let extracted_bytes = &bytes[range_with_handler.start..range_with_handler.end];
                String::from_utf8_lossy(extracted_bytes).to_string()
            } else {
                format!(
                    "ERROR: Invalid range [{}, {})",
                    range_with_handler.start, range_with_handler.end
                )
            };

            debug!(
                "[{}] Mapped {} range [{}, {}) to handler {:?}: {} bytes",
                session_id,
                direction,
                range_with_handler.start,
                range_with_handler.end,
                range_with_handler.handler.part,
                value.len()
            );

            HandlerResult {
                handler: range_with_handler.handler.clone(),
                value,
            }
        })
        .collect()
}


/// Send webhook POST request to configured endpoint
async fn send_webhook(config: &WebhookConfig, payload: &WebhookPayload, session_id: &str) {
    let client = reqwest::Client::new();

    let mut request = client.post(&config.url).json(payload);

    // Add custom headers from config
    for (key, value) in &config.headers {
        request = request.header(key, value);
    }

    match request.send().await {
        Ok(response) => {
            if response.status().is_success() {
                info!(
                    "[{}] ✅ Webhook POST successful: {}",
                    session_id, config.url
                );
            } else {
                error!(
                    "[{}] ❌ Webhook POST failed with status {}: {}",
                    session_id,
                    response.status(),
                    config.url
                );
            }
        }
        Err(e) => {
            // Log error but don't fail the verification
            error!(
                "[{}] ❌ Webhook POST error: {} - {}",
                session_id, config.url, e
            );
        }
    }
}
