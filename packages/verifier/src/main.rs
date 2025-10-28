mod axum_websocket;
mod config;
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

    axum::serve(listener, app)
        .await
        .expect("Server error");
}

// Session data structure
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SessionConfig {
    #[serde(rename = "maxRecvData")]
    max_recv_data: usize,
    #[serde(rename = "maxSentData")]
    max_sent_data: usize,
}

// Verification result containing transcripts
#[derive(Debug, Clone, Serialize)]
struct VerificationResult {
    #[serde(rename = "sentData")]
    sent_data: String,
    #[serde(rename = "receivedData")]
    received_data: String,
}

// Type alias for the prover WebSocket sender
type ProverSocketSender = oneshot::Sender<WebSocket>;

// Application state for sharing data between handlers
#[derive(Clone)]
struct AppState {
    sessions: Arc<Mutex<HashMap<String, ProverSocketSender>>>,
}

// Response body for session creation (sent via WebSocket)
#[derive(Debug, Serialize)]
struct CreateSessionResponse {
    #[serde(rename = "sessionId")]
    session_id: String,
}

// Query parameters for WebSocket connection
#[derive(Debug, Deserialize)]
struct VerifierQuery {
    #[serde(rename = "sessionId")]
    session_id: String,
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

    // Store only the prover socket sender
    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(session_id.clone(), prover_socket_tx);
    }

    // Spawn the verifier task with the result sender
    let session_id_clone = session_id.clone();
    let state_clone = state.clone();
    tokio::spawn(async move {
        run_verifier_task(session_id_clone, config, prover_socket_rx, result_tx, state_clone).await;
    });

    info!("[{}] Verifier task spawned, waiting for prover connection", session_id);

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
        sessions.remove(&session_id)
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

// Verifier task that waits for WebSocket and runs verification
async fn run_verifier_task(
    session_id: String,
    config: SessionConfig,
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

            // Send result to extension via the result channel
            let result = VerificationResult {
                sent_data,
                received_data,
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
