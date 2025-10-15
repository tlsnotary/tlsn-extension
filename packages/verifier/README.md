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

### Create Session

**POST** `/session`

Creates a new verification session with specified data limits. Returns a session ID that can be used to connect to the verifier WebSocket.

**Request Body:**
```json
{
  "maxRecvData": 16384,
  "maxSentData": 4096
}
```

**Response:**
```json
{
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Example:**
```bash
curl -X POST http://localhost:7047/session \
  -H "Content-Type: application/json" \
  -d '{"maxRecvData": 16384, "maxSentData": 4096}'
```

### Verifier WebSocket

**WS** `/verifier?sessionId=<session-id>`

Establishes a WebSocket connection for TLSNotary verification using a previously created session. Upon connection:

1. Validates the session ID exists
2. Retrieves maxRecvData and maxSentData from the session
3. Spawns a verifier with the configured limits
4. Performs TLS proof verification
5. Cleans up and removes the session when connection closes

**Query Parameters:**
- `sessionId` (required): Session ID returned from POST /session

**Error Responses:**
- `404 Not Found`: Session ID does not exist or has already been used

**Example using websocat:**
```bash
# First, create a session
SESSION_ID=$(curl -s -X POST http://localhost:7047/session \
  -H "Content-Type: application/json" \
  -d '{"maxRecvData": 16384, "maxSentData": 4096}' | jq -r '.sessionId')

# Then connect with the session ID
websocat "ws://localhost:7047/verifier?sessionId=$SESSION_ID"
```

**Example using JavaScript:**
```javascript
// Create a session first
const response = await fetch('http://localhost:7047/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ maxRecvData: 16384, maxSentData: 4096 })
});
const { sessionId } = await response.json();

// Connect to verifier with session ID
const ws = new WebSocket(`ws://localhost:7047/verifier?sessionId=${sessionId}`);

ws.onopen = () => {
  console.log('Connected to verifier');
};

ws.onmessage = (event) => {
  console.log('Verification result:', event.data);
};

ws.onclose = () => {
  console.log('Verifier disconnected, session cleaned up');
};

ws.onerror = (error) => {
  console.error('Verification error:', error);
};
```

## Verifier Architecture

The verifier implementation follows this flow:

1. **Session Creation**: Client sends POST request to `/session` with maxRecvData and maxSentData
2. **Session Storage**: Server generates UUID, stores session config in HashMap
3. **WebSocket Connection**: Client connects to `/verifier?sessionId=<id>`
4. **Session Lookup**: Server validates session exists and retrieves configuration
5. **Task Spawning**: Server spawns async task with session-specific limits
6. **Verification Process**:
   - Uses maxRecvData and maxSentData from session config
   - Configures protocol validator with session limits
   - Creates verifier with TLSNotary config
   - Performs MPC-TLS verification
   - Validates server name and transcript data
7. **Error Handling**: Any errors are caught, logged, and cleaned up automatically
8. **Cleanup**: Session is removed from storage when WebSocket closes

### Session Management

- **Thread-safe storage**: Uses `Arc<Mutex<HashMap>>` for concurrent access
- **One-time use**: Sessions are automatically removed after WebSocket closes
- **Session isolation**: Each verifier gets independent maxRecvData/maxSentData limits
- **Error handling**: Invalid session IDs return 404 before WebSocket upgrade

**Note**: The current implementation logs all incoming WebSocket messages. Full verifier integration requires converting the axum WebSocket to AsyncRead/AsyncWrite format using the WsStream bridge.

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
