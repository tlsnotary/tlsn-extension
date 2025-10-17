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
use tokio::sync::Mutex;
use tokio::time::timeout;
use tokio_util::compat::FuturesAsyncReadCompatExt;
use tower_http::cors::CorsLayer;
use tracing::{error, info, warn};
use tracing_subscriber;
use uuid::Uuid;
use ws_stream_tungstenite::WsStream;
use verifier::verifier;

#[tokio::main]
async fn main() {
    // Initialize tracing with DEBUG level
    tracing_subscriber::fmt()
        .with_target(true)
        .with_max_level(tracing::Level::DEBUG)
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

// Application state for sharing data between handlers
#[derive(Clone)]
struct AppState {
    sessions: Arc<Mutex<HashMap<String, SessionConfig>>>,
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

    // Store the session
    {
        let mut sessions = state.sessions.lock().await;
        sessions.insert(session_id.clone(), session_config.clone());
    }

    info!(
        "Created session {} with maxRecvData={}, maxSentData={}",
        session_id, payload.max_recv_data, payload.max_sent_data
    );

    Ok(Json(CreateSessionResponse { session_id }))
}

// WebSocket handler for verifier
async fn verifier_ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
    Query(query): Query<VerifierQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let session_id = query.session_id;

    // Look up the session
    let session_config = {
        let sessions = state.sessions.lock().await;
        sessions.get(&session_id).cloned()
    };

    match session_config {
        Some(config) => {
            info!("WebSocket connection for session: {}", session_id);
            Ok(ws.on_upgrade(move |socket| {
                handle_verifier_connection(socket, state, session_id, config)
            }))
        }
        None => {
            error!("Session not found: {}", session_id);
            Err((
                StatusCode::NOT_FOUND,
                format!("Session not found: {}", session_id),
            ))
        }
    }
}

// Handle WebSocket connections for verifier
async fn handle_verifier_connection(
    socket: WebSocket,
    state: Arc<AppState>,
    session_id: String,
    config: SessionConfig,
) {
    info!(
        "[{}] Verifier WebSocket connection established",
        session_id
    );
    info!(
        "[{}] Configuration: maxRecvData={}, maxSentData={}",
        session_id, config.max_recv_data, config.max_sent_data
    );

    // Convert WebSocket to WsStream for AsyncRead/AsyncWrite compatibility
    let stream = WsStream::new(socket.into_inner());

    info!("stream 1: {:?}", stream);

    // Convert from futures AsyncRead/AsyncWrite to tokio AsyncRead/AsyncWrite
    let stream = stream.compat();

    info!("stream 2: {:?}", stream);

    // Spawn the verifier task with timeout
    let session_timeout = Duration::from_secs(120);

    info!("[{}] Starting verifier with timeout of {:?}", session_id, session_timeout);

    // Run the actual verification
    let verification_result = timeout(
        session_timeout,
        verifier(stream, config.max_sent_data, config.max_recv_data)
    ).await;

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
            error!("[{}] ⏱️  Verification timed out after {:?}", session_id, session_timeout);
        }
    }

    // Clean up: remove session from storage
    {
        let mut sessions = state.sessions.lock().await;
        if sessions.remove(&session_id).is_some() {
            info!("[{}] Session cleaned up and removed", session_id);
        } else {
            warn!("[{}] Session was already removed", session_id);
        }
    }

    info!("[{}] WebSocket connection closed, verifier cleaned up", session_id);
}
