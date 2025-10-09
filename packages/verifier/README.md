# TLSNotary Verifier Server

A Rust-based HTTP server with WebSocket support for TLSNotary verification operations.

## Features

- **Health Check Endpoint**: Simple `/health` endpoint that returns "ok" for monitoring
- **WebSocket Support**: Full WebSocket server at `/ws` for real-time communication
- **CORS Enabled**: Permissive CORS configuration for cross-origin requests
- **Async Runtime**: Built on Tokio for high-performance async operations
- **Logging**: Structured logging with tracing for debugging and monitoring

## Dependencies

- **tlsn**: v0.1.0-alpha.13 from GitHub
- **axum**: Modern web framework with WebSocket support
- **tokio**: Async runtime
- **tower-http**: CORS middleware
- **tracing**: Logging and diagnostics

## Building

```bash
# From the verifier package directory
cargo build

# For production release
cargo build --release
```

## Running

```bash
# Development mode
cargo run

# Production release
cargo run --release
```

The server will start on `0.0.0.0:7047` by default.

## API Endpoints

### Health Check

**GET** `/health`

Returns a simple "ok" response to verify the server is running.

**Example:**
```bash
curl http://localhost:7047/health
# Response: ok
```

### WebSocket Connection

**WS** `/ws`

Establishes a WebSocket connection for real-time bidirectional communication.

**Example using websocat:**
```bash
# Install websocat: cargo install websocat
websocat ws://localhost:7047/ws
```

**Example using JavaScript:**
```javascript
const ws = new WebSocket('ws://localhost:7047/ws');

ws.onopen = () => {
  console.log('Connected');
  ws.send('Hello Server!');
};

ws.onmessage = (event) => {
  console.log('Received:', event.data);
};

ws.onclose = () => {
  console.log('Disconnected');
};
```

## WebSocket Protocol

The server currently implements a simple echo protocol:

- **Text Messages**: Echoed back with "Echo: " prefix
- **Binary Messages**: Echoed back as-is
- **Ping/Pong**: Automatically handled for connection keepalive
- **Welcome Message**: Sent immediately upon connection

Future versions will implement the TLSNotary verification protocol.

## Configuration

The server configuration is currently hardcoded in `main.rs`:

- **Host**: `0.0.0.0` (all interfaces)
- **Port**: `7047`

To change these, modify the `SocketAddr::from()` call in `main.rs`.

## Development

### Adding New Routes

Add routes to the Router in `main.rs`:

```rust
let app = Router::new()
    .route("/health", get(health_handler))
    .route("/ws", get(ws_handler))
    .route("/your-route", get(your_handler))  // Add here
    .layer(CorsLayer::permissive())
    .with_state(app_state);
```

### Extending Application State

Modify the `AppState` struct to share data between handlers:

```rust
struct AppState {
    // Add your shared state here
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}
```

## Integration with Extension

This server is designed to work with the TLSNotary browser extension located in `packages/extension`. The extension will connect to the WebSocket endpoint for verification operations.

## License

See the root LICENSE file for license information.
