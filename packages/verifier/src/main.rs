mod axum_websocket;
mod config;
mod verifier;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
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
        .route("/session", post(create_session_handler))
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
    info!("Session endpoint: POST http://{}/session", addr);
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

// Type alias for the WebSocket type that will be sent through the channel
type SocketSender = oneshot::Sender<WebSocket>;

// Application state for sharing data between handlers
#[derive(Clone)]
struct AppState {
    sessions: Arc<Mutex<HashMap<String, SocketSender>>>,
}

// Request body for creating a session
#[derive(Debug, Deserialize)]
struct CreateSessionRequest {
    #[serde(rename = "maxRecvData")]
    max_recv_data: usize,
    #[serde(rename = "maxSentData")]
    max_sent_data: usize,
}

// Response body for session creation
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

// Create session endpoint handler
async fn create_session_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateSessionRequest>,
) -> Result<Json<CreateSessionResponse>, (StatusCode, String)> {
    // Generate a new session ID
    let session_id = Uuid::new_v4().to_string();

    let session_config = SessionConfig {
        max_recv_data: payload.max_recv_data,
        max_sent_data: payload.max_sent_data,
    };

    info!(
        "Created session {} with maxRecvData={}, maxSentData={}",
        session_id, payload.max_recv_data, payload.max_sent_data
    );

    // Create oneshot channel for passing WebSocket to verifier
    let (socket_tx, socket_rx) = oneshot::channel::<WebSocket>();

    // Store the socket sender
    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(session_id.clone(), socket_tx);
    }

    // Spawn the verifier task immediately
    let session_id_clone = session_id.clone();
    let state_clone = state.clone();
    tokio::spawn(async move {
        run_verifier_task(session_id_clone, session_config, socket_rx, state_clone).await;
    });

    info!("[{}] Verifier task spawned, waiting for WebSocket connection", session_id);

    Ok(Json(CreateSessionResponse { session_id }))
}

// WebSocket handler for verifier
async fn verifier_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Query(query): Query<VerifierQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let session_id = query.session_id;

    // Look up the session and extract the socket sender
    let socket_sender = {
        let mut sessions = state.sessions.lock().await;
        sessions.remove(&session_id)
    };

    match socket_sender {
        Some(sender) => {
            info!("[{}] WebSocket connection established, passing to verifier", session_id);
            Ok(ws.on_upgrade(move |socket| async move {
                // Send the WebSocket to the waiting verifier
                if let Err(_) = sender.send(socket) {
                    error!("[{}] Failed to send socket to verifier - channel closed", session_id);
                } else {
                    info!("[{}] Socket passed to verifier successfully", session_id);
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
        }
        Ok(Err(e)) => {
            error!("[{}] ❌ Verification failed: {}", session_id, e);
        }
        Err(_) => {
            error!(
                "[{}] ⏱️  Verification timed out after {:?}",
                session_id, verification_timeout
            );
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
