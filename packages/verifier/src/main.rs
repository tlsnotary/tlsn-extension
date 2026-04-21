mod axum_websocket;
mod verifier;
mod ws_mux;

#[cfg(test)]
mod tests;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::get,
    Router,
};
use axum_websocket::{WebSocket, WebSocketUpgrade};
use rangeset::prelude::RangeSet;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tlsn::transcript::PartialTranscript;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use tokio::time::timeout;
use tower_http::cors::CorsLayer;
use tracing::{debug, error, info, warn};
use uuid::Uuid;
use verifier::verifier;
use ws_mux::{session_stream, SessionStream};

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
        "Max data limits: max_sent_data={}, max_recv_data={}",
        config.max_sent_data, config.max_recv_data
    );
    info!(
        "Webhook configurations loaded: {} endpoints",
        config.webhooks.len()
    );
    for (server_name, webhook) in &config.webhooks {
        info!("  {} -> {}", server_name, webhook.url);
    }

    let app_state = Arc::new(AppState {
        config: Arc::new(config),
    });

    // Build router with routes
    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/info", get(info_handler))
        .route("/session", get(session_ws_handler))
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

    info!("Server listening on http://{}", addr);
    info!("Health endpoint: http://{}/health", addr);
    info!("Info endpoint: http://{}/info", addr);
    info!("Session WebSocket endpoint: ws://{}/session", addr);
    info!("Proxy WebSocket endpoint: ws://{}/proxy?token=<host>", addr);

    axum::serve(listener, app)
        .tcp_nodelay(true)
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct Handler {
    #[serde(rename = "type")]
    pub(crate) handler_type: HandlerType,
    pub(crate) part: HandlerPart,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct RangeWithHandler {
    pub(crate) start: usize,
    pub(crate) end: usize,
    pub(crate) handler: Handler,
}

/// Reveal configuration sent by the client after MPC completes.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct RevealConfig {
    sent: Vec<RangeWithHandler>,
    recv: Vec<RangeWithHandler>,
}

/// Handler result with revealed value.
#[derive(Debug, Clone, Serialize)]
struct HandlerResult {
    #[serde(flatten)]
    handler: Handler,
    value: String,
}

/// Application state shared across handlers.
#[derive(Clone)]
pub(crate) struct AppState {
    pub(crate) config: Arc<Config>,
}

/// Query parameters for the proxy WebSocket endpoint.
/// Supports both `token` (notary.pse.dev compatible) and `host` (legacy).
#[derive(Debug, Deserialize)]
struct ProxyQuery {
    #[serde(alias = "host")]
    token: String,
}

// ============================================================================
// WebSocket Message Protocol (Typed Messages)
// ============================================================================

/// Incoming messages from client (extension).
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMessage {
    /// First frame: client identifies itself and opens a session.
    Register {
        #[serde(rename = "sessionData", default)]
        session_data: HashMap<String, String>,
    },
    /// Post-MPC frame: client specifies which byte ranges to reveal.
    RevealConfig {
        sent: Vec<RangeWithHandler>,
        recv: Vec<RangeWithHandler>,
    },
}

/// Outgoing messages to client (extension).
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMessage {
    /// Sent after the server accepts `register`. The client may now begin MPC
    /// by sending Binary frames.
    Registered,
    /// Sent after verification + reveal processing completes.
    SessionCompleted { results: Vec<HandlerResult> },
    /// Fatal error; the server closes the connection after sending.
    Error { message: String },
}

// ============================================================================
// Webhook Types
// ============================================================================

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct WebhookConfig {
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) headers: HashMap<String, String>,
}

/// Application configuration loaded from YAML.
///
/// `max_sent_data` and `max_recv_data` are the server-enforced absolute
/// maximums for MPC preprocessing. The prover's own requested max (sent via
/// the MPC protocol) must be `<=` these values or verification is rejected.
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct Config {
    #[serde(default = "default_max_sent_data")]
    pub(crate) max_sent_data: usize,
    #[serde(default = "default_max_recv_data")]
    pub(crate) max_recv_data: usize,
    #[serde(default)]
    pub(crate) webhooks: HashMap<String, WebhookConfig>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            max_sent_data: default_max_sent_data(),
            max_recv_data: default_max_recv_data(),
            webhooks: HashMap::new(),
        }
    }
}

fn default_max_sent_data() -> usize {
    1 << 20 // 1 MiB
}

fn default_max_recv_data() -> usize {
    16 << 20 // 16 MiB
}

impl Config {
    /// Load configuration from YAML, then apply env var overrides
    /// (`VERIFIER_MAX_SENT_DATA`, `VERIFIER_MAX_RECV_DATA`).
    fn load(path: &Path) -> Self {
        let mut config = match std::fs::read_to_string(path) {
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
        };

        if let Ok(v) = std::env::var("VERIFIER_MAX_SENT_DATA") {
            match v.parse() {
                Ok(n) => config.max_sent_data = n,
                Err(e) => warn!("Invalid VERIFIER_MAX_SENT_DATA: {}", e),
            }
        }
        if let Ok(v) = std::env::var("VERIFIER_MAX_RECV_DATA") {
            match v.parse() {
                Ok(n) => config.max_recv_data = n,
                Err(e) => warn!("Invalid VERIFIER_MAX_RECV_DATA: {}", e),
            }
        }

        config
    }

    fn get_webhook(&self, server_name: &str) -> Option<&WebhookConfig> {
        self.webhooks
            .get(server_name)
            .or_else(|| self.webhooks.get("*"))
    }
}

/// Webhook payload sent to configured endpoints.
#[derive(Debug, Serialize)]
struct WebhookPayload {
    server_name: String,
    results: Vec<HandlerResult>,
    config: RevealConfigForWebhook,
    session: SessionInfo,
    transcript: RedactedTranscript,
}

#[derive(Debug, Serialize)]
struct RevealConfigForWebhook {
    sent: Vec<RangeWithHandler>,
    recv: Vec<RangeWithHandler>,
}

#[derive(Debug, Serialize)]
struct SessionInfo {
    id: String,
    #[serde(flatten)]
    data: HashMap<String, String>,
}

/// Redacted transcript: bytes outside revealed ranges are zeroed.
#[derive(Debug, Serialize)]
struct RedactedTranscript {
    sent: String,
    recv: String,
    sent_length: usize,
    recv_length: usize,
}

impl RedactedTranscript {
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

    fn redact_bytes(bytes: &[u8], ranges: &[RangeWithHandler]) -> String {
        let mut redacted = vec![0u8; bytes.len()];

        for range in ranges {
            if range.start < bytes.len() && range.end <= bytes.len() {
                redacted[range.start..range.end].copy_from_slice(&bytes[range.start..range.end]);
            }
        }

        String::from_utf8_lossy(&redacted).to_string()
    }
}

// Health check endpoint
async fn health_handler() -> impl IntoResponse {
    "ok"
}

#[derive(Debug, Serialize)]
struct InfoResponse {
    version: &'static str,
    git_hash: String,
    tlsn_version: &'static str,
}

pub(crate) async fn info_handler() -> impl IntoResponse {
    let git_hash = std::env::var("GIT_HASH").unwrap_or_else(|_| "dev".to_string());

    axum::Json(InfoResponse {
        version: env!("CARGO_PKG_VERSION"),
        git_hash,
        tlsn_version: "0.1.0-alpha.15-pre",
    })
}

// ============================================================================
// Session WebSocket
// ============================================================================

pub(crate) async fn session_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_session_websocket(socket, state))
}

/// Send a typed server message as a Text frame on the raw socket (used for
/// the initial `registered` and any pre-mux errors).
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

async fn send_error(socket: &mut WebSocket, message: &str) {
    let _ = send_server_message(
        socket,
        &ServerMessage::Error {
            message: message.to_string(),
        },
    )
    .await;
}

/// Send a server message via the mux's text channel (used after the WS has
/// been split into text + binary channels).
fn send_server_message_tx(tx: &mpsc::UnboundedSender<String>, message: &ServerMessage) {
    if let Ok(json) = serde_json::to_string(message) {
        let _ = tx.send(json);
    }
}

async fn handle_session_websocket(mut socket: WebSocket, state: Arc<AppState>) {
    use futures_util::StreamExt;

    // UUID is generated server-side for log correlation only. It is not sent
    // to the client and has no protocol meaning.
    let session_id = Uuid::new_v4().to_string();
    info!("[{}] New session WebSocket connected", session_id);

    // Step 1: read the `register` text frame.
    let register_text = match socket.next().await {
        Some(Ok(axum_websocket::Message::Text(text))) => text,
        Some(Ok(msg)) => {
            error!(
                "[{}] Expected text register frame, got: {:?}",
                session_id, msg
            );
            send_error(&mut socket, "Expected text register frame").await;
            return;
        }
        Some(Err(e)) => {
            error!("[{}] WebSocket error before register: {}", session_id, e);
            return;
        }
        None => {
            error!("[{}] Connection closed before register", session_id);
            return;
        }
    };

    let client_msg: ClientMessage = match serde_json::from_str(&register_text) {
        Ok(msg) => msg,
        Err(e) => {
            error!("[{}] Failed to parse register: {}", session_id, e);
            send_error(&mut socket, &format!("Invalid register: {}", e)).await;
            return;
        }
    };

    let session_data = match client_msg {
        ClientMessage::Register { session_data } => session_data,
        _ => {
            error!("[{}] Expected 'register' message type", session_id);
            send_error(&mut socket, "Expected 'register' message type").await;
            return;
        }
    };

    info!(
        "[{}] Registered: sessionData keys: {:?}",
        session_id,
        session_data.keys().collect::<Vec<_>>()
    );

    // Step 2: acknowledge with `registered`.
    if !send_server_message(&mut socket, &ServerMessage::Registered).await {
        return;
    }

    // Step 3: split the socket into (Text, Binary) channels. From here on the
    // raw socket is owned by the mux tasks; all further communication goes
    // through the channels.
    let SessionStream {
        mut text_rx,
        send_text_tx,
        binary,
    } = session_stream(socket);

    // Step 4: run the MPC verifier against the binary half, using the
    // server's configured absolute max limits as the ceiling.
    let max_sent = state.config.max_sent_data;
    let max_recv = state.config.max_recv_data;
    info!(
        "[{}] Starting verification (server ceiling: max_sent={}, max_recv={})",
        session_id, max_sent, max_recv
    );

    let verification_timeout = Duration::from_secs(120);
    let verification = timeout(verification_timeout, verifier(binary, max_sent, max_recv)).await;

    let (server_name, transcript) = match verification {
        Ok(Ok(out)) => {
            info!("[{}] ✅ Verification completed successfully", session_id);
            out
        }
        Ok(Err(e)) => {
            error!("[{}] ❌ Verification failed: {}", session_id, e);
            send_server_message_tx(
                &send_text_tx,
                &ServerMessage::Error {
                    message: format!("Verification failed: {}", e),
                },
            );
            return;
        }
        Err(_) => {
            error!(
                "[{}] ⏱️  Verification timed out after {:?}",
                session_id, verification_timeout
            );
            send_server_message_tx(
                &send_text_tx,
                &ServerMessage::Error {
                    message: "Verification timed out".into(),
                },
            );
            return;
        }
    };

    let sent_bytes = transcript.sent_unsafe().to_vec();
    let recv_bytes = transcript.received_unsafe().to_vec();

    info!(
        "[{}] Transcript: sent={} bytes (authed={}), recv={} bytes (authed={})",
        session_id,
        sent_bytes.len(),
        transcript.sent_authed().len(),
        recv_bytes.len(),
        transcript.received_authed().len()
    );

    // Step 5: await the `reveal_config` text frame.
    let reveal_text = match text_rx.recv().await {
        Some(t) => t,
        None => {
            error!(
                "[{}] Connection closed before reveal_config",
                session_id
            );
            return;
        }
    };

    let client_msg: ClientMessage = match serde_json::from_str(&reveal_text) {
        Ok(msg) => msg,
        Err(e) => {
            error!("[{}] Failed to parse reveal_config: {}", session_id, e);
            send_server_message_tx(
                &send_text_tx,
                &ServerMessage::Error {
                    message: format!("Invalid reveal_config: {}", e),
                },
            );
            return;
        }
    };

    let reveal_config = match client_msg {
        ClientMessage::RevealConfig { sent, recv } => RevealConfig { sent, recv },
        _ => {
            error!("[{}] Expected 'reveal_config' message type", session_id);
            send_server_message_tx(
                &send_text_tx,
                &ServerMessage::Error {
                    message: "Expected 'reveal_config' message type".into(),
                },
            );
            return;
        }
    };

    info!(
        "[{}] Received reveal_config: {} sent ranges, {} recv ranges",
        session_id,
        reveal_config.sent.len(),
        reveal_config.recv.len()
    );

    // Step 6: validate reveal ranges against the authenticated transcript.
    if let Err((direction, start, end)) = verify_reveal_config(&reveal_config, &transcript) {
        error!(
            "[{}] ❌ Invalid {} range [{}, {}) - not fully within authenticated ranges",
            session_id, direction, start, end
        );
        send_server_message_tx(
            &send_text_tx,
            &ServerMessage::Error {
                message: format!(
                    "Invalid {} range [{}, {}) - not within authenticated ranges",
                    direction, start, end
                ),
            },
        );
        return;
    }

    // Step 7: extract handler values from the transcript.
    let mut handler_results = Vec::new();
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

    // Step 8: fire webhook (fire-and-forget) if configured.
    let server_name_str = server_name.as_ref();
    if let Some(webhook_config) = state.config.get_webhook(server_name_str) {
        info!(
            "[{}] Webhook configured for {}, sending POST to {}",
            session_id, server_name_str, webhook_config.url
        );

        let redacted_transcript =
            RedactedTranscript::from_transcript(&sent_bytes, &recv_bytes, &reveal_config);

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

        let webhook_config = webhook_config.clone();
        let session_id_for_webhook = session_id.clone();
        tokio::spawn(async move {
            send_webhook(&webhook_config, &payload, &session_id_for_webhook).await;
        });
    }

    // Step 9: send `session_completed`.
    send_server_message_tx(
        &send_text_tx,
        &ServerMessage::SessionCompleted {
            results: handler_results,
        },
    );
    info!("[{}] ✅ session_completed sent", session_id);

    // Drop send_text_tx and text_rx so the mux tasks shut down and the
    // WebSocket closes.
}

/// Validates that all ranges in reveal config are fully within authenticated
/// transcript ranges. Returns `(direction, start, end)` of the first offender.
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

async fn send_webhook(config: &WebhookConfig, payload: &WebhookPayload, session_id: &str) {
    let client = reqwest::Client::new();

    let mut request = client.post(&config.url).json(payload);

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
            error!(
                "[{}] ❌ Webhook POST error: {} - {}",
                session_id, config.url, e
            );
        }
    }
}

// ============================================================================
// Proxy WebSocket (unchanged: bridges a WebSocket to a raw TCP connection)
// ============================================================================

pub(crate) async fn proxy_ws_handler(
    ws: WebSocketUpgrade,
    Query(query): Query<ProxyQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let host = query.token;

    info!("[Proxy] New proxy request for host: {}", host);

    Ok(ws.on_upgrade(move |socket| handle_proxy_connection(socket, host)))
}

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

    let (mut ws_sink, mut ws_stream) = ws.split();
    let (mut tcp_read, mut tcp_write) = tokio::io::split(tcp_stream);

    let proxy_id_clone = proxy_id.clone();
    let ws_to_tcp = tokio::spawn(async move {
        let mut total_bytes = 0u64;

        loop {
            match ws_stream.next().await {
                Some(Ok(msg)) => match msg {
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
                },
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
                    if let Err(e) = ws_sink.send(axum_websocket::Message::Close(None)).await {
                        error!(
                            "[{}] Failed to send WebSocket close frame: {}",
                            proxy_id_clone, e
                        );
                    }
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
                    let _ = ws_sink.send(axum_websocket::Message::Close(None)).await;
                    break;
                }
            }
        }

        total_bytes
    });

    let (ws_result, tcp_result) = tokio::join!(ws_to_tcp, tcp_to_ws);

    let ws_total = ws_result.unwrap_or(0);
    let tcp_total = tcp_result.unwrap_or(0);

    info!(
        "[{}] Proxy closed: WS→TCP {} bytes, TCP→WS {} bytes",
        proxy_id, ws_total, tcp_total
    );
}
