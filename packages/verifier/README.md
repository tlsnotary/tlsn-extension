# TLSNotary Verifier Server

Rust server that terminates the verifier side of TLSNotary's MPC-TLS protocol
and optionally forwards verified results to a configured webhook.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Liveness check — returns `"ok"`. |
| `GET /info` | Version info JSON (`version`, `git_hash`, `tlsn_version`). |
| `WS /session` | Full verification session — see protocol below. |
| `WS /proxy?token=<host>` | WebSocket ↔ TCP bridge used by the prover to reach a target server (notary.pse.dev compatible; legacy alias `?host=<host>`). |

The verifier is one WebSocket per session. Control frames (JSON) and MPC bytes
(raw binary) multiplex on the same socket, distinguished by the WebSocket
frame type.

## `/session` protocol

Text frames carry JSON control messages; Binary frames carry MPC bytes.

1. **Client → server** (Text)
   ```json
   { "type": "register", "sessionData": { /* arbitrary key/value strings */ } }
   ```
   `sessionData` is opaque to the verifier and is included verbatim in the
   webhook payload (under `session.*`).

2. **Server → client** (Text)
   ```json
   { "type": "registered" }
   ```

3. **MPC handshake** — both sides exchange Binary frames. The server runs
   tlsn's verifier against the byte stream; the client runs tlsn's prover.
   The prover also connects to the target TLS server via a separate
   `/proxy?token=<host>` WebSocket.

   The prover announces its requested `max_sent_data` / `max_recv_data` inside
   the MPC protocol. The server rejects the session if either exceeds the
   server-configured limits (see Configuration below).

4. **Client → server** (Text, after MPC completes)
   ```json
   {
     "type": "reveal_config",
     "sent": [ { "start": 0, "end": N, "handler": { "type": "SENT", "part": "ALL" } } ],
     "recv": [ { "start": 0, "end": M, "handler": { "type": "RECV", "part": "ALL" } } ]
   }
   ```
   Each range must be fully contained in the authenticated transcript.

5. **Server → client** (Text)
   ```json
   { "type": "session_completed", "results": [ { "type": "SENT", "part": "ALL", "value": "..." } ] }
   ```
   or, on failure:
   ```json
   { "type": "error", "message": "..." }
   ```

6. Server closes the socket. If a webhook is configured for the verified
   `server_name`, the server fires a POST to that URL (fire-and-forget)
   containing the handler results, the reveal config, the session info, and
   a redacted transcript.

## Configuration

`config.yaml` (loaded from the working directory, optional):

```yaml
# Absolute maximums accepted from the prover. The session is rejected if the
# prover's MPC-announced max exceeds these. Defaults: 1 MiB sent, 16 MiB recv.
max_sent_data: 1048576
max_recv_data: 16777216

webhooks:
  # Keyed by TLS server name (SNI). "*" is a wildcard fallback.
  "api.x.com":
    url: "https://your-backend.example.com/webhook/twitter"
    headers:
      Authorization: "Bearer ..."
  "*":
    url: "https://your-backend.example.com/webhook/default"
```

Environment overrides: `VERIFIER_MAX_SENT_DATA`, `VERIFIER_MAX_RECV_DATA`, `PORT`
(default `7047`).

## Running

```bash
cargo run                # dev
cargo build --release    # release build
cargo test               # integration + proxy tests
```

## Source layout

```
src/
├── main.rs            # routes, session handler, webhook dispatch
├── ws_mux.rs          # splits a WebSocket into text channel + binary byte stream
├── axum_websocket.rs  # minimal axum WS upgrade extractor (forked to swap tungstenite backends)
├── verifier.rs        # tlsn MPC verifier wrapper
└── tests/             # integration tests against raw.githubusercontent.com
```

## Integration

Clients that speak this protocol:

- The browser extension ([packages/extension](../extension)) — via the
  `ProveManager` offscreen worker.
- The mobile SDK ([packages/tlsn-mobile](../tlsn-mobile)) — native Rust.

See [CLAUDE.md](../../CLAUDE.md) for the broader architecture.

## License

See the root LICENSE file.
