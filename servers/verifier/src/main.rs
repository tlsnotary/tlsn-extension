mod verifier;
mod ws;

#[cfg(test)]
mod tests;

use async_tungstenite::tungstenite::Message;
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    serve::ListenerExt,
    Router,
};
use bytes::BytesMut;
use futures_util::SinkExt;
use rangeset::prelude::RangeSet;
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
use ws::{TungsteniteStream, WsUpgrade};
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
        .route("/info", get(info_handler))
        .route("/session", get(session_ws_handler))
        .route("/verifier", get(verifier_ws_handler))
        .route("/proxy", get(proxy_ws_handler))
        .layer(CorsLayer::permissive())
        .with_state(app_state);

    // Start server
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(7047);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("TLSNotary Verifier Server starting on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .expect("Failed to bind to address");
    let listener = listener.tap_io(|tcp_stream| {
        if let Err(err) = tcp_stream.set_nodelay(true) {
            warn!("failed to set TCP_NODELAY on incoming connection: {err}");
        }
    });

    info!("Server listening on http://{}", addr);
    info!("Health endpoint: http://{}/health", addr);
    info!("Info endpoint: http://{}/info", addr);
    info!("Session WebSocket endpoint: ws://{}/session", addr);
    info!(
        "Verifier WebSocket endpoint: ws://{}/verifier?sessionId=<id>",
        addr
    );
    info!("Proxy WebSocket endpoint: ws://{}/proxy?token=<host>", addr);

    axum::serve(listener, app)
        .await
        .expect("Server error");
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub(crate) enum HandlerType {
    Sent,
    Recv,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub(crate) enum HandlerPart {
    StartLine,
    Protocol,
    Method,
    RequestTarget,
    StatusCode,
    Headers,
    Body,
    All,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub(crate) enum HashAlgorithm {
    Blake3,
    Sha256,
    Keccak256,
}

/// Comparison operator for an ASSERT action. Evaluated by the verifier against
/// the revealed value.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum AssertOp {
    Gt,
    Gte,
    Lt,
    Lte,
    Between,
    In,
}

/// How the verifier interprets the revealed value and the operand(s) when
/// evaluating an ASSERT comparison. Required for the ordering ops and `between`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum AssertValueType {
    Number,
    Bigint,
    Date,
    String,
}

// Not `Copy`: the `Assert` variant holds a `Vec`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "UPPERCASE")]
pub(crate) enum HandlerAction {
    Reveal,
    Hash {
        algorithm: HashAlgorithm,
    },
    /// Reveal the data (like `Reveal`) and have the verifier evaluate a
    /// comparison against it. The boolean outcome is reported on `HandlerResult`.
    Assert {
        op: AssertOp,
        /// How to type the comparison. Required for ordering ops and `between`;
        /// absent for `in`.
        #[serde(default, rename = "valueType", skip_serializing_if = "Option::is_none")]
        value_type: Option<AssertValueType>,
        /// Operand for `gt`/`gte`/`lt`/`lte`. JSON number or string.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        value: Option<serde_json::Value>,
        /// Lower bound for `between`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        min: Option<serde_json::Value>,
        /// Upper bound for `between`.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        max: Option<serde_json::Value>,
        /// Whether `between` bounds are inclusive (default true).
        #[serde(default, skip_serializing_if = "Option::is_none")]
        inclusive: Option<bool>,
        /// Candidate values for `in` membership.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        values: Option<Vec<serde_json::Value>>,
    },
}

impl Default for HandlerAction {
    fn default() -> Self {
        Self::Reveal
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Handler {
    #[serde(rename = "type")]
    pub(crate) handler_type: HandlerType,
    pub(crate) part: HandlerPart,
    #[serde(default)]
    pub(crate) action: HandlerAction,
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
pub(crate) struct RangeWithHandler {
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) handler: Handler,
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
    /// Outcome of an ASSERT action. `None` for REVEAL/HASH handlers.
    #[serde(skip_serializing_if = "Option::is_none")]
    assert: Option<bool>,
}

// Verification result containing handler results or an error
#[derive(Debug, Clone, Serialize)]
struct VerificationResult {
    results: Vec<HandlerResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

// Type aliases for WebSocket senders
type ProverSocketSender = oneshot::Sender<TungsteniteStream>;
type ProxySocketSender = oneshot::Sender<TungsteniteStream>;

// Session data stored in AppState
pub(crate) struct SessionData {
    pub(crate) prover_socket_tx: Option<ProverSocketSender>,
    /// In proxy mode, the verifier task stores a sender here so the /proxy
    /// endpoint can route the prover's proxy WebSocket to it.
    pub(crate) proxy_socket_tx: Option<ProxySocketSender>,
}

// Application state for sharing data between handlers
#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) sessions: Arc<Mutex<HashMap<String, SessionData>>>,
    pub(crate) config: Arc<Config>,
}

// Query parameters for verifier WebSocket connection
#[derive(Debug, Deserialize)]
struct VerifierQuery {
    #[serde(rename = "sessionId")]
    session_id: String,
}

// Query parameters for proxy WebSocket connection
// Supports both `token` (notary.pse.dev compatible) and `host` (legacy)
// In proxy mode, `session_id` routes the WS to the verifier task.
#[derive(Debug, Deserialize)]
struct ProxyQuery {
    #[serde(alias = "host")]
    token: String,
    #[serde(rename = "sessionId")]
    session_id: Option<String>,
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
pub(crate) struct WebhookConfig {
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) headers: HashMap<String, String>,
}

/// Application configuration loaded from YAML
#[derive(Debug, Clone, Deserialize, Default)]
pub(crate) struct Config {
    #[serde(default)]
    pub(crate) webhooks: HashMap<String, WebhookConfig>,
}

impl Config {
    /// Load configuration from YAML file, returns default if file doesn't exist
    fn load(path: &Path) -> Self {
        match std::fs::read_to_string(path) {
            Ok(contents) => match serde_yaml_ng::from_str(&contents) {
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

/// Info response structure
#[derive(Debug, Serialize)]
struct InfoResponse {
    /// Package version from Cargo.toml
    version: &'static str,
    /// Git commit hash (from GIT_HASH env var, set by CI)
    git_hash: String,
    /// TLSNotary library version
    tlsn_version: &'static str,
}

/// Info endpoint handler - returns server information as JSON
pub(crate) async fn info_handler() -> impl IntoResponse {
    let git_hash = std::env::var("GIT_HASH").unwrap_or_else(|_| "dev".to_string());

    axum::Json(InfoResponse {
        version: env!("CARGO_PKG_VERSION"),
        git_hash,
        tlsn_version: "0.1.0-alpha.15",
    })
}

// WebSocket session handler for extension
pub(crate) async fn session_ws_handler(
    ws: WsUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_session_websocket(socket, state))
}

/// Helper to send typed server messages
async fn send_server_message(socket: &mut TungsteniteStream, message: &ServerMessage) -> bool {
    match socket
        .send(Message::Text(serde_json::to_string(message).unwrap().into()))
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
async fn send_error(socket: &mut TungsteniteStream, message: &str) {
    let _ = send_server_message(socket, &ServerMessage::Error {
        message: message.to_string(),
    })
    .await;
}

// Handle the session WebSocket connection with typed message protocol
async fn handle_session_websocket(mut socket: TungsteniteStream, state: Arc<AppState>) {
    use futures_util::StreamExt;

    // Generate session ID upfront (but don't send yet - wait for register)
    let session_id = Uuid::new_v4().to_string();
    info!("[{}] New session WebSocket connected", session_id);

    // Wait for "register" message first
    let register_msg = match socket.next().await {
        Some(Ok(Message::Text(text))) => text,
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

    // Create channels for prover socket, reveal config, and results
    let (prover_socket_tx, prover_socket_rx) = oneshot::channel::<TungsteniteStream>();
    let (reveal_config_tx, reveal_config_rx) = oneshot::channel::<RevealConfig>();
    let (result_tx, result_rx) = oneshot::channel::<VerificationResult>();

    let session_data_storage = Arc::new(session_data.clone());

    let session_config = SessionConfig {
        max_recv_data,
        max_sent_data,
    };

    // Store session data (so prover can connect)
    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(
            session_id.clone(),
            SessionData {
                prover_socket_tx: Some(prover_socket_tx),
                proxy_socket_tx: None,
            },
        );
    }

    info!(
        "[{}] Session stored, prover can now connect to /verifier",
        session_id
    );

    // Spawn the verifier task with the result sender
    let session_id_clone = session_id.clone();
    let state_clone = state.clone();
    let session_data_clone = session_data_storage.clone();
    tokio::spawn(async move {
        run_verifier_task(
            session_id_clone,
            session_config,
            (*session_data_clone).clone(),
            reveal_config_rx,
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
        Some(Ok(Message::Text(text))) => text,
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

    // Forward reveal config to verifier task
    if reveal_config_tx.send(reveal_config).is_err() {
        error!(
            "[{}] ❌ Verifier task dropped reveal config receiver",
            session_id
        );
        return;
    }

    info!(
        "[{}] ✅ Reveal config sent, verifier task can now proceed",
        session_id
    );

    // Wait for verification result
    match result_rx.await {
        Ok(result) if result.error.is_some() => {
            let err_msg = result.error.as_deref().unwrap_or("Unknown error");
            error!("[{}] ❌ {}", session_id, err_msg);
            send_error(&mut socket, err_msg).await;
        }
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
    let _ = socket.close(None).await;
    info!("[{}] Session WebSocket closed", session_id);
}

// WebSocket handler for verifier (prover connection)
pub(crate) async fn verifier_ws_handler(
    ws: WsUpgrade,
    State(state): State<Arc<AppState>>,
    Query(query): Query<VerifierQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let session_id = query.session_id;

    // Look up the session and extract the prover socket sender.
    // Don't remove the session — proxy mode needs it for the proxy WS routing.
    let prover_socket_tx = {
        let mut sessions = state.sessions.lock().await;
        sessions
            .get_mut(&session_id)
            .and_then(|s| s.prover_socket_tx.take())
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
// Compatible with notary.pse.dev: /proxy?token=<host> or legacy /proxy?host=<host>
// In proxy mode: /proxy?token=<host>&sessionId=<id> routes to verifier task
pub(crate) async fn proxy_ws_handler(
    ws: WsUpgrade,
    Query(query): Query<ProxyQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let host = query.token;
    let session_id = query.session_id;

    info!(
        "[Proxy] New proxy request for host: {}, sessionId: {:?}",
        host, session_id
    );

    if let Some(sid) = session_id {
        // Proxy mode: route this WebSocket to the verifier task
        Ok(ws.on_upgrade(move |socket| async move {
            let proxy_tx = {
                let mut sessions = state.sessions.lock().await;
                sessions
                    .get_mut(&sid)
                    .and_then(|s| s.proxy_socket_tx.take())
            };
            match proxy_tx {
                Some(tx) => {
                    info!("[Proxy] Routing proxy WS to verifier task for session {}", sid);
                    if tx.send(socket).is_err() {
                        error!("[Proxy] Verifier task dropped proxy channel for session {}", sid);
                    }
                }
                None => {
                    error!(
                        "[Proxy] No proxy socket channel for session {} (not proxy mode or already connected)",
                        sid
                    );
                }
            }
        }))
    } else {
        // MPC mode: standard TCP bridge
        Ok(ws.on_upgrade(move |socket| handle_proxy_connection(socket, host)))
    }
}

// Handle the proxy WebSocket connection by bridging to TCP
async fn handle_proxy_connection(ws: TungsteniteStream, host: String) {
    use futures_util::StreamExt;

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
    if let Err(err) = tcp_stream.set_nodelay(true) {
        warn!(
            "[{}] failed to set TCP_NODELAY on outbound proxy connection: {}",
            proxy_id, err
        );
    }

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
                        Message::Binary(data) => {
                            let len = data.len();
                            total_bytes += len as u64;

                            if let Err(e) = tcp_write.write_all(&data).await {
                                error!("[{}] Failed to write to TCP: {}", proxy_id_clone, e);
                                break;
                            }
                        }
                        Message::Close(_) => {
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
        const CHUNK: usize = 8192;
        let mut buf = BytesMut::with_capacity(CHUNK);
        let mut total_bytes = 0u64;

        loop {
            buf.reserve(CHUNK);
            match tcp_read.read_buf(&mut buf).await {
                Ok(0) => {
                    info!(
                        "[{}] TCP read EOF (server closed), forwarded {} bytes to WebSocket",
                        proxy_id_clone, total_bytes
                    );
                    // Send WebSocket close frame to signal EOF to client
                    if let Err(e) = ws_sink.send(Message::Close(None)).await {
                        error!("[{}] Failed to send WebSocket close frame: {}", proxy_id_clone, e);
                    }
                    break;
                }
                Ok(n) => {
                    total_bytes += n as u64;
                    let chunk = buf.split().freeze();

                    if let Err(e) = ws_sink.send(Message::Binary(chunk)).await {
                        error!("[{}] Failed to send to WebSocket: {}", proxy_id_clone, e);
                        break;
                    }
                }
                Err(e) => {
                    error!("[{}] TCP read error: {}", proxy_id_clone, e);
                    // Send close frame on error too
                    let _ = ws_sink.send(Message::Close(None)).await;
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
    reveal_config_rx: oneshot::Receiver<RevealConfig>,
    socket_rx: oneshot::Receiver<TungsteniteStream>,
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

    // Set up a channel to receive the prover's proxy WebSocket.
    // In universal mode the verifier accepts both MPC and Proxy — the prover decides.
    // If the prover chooses proxy, it connects to /proxy?sessionId=... which routes here.
    let (proxy_tx, proxy_rx) = oneshot::channel::<TungsteniteStream>();
    {
        let mut sessions = state.sessions.lock().await;
        if let Some(session_data) = sessions.get_mut(&session_id) {
            session_data.proxy_socket_tx = Some(proxy_tx);
        }
    }
    let proxy_socket_rx = Some(proxy_rx);

    // Wrap the WebSocket stream in WsStream for AsyncRead/AsyncWrite compatibility
    let stream = WsStream::new(socket);
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
        verifier(stream, config.max_sent_data, config.max_recv_data, proxy_socket_rx),
    )
    .await;

    // Handle the verification result
    match verification_result {
        Ok(Ok((server_name, transcript, transcript_commitments))) => {
            info!("[{}] ✅ Verification completed successfully!", session_id);

            // Extract sent and received data
            let sent_bytes = transcript.sent_unsafe().to_vec();
            let recv_bytes = transcript.received_unsafe().to_vec();

            info!(
                "[{}] Sent data length: {} bytes (authed: {} bytes)",
                session_id,
                sent_bytes.len(),
                transcript.sent_authed().len(),
            );
            info!(
                "[{}] Received data length: {} bytes (authed: {} bytes)",
                session_id,
                recv_bytes.len(),
                transcript.received_authed().len()
            );

            // Wait for RevealConfig from the session handler (with timeout)
            let reveal_config_wait_timeout = Duration::from_secs(30);
            let reveal_config = match timeout(reveal_config_wait_timeout, reveal_config_rx).await {
                Ok(Ok(config)) => {
                    info!("[{}] ✅ RevealConfig received, mapping results", session_id);
                    config
                }
                Ok(Err(_)) => {
                    error!(
                        "[{}] ❌ RevealConfig channel closed before delivery",
                        session_id
                    );
                    cleanup_session(&state, &session_id).await;
                    return;
                }
                Err(_) => {
                    error!(
                        "[{}] ❌ Timed out waiting for RevealConfig after verification",
                        session_id
                    );
                    cleanup_session(&state, &session_id).await;
                    return;
                }
            };

            // Validate that reveal_config ranges match authenticated transcript
            // ranges. Hash-committed ranges aren't in `sent_authed`/`received_authed`
            // (those hold revealed plaintext), so we union the commitment ranges in.
            if let Err((direction, start, end)) = verify_reveal_config(
                &reveal_config,
                &transcript,
                &transcript_commitments,
            ) {
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

            // Map revealed ranges to handler results using raw transcript bytes.
            // For HASH handlers, substitute the hex-encoded hash digest (the
            // plaintext was never revealed, so `bytes[..]` is zeroed).

            let mut handler_results = Vec::new();

            handler_results.extend(process_ranges(
                &reveal_config.sent,
                &sent_bytes,
                tlsn::transcript::Direction::Sent,
                &transcript_commitments,
                "SENT",
                &session_id,
            ));
            handler_results.extend(process_ranges(
                &reveal_config.recv,
                &recv_bytes,
                tlsn::transcript::Direction::Received,
                &transcript_commitments,
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
                error: None,
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
            let msg = format!("Verification failed: {}", e);
            error!("[{}] ❌ {}", session_id, msg);
            let _ = result_tx.send(VerificationResult {
                results: vec![],
                error: Some(msg),
            });
        }
        Err(_) => {
            let msg = format!("Verification timed out after {:?}", verification_timeout);
            error!("[{}] ⏱️  {}", session_id, msg);
            let _ = result_tx.send(VerificationResult {
                results: vec![],
                error: Some(msg),
            });
        }
    }

    // Clean up session (if it still exists in the map)
    cleanup_session(&state, &session_id).await;

    info!("[{}] Verifier task completed and cleaned up", session_id);
}

/// Validates that all ranges in reveal config are fully within authenticated transcript ranges.
///
/// "Authenticated" means either:
/// - Revealed as plaintext (in `transcript.sent_authed()` / `received_authed()`), or
/// - Hash-committed via `TranscriptCommitment::Hash` (the prover proved knowledge of
///   plaintext whose hash matches the commitment; the range itself is bound).
///
/// Returns error with (direction, start, end) if any range contains unauthenticated data.
fn verify_reveal_config(
    reveal_config: &RevealConfig,
    transcript: &PartialTranscript,
    transcript_commitments: &[tlsn::transcript::TranscriptCommitment],
) -> Result<(), (String, usize, usize)> {
    use tlsn::transcript::{Direction, TranscriptCommitment};

    // Union of revealed + hash-committed ranges, per direction.
    let mut sent_auth = transcript.sent_authed().clone();
    let mut recv_auth = transcript.received_authed().clone();
    for commitment in transcript_commitments {
        if let TranscriptCommitment::Hash(hash) = commitment {
            match hash.direction {
                Direction::Sent => sent_auth.union_mut(&hash.idx),
                Direction::Received => recv_auth.union_mut(&hash.idx),
            }
        }
    }

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

    validate_ranges_against_auth_set(&reveal_config.sent, &sent_auth, "sent")?;
    validate_ranges_against_auth_set(&reveal_config.recv, &recv_auth, "recv")?;

    Ok(())
}

// Helper function to clean up session from state
async fn cleanup_session(state: &Arc<AppState>, session_id: &str) {
    let mut sessions = state.sessions.lock().await;
    if sessions.remove(session_id).is_some() {
        info!("[{}] Session removed from state", session_id);
    }
}

/// Processes ranges and extracts values from the transcript.
///
/// - For REVEAL handlers, returns the revealed plaintext bytes as UTF-8.
/// - For HASH handlers, returns the hex-encoded hash digest from the matching
///   `TranscriptCommitment::Hash` (plaintext was never revealed).
fn process_ranges(
    ranges: &[RangeWithHandler],
    bytes: &[u8],
    direction: tlsn::transcript::Direction,
    transcript_commitments: &[tlsn::transcript::TranscriptCommitment],
    direction_label: &str,
    session_id: &str,
) -> Vec<HandlerResult> {
    ranges
        .iter()
        .map(|range_with_handler| {
            // Revealed plaintext for this range (shared by REVEAL and ASSERT).
            let revealed = || {
                if range_with_handler.start < bytes.len()
                    && range_with_handler.end <= bytes.len()
                    && range_with_handler.start < range_with_handler.end
                {
                    String::from_utf8_lossy(
                        &bytes[range_with_handler.start..range_with_handler.end],
                    )
                    .to_string()
                } else {
                    format!(
                        "ERROR: Invalid range [{}, {})",
                        range_with_handler.start, range_with_handler.end
                    )
                }
            };

            let (value, assert) = match &range_with_handler.handler.action {
                HandlerAction::Hash { .. } => (
                    find_hash_digest(
                        transcript_commitments,
                        direction,
                        range_with_handler.start,
                        range_with_handler.end,
                    )
                    .unwrap_or_else(|| {
                        format!(
                            "ERROR: No hash commitment for [{}, {})",
                            range_with_handler.start, range_with_handler.end
                        )
                    }),
                    None,
                ),
                HandlerAction::Reveal => (revealed(), None),
                HandlerAction::Assert {
                    op,
                    value_type,
                    value,
                    min,
                    max,
                    inclusive,
                    values,
                } => {
                    let revealed_value = revealed();
                    let passed = evaluate_assert(
                        &revealed_value,
                        *op,
                        *value_type,
                        value.as_ref(),
                        min.as_ref(),
                        max.as_ref(),
                        *inclusive,
                        values.as_deref(),
                    );
                    (revealed_value, Some(passed))
                }
            };

            debug!(
                "[{}] Mapped {} range [{}, {}) to handler {:?}: {} bytes (assert={:?})",
                session_id,
                direction_label,
                range_with_handler.start,
                range_with_handler.end,
                range_with_handler.handler.part,
                value.len(),
                assert,
            );

            HandlerResult {
                handler: range_with_handler.handler.clone(),
                value,
                assert,
            }
        })
        .collect()
}

/// Trim whitespace and strip a single pair of surrounding double quotes (JSON
/// string values are often revealed with quotes).
fn dequote(value: &str) -> &str {
    let trimmed = value.trim();
    trimmed
        .strip_prefix('"')
        .and_then(|s| s.strip_suffix('"'))
        .unwrap_or(trimmed)
}

/// Parse a value as a float, ignoring `_` and `,` separators (so `"275_000_000"`
/// parses as `275000000`).
fn parse_number(value: &str) -> Option<f64> {
    dequote(value).replace('_', "").replace(',', "").trim().parse::<f64>().ok()
}

/// Parse a value as an arbitrary-size integer (`i128`), ignoring separators.
fn parse_bigint(value: &str) -> Option<i128> {
    dequote(value).replace('_', "").replace(',', "").trim().parse::<i128>().ok()
}

/// Parse a value as a UTC instant. Accepts RFC 3339 / ISO-8601 timestamps and
/// bare `YYYY-MM-DD` dates (treated as midnight UTC).
fn parse_date(value: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    let s = dequote(value).trim();
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
        return Some(dt.with_timezone(&chrono::Utc));
    }
    if let Ok(d) = chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        let ndt = d.and_hms_opt(0, 0, 0)?;
        return Some(chrono::TimeZone::from_utc_datetime(&chrono::Utc, &ndt));
    }
    None
}

/// String form of a JSON operand (inner string for `String`, else its JSON repr).
fn coerce_str(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

/// Interpret a JSON operand as a float (number, or separator-tolerant string).
fn operand_number(value: &serde_json::Value) -> Option<f64> {
    match value {
        serde_json::Value::Number(n) => n.as_f64(),
        serde_json::Value::String(s) => parse_number(s),
        _ => None,
    }
}

/// Interpret a JSON operand as an `i128` (number, or separator-tolerant string).
fn operand_bigint(value: &serde_json::Value) -> Option<i128> {
    match value {
        serde_json::Value::Number(n) => n
            .as_i64()
            .map(i128::from)
            .or_else(|| n.as_u64().map(i128::from)),
        serde_json::Value::String(s) => parse_bigint(s),
        _ => None,
    }
}

/// Compare the revealed value against an operand under the given value type.
/// Returns `None` if either side fails to parse for that type.
fn cmp_typed(
    revealed: &str,
    operand: &serde_json::Value,
    value_type: AssertValueType,
) -> Option<std::cmp::Ordering> {
    match value_type {
        AssertValueType::Number => parse_number(revealed)?.partial_cmp(&operand_number(operand)?),
        AssertValueType::Bigint => Some(parse_bigint(revealed)?.cmp(&operand_bigint(operand)?)),
        AssertValueType::Date => Some(parse_date(revealed)?.cmp(&parse_date(&coerce_str(operand))?)),
        AssertValueType::String => Some(dequote(revealed).cmp(coerce_str(operand).as_str())),
    }
}

/// Evaluate an ASSERT comparison against the revealed value. Returns `false`
/// for any malformed/missing operand, missing `valueType`, or unparseable value
/// (report-only: never aborts verification).
fn evaluate_assert(
    value: &str,
    op: AssertOp,
    value_type: Option<AssertValueType>,
    operand: Option<&serde_json::Value>,
    min: Option<&serde_json::Value>,
    max: Option<&serde_json::Value>,
    inclusive: Option<bool>,
    values: Option<&[serde_json::Value]>,
) -> bool {
    use std::cmp::Ordering;
    match op {
        AssertOp::Gt | AssertOp::Gte | AssertOp::Lt | AssertOp::Lte => {
            let (Some(vt), Some(operand)) = (value_type, operand) else {
                return false;
            };
            let Some(ord) = cmp_typed(value, operand, vt) else {
                return false;
            };
            match op {
                AssertOp::Gt => ord == Ordering::Greater,
                AssertOp::Gte => ord != Ordering::Less,
                AssertOp::Lt => ord == Ordering::Less,
                AssertOp::Lte => ord != Ordering::Greater,
                _ => unreachable!(),
            }
        }
        AssertOp::Between => {
            let (Some(vt), Some(min), Some(max)) = (value_type, min, max) else {
                return false;
            };
            // lo = cmp(value, min); hi = cmp(value, max).
            let (Some(lo), Some(hi)) = (cmp_typed(value, min, vt), cmp_typed(value, max, vt)) else {
                return false;
            };
            if inclusive.unwrap_or(true) {
                lo != Ordering::Less && hi != Ordering::Greater
            } else {
                lo == Ordering::Greater && hi == Ordering::Less
            }
        }
        AssertOp::In => {
            let Some(candidates) = values else {
                return false;
            };
            let needle = dequote(value);
            let needle_num = parse_number(value);
            candidates.iter().any(|candidate| {
                if coerce_str(candidate) == needle {
                    return true;
                }
                // Separator-aware numeric fallback so "275_000_000" matches 275000000.
                match (needle_num, operand_number(candidate)) {
                    (Some(a), Some(b)) => a == b,
                    _ => false,
                }
            })
        }
    }
}

#[cfg(test)]
mod assert_eval_tests {
    use super::{evaluate_assert, AssertOp, AssertValueType};
    use serde_json::json;

    fn num(op: AssertOp, value: &str, operand: serde_json::Value) -> bool {
        evaluate_assert(
            value,
            op,
            Some(AssertValueType::Number),
            Some(&operand),
            None,
            None,
            None,
            None,
        )
    }

    #[test]
    fn number_ignores_separators() {
        // Regression: "275_000_000" must compare numerically, not fail to parse.
        assert!(num(AssertOp::Gt, "275_000_000", json!(1000)));
        assert!(num(AssertOp::Gte, "275_000_000", json!(275000000)));
        assert!(!num(AssertOp::Lt, "275_000_000", json!(1000)));
        assert!(num(AssertOp::Lte, "1,000", json!(1000)));
    }

    #[test]
    fn number_basic_and_string_operand() {
        assert!(num(AssertOp::Gt, "1500", json!(1000)));
        assert!(!num(AssertOp::Gt, "500", json!(1000)));
        assert!(num(AssertOp::Gte, "1000", json!("1000"))); // operand given as string
        assert!(num(AssertOp::Gte, "  \"1500\" ", json!(1000))); // quoted + whitespace
    }

    #[test]
    fn missing_value_type_or_operand_is_false() {
        // No valueType.
        assert!(!evaluate_assert("5", AssertOp::Gt, None, Some(&json!(1)), None, None, None, None));
        // No operand.
        assert!(!evaluate_assert(
            "5",
            AssertOp::Gt,
            Some(AssertValueType::Number),
            None,
            None,
            None,
            None,
            None
        ));
        // Non-numeric value.
        assert!(!num(AssertOp::Gt, "abc", json!(1)));
    }

    #[test]
    fn bigint_beyond_float_precision() {
        let vt = Some(AssertValueType::Bigint);
        // 2^53 + 1 vs 2^53 — indistinguishable as f64, correct as i128.
        assert!(evaluate_assert(
            "9007199254740993",
            AssertOp::Gt,
            vt,
            Some(&json!("9007199254740992")),
            None,
            None,
            None,
            None
        ));
        assert!(evaluate_assert(
            "275_000_000",
            AssertOp::Gte,
            vt,
            Some(&json!(1000)),
            None,
            None,
            None,
            None
        ));
    }

    #[test]
    fn date_ordering() {
        let vt = Some(AssertValueType::Date);
        assert!(evaluate_assert(
            "2025-11-12T12:00:00Z",
            AssertOp::Gt,
            vt,
            Some(&json!("2025-01-01T00:00:00Z")),
            None,
            None,
            None,
            None
        ));
        // Date-only operand (midnight UTC), quoted revealed value.
        assert!(evaluate_assert(
            "\"2025-11-12T12:00:00Z\"",
            AssertOp::Gte,
            vt,
            Some(&json!("2025-11-12")),
            None,
            None,
            None,
            None
        ));
        // Unparseable date -> false.
        assert!(!evaluate_assert(
            "not-a-date",
            AssertOp::Gt,
            vt,
            Some(&json!("2025-01-01")),
            None,
            None,
            None,
            None
        ));
    }

    #[test]
    fn string_lexicographic() {
        let vt = Some(AssertValueType::String);
        assert!(evaluate_assert(
            "banana",
            AssertOp::Gt,
            vt,
            Some(&json!("apple")),
            None,
            None,
            None,
            None
        ));
        assert!(evaluate_assert(
            "\"apple\"",
            AssertOp::Lt,
            vt,
            Some(&json!("banana")),
            None,
            None,
            None,
            None
        ));
    }

    #[test]
    fn between_typed() {
        let vt = Some(AssertValueType::Number);
        // Inclusive (default).
        assert!(evaluate_assert("10", AssertOp::Between, vt, None, Some(&json!(10)), Some(&json!(20)), None, None));
        assert!(evaluate_assert("20", AssertOp::Between, vt, None, Some(&json!(10)), Some(&json!(20)), None, None));
        // Exclusive.
        assert!(!evaluate_assert("10", AssertOp::Between, vt, None, Some(&json!(10)), Some(&json!(20)), Some(false), None));
        assert!(evaluate_assert("15", AssertOp::Between, vt, None, Some(&json!(10)), Some(&json!(20)), Some(false), None));
        // Separators in the revealed value.
        assert!(evaluate_assert("1_500", AssertOp::Between, vt, None, Some(&json!(1000)), Some(&json!(2000)), None, None));
        // Missing bound / missing valueType -> false.
        assert!(!evaluate_assert("15", AssertOp::Between, vt, None, Some(&json!(10)), None, None, None));
        assert!(!evaluate_assert("15", AssertOp::Between, None, None, Some(&json!(10)), Some(&json!(20)), None, None));
    }

    #[test]
    fn membership_in() {
        let strs = [json!("active"), json!("pending")];
        assert!(evaluate_assert("active", AssertOp::In, None, None, None, None, None, Some(&strs)));
        assert!(evaluate_assert("\"active\"", AssertOp::In, None, None, None, None, None, Some(&strs)));
        assert!(!evaluate_assert("closed", AssertOp::In, None, None, None, None, None, Some(&strs)));

        let nums = [json!(200), json!(275000000)];
        assert!(evaluate_assert("200", AssertOp::In, None, None, None, None, None, Some(&nums)));
        // Separator-aware numeric membership.
        assert!(evaluate_assert("275_000_000", AssertOp::In, None, None, None, None, None, Some(&nums)));
        assert!(!evaluate_assert("404", AssertOp::In, None, None, None, None, None, Some(&nums)));
    }
}

/// Finds the hash digest (hex) for a given range+direction from the list of
/// transcript commitments. Returns `None` if no `Hash` commitment covers the
/// exact range for the requested direction.
fn find_hash_digest(
    commitments: &[tlsn::transcript::TranscriptCommitment],
    direction: tlsn::transcript::Direction,
    start: usize,
    end: usize,
) -> Option<String> {
    use tlsn::transcript::TranscriptCommitment;

    for commitment in commitments {
        if let TranscriptCommitment::Hash(hash) = commitment {
            if hash.direction == direction
                && (start..end).all(|i| hash.idx.contains(&i))
            {
                let bytes = hash.hash.value.as_bytes();
                let mut hex_str = String::with_capacity(bytes.len() * 2);
                for b in bytes {
                    use std::fmt::Write;
                    let _ = write!(hex_str, "{:02x}", b);
                }
                return Some(hex_str);
            }
        }
    }
    None
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
