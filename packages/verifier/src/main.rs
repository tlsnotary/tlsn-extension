use axum::{
    extract::{
        ws::{WebSocket, WebSocketUpgrade},
        State,
    },
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use tracing::{info, warn};
use tracing_subscriber;

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_target(false)
        .compact()
        .init();

    // Create application state (can be expanded later for session management)
    let app_state = Arc::new(AppState {});

    // Build router with routes
    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/ws", get(ws_handler))
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
    info!("WebSocket endpoint: ws://{}/ws", addr);

    axum::serve(listener, app)
        .await
        .expect("Server error");
}

// Application state for sharing data between handlers
struct AppState {}

// Health check endpoint handler
async fn health_handler() -> impl IntoResponse {
    "ok"
}

// WebSocket handler
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(_state): State<Arc<AppState>>,
) -> Response {
    ws.on_upgrade(|socket| handle_socket(socket))
}

// Handle WebSocket connections
async fn handle_socket(mut socket: WebSocket) {
    info!("New WebSocket connection established");

    // Send welcome message
    if socket
        .send(axum::extract::ws::Message::Text(
            "Connected to TLSNotary Verifier Server".into(),
        ))
        .await
        .is_err()
    {
        warn!("Failed to send welcome message");
        return;
    }

    // Handle incoming messages
    while let Some(msg) = socket.recv().await {
        match msg {
            Ok(msg) => {
                if process_message(msg, &mut socket).await.is_err() {
                    break;
                }
            }
            Err(e) => {
                warn!("WebSocket error: {}", e);
                break;
            }
        }
    }

    info!("WebSocket connection closed");
}

// Process WebSocket messages
async fn process_message(
    msg: axum::extract::ws::Message,
    socket: &mut WebSocket,
) -> Result<(), axum::Error> {
    use axum::extract::ws::Message;

    match msg {
        Message::Text(text) => {
            info!("Received text message: {}", text);

            // Echo the message back
            socket
                .send(Message::Text(format!("Echo: {}", text)))
                .await?;
        }
        Message::Binary(data) => {
            info!("Received binary message: {} bytes", data.len());

            // Echo binary data back
            socket.send(Message::Binary(data)).await?;
        }
        Message::Ping(data) => {
            socket.send(Message::Pong(data)).await?;
        }
        Message::Pong(_) => {
            // Pong received
        }
        Message::Close(_) => {
            info!("Received close message");
            return Err(axum::Error::new("Connection closed"));
        }
    }

    Ok(())
}
