# TLSNotary Verifier Server

A Rust-based HTTP server with WebSocket support for TLSNotary verification operations.

## Features

- **Health Check Endpoint**: Simple `/health` endpoint that returns "ok" for monitoring
- **Verifier WebSocket**: WebSocket server at `/verifier` for TLSNotary verification
- **CORS Enabled**: Permissive CORS configuration for cross-origin requests
- **Async Runtime**: Built on Tokio for high-performance async operations
- **Logging**: Structured logging with tracing for debugging and monitoring
- **Error Handling**: Proper error handling and automatic cleanup on failure

## Dependencies

- **tlsn**: v0.1.0-alpha.13 from GitHub - TLSNotary verification library
- **axum**: Modern web framework with WebSocket support
- **tokio**: Async runtime with full features
- **tokio-util**: Async utilities for stream compatibility
- **tower-http**: CORS middleware
- **tracing**: Structured logging and diagnostics
- **eyre**: Error handling and reporting

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

### Verifier WebSocket

**WS** `/verifier`

Establishes a WebSocket connection for TLSNotary verification. Upon connection, the server spawns a verifier task that:

1. Accepts the WebSocket connection
2. Spawns a verifier with proper error handling
3. Performs TLS proof verification using the tlsn library
4. Logs results and automatically cleans up resources

**Example using websocat:**
```bash
# Install websocat: cargo install websocat
websocat ws://localhost:7047/verifier
```

**Example using JavaScript:**
```javascript
const ws = new WebSocket('ws://localhost:7047/verifier');

ws.onopen = () => {
  console.log('Connected to verifier');
  // Send verification data
};

ws.onmessage = (event) => {
  console.log('Verification result:', event.data);
};

ws.onclose = () => {
  console.log('Verifier disconnected');
};

ws.onerror = (error) => {
  console.error('Verification error:', error);
};
```

## Verifier Architecture

The verifier implementation follows this flow:

1. **WebSocket Connection**: Client connects to `/verifier` endpoint
2. **Task Spawning**: Server spawns an async task for verification
3. **Verification Process**:
   - Configures protocol validator with data limits (2KB sent, 4KB received)
   - Creates verifier with TLSNotary config
   - Performs MPC-TLS verification
   - Validates server name and transcript data
4. **Error Handling**: Any errors are caught, logged, and cleaned up automatically
5. **Cleanup**: Task automatically cleans up resources when complete or on error

**Note**: The current implementation includes a WebSocket-to-AsyncRead/AsyncWrite bridge placeholder. Full integration requires converting the axum WebSocket to a format compatible with the tlsn verifier's AsyncRead + AsyncWrite trait bounds.

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
    .route("/verifier", get(verifier_ws_handler))
    .route("/your-route", get(your_handler))  // Add here
    .layer(CorsLayer::permissive())
    .with_state(app_state);
```

### Project Structure

```
src/
├── main.rs       # Server setup, routing, and WebSocket handling
├── config.rs     # Configuration constants (MAX_SENT_DATA, MAX_RECV_DATA)
└── verifier.rs   # TLSNotary verification logic
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
