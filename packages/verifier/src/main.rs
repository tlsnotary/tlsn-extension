mod axum_websocket;
mod config;
mod verifier;

use axum::{response::IntoResponse, routing::get, Router};
use axum_websocket::{Message, WebSocket, WebSocketUpgrade};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing::{error, info};
use tracing_subscriber;

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_target(false)
        .compact()
        .init();

    // Create application state
    let app_state = Arc::new(AppState {});

    // Build router with routes
    let app = Router::new()
        .route("/health", get(health_handler))
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
    info!("Verifier WebSocket endpoint: ws://{}/verifier", addr);

    axum::serve(listener, app)
        .await
        .expect("Server error");
}

// Application state for sharing data between handlers
#[derive(Clone)]
struct AppState {}

// Health check endpoint handler
async fn health_handler() -> impl IntoResponse {
    "ok"
}

// WebSocket handler for verifier
async fn verifier_ws_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_verifier_connection(socket))
}

// Handle WebSocket connections for verifier
async fn handle_verifier_connection(mut socket: WebSocket) {
    info!("New verifier WebSocket connection established");

    // Log all incoming messages
    while let Some(msg_result) = socket.recv().await {
        match msg_result {
            Ok(Message::Text(text)) => {
                info!("Received text message: {}", text);
            }
            Ok(Message::Binary(data)) => {
                info!("Received binary message: {} bytes", data.len());
            }
            Ok(Message::Ping(data)) => {
                info!("Received ping: {} bytes", data.len());
            }
            Ok(Message::Pong(data)) => {
                info!("Received pong: {} bytes", data.len());
            }
            Ok(Message::Close(close_frame)) => {
                info!("Received close message: {:?}", close_frame);
                break;
            }
            Err(e) => {
                error!("Error receiving message: {}", e);
                break;
            }
        }
    }

    info!("WebSocket connection closed");
}
