//! Integration test for the verifier server with webhook functionality.
//!
//! This test validates the complete end-to-end flow:
//! 1. Verifier server with webhook configuration
//! 2. Prover connecting via WebSocket
//! 3. MPC-TLS verification against swapi.dev
//! 4. Webhook delivery to test server

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use async_tungstenite::tungstenite::Message;
use axum::{extract::State, routing::post, Json, Router};
use futures_util::{io::AsyncRead, io::AsyncWrite, StreamExt};
use http_body_util::Empty;
use hyper::{body::Bytes, Request, StatusCode};
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::net::TcpStream;
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;
use tokio_util::compat::{FuturesAsyncReadCompatExt, TokioAsyncReadCompatExt};
use tower_http::cors::CorsLayer;
use tracing::info;
use ws_stream_tungstenite::WsStream;

use tlsn::{
    config::{
        prove::ProveConfig, prover::ProverConfig, tls::TlsClientConfig, tls_commit::TlsCommitConfig,
    },
    prover::Prover,
    Session,
};

// ============================================================================
// Test Configuration Constants
// ============================================================================

const VERIFIER_PORT: u16 = 17047;
const WEBHOOK_PORT: u16 = 18080;
const MAX_SENT_DATA: usize = 4096;
const MAX_RECV_DATA: usize = 16384;

// ============================================================================
// Types matching the verifier's WebSocket protocol
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
enum HandlerType {
    Sent,
    Recv,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
enum HandlerPart {
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
struct Handler {
    #[serde(rename = "type")]
    handler_type: HandlerType,
    part: HandlerPart,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RangeWithHandler {
    start: usize,
    end: usize,
    handler: Handler,
}

// ============================================================================
// Test Webhook Server
// ============================================================================

/// Simple HTTP server that captures POST requests for verification
struct TestWebhookServer {
    received_payloads: Arc<Mutex<Vec<Value>>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    handle: Option<JoinHandle<()>>,
}

impl TestWebhookServer {
    async fn start(port: u16) -> Self {
        let received_payloads = Arc::new(Mutex::new(Vec::new()));
        let payloads_clone = received_payloads.clone();

        let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

        let app = Router::new()
            .route("/", post(webhook_handler))
            .layer(CorsLayer::permissive())
            .with_state(payloads_clone);

        let addr = SocketAddr::from(([127, 0, 0, 1], port));

        let handle = tokio::spawn(async move {
            let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
            info!("[TestWebhookServer] Listening on {}", addr);

            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = shutdown_rx.await;
                    info!("[TestWebhookServer] Shutting down");
                })
                .await
                .unwrap();
        });

        // Wait for server to be ready
        tokio::time::sleep(Duration::from_millis(100)).await;

        Self {
            received_payloads,
            shutdown_tx: Some(shutdown_tx),
            handle: Some(handle),
        }
    }

    async fn get_payloads(&self) -> Vec<Value> {
        self.received_payloads.lock().await.clone()
    }

    async fn shutdown(mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(handle) = self.handle.take() {
            let _ = handle.await;
        }
    }
}

async fn webhook_handler(
    State(payloads): State<Arc<Mutex<Vec<Value>>>>,
    Json(body): Json<Value>,
) -> StatusCode {
    info!("[TestWebhookServer] Received webhook: {:?}", body);
    payloads.lock().await.push(body);
    StatusCode::OK
}

// ============================================================================
// Verifier Server Launcher
// ============================================================================

async fn start_verifier_server(webhook_port: u16, verifier_port: u16) -> JoinHandle<()> {
    // Create config with webhook for raw.githubusercontent.com
    let config_yaml = format!(
        r#"
webhooks:
  "raw.githubusercontent.com":
    url: "http://127.0.0.1:{}"
    headers: {{}}
"#,
        webhook_port
    );

    let config: crate::Config = serde_yaml::from_str(&config_yaml).unwrap();

    let app_state = Arc::new(crate::AppState {
        sessions: Arc::new(Mutex::new(HashMap::new())),
        config: Arc::new(config),
    });

    let app = Router::new()
        .route("/health", axum::routing::get(|| async { "ok" }))
        .route("/info", axum::routing::get(crate::info_handler))
        .route("/session", axum::routing::get(crate::session_ws_handler))
        .route("/verifier", axum::routing::get(crate::verifier_ws_handler))
        .route("/proxy", axum::routing::get(crate::proxy_ws_handler))
        .layer(CorsLayer::permissive())
        .with_state(app_state);

    let addr = SocketAddr::from(([127, 0, 0, 1], verifier_port));

    tokio::spawn(async move {
        let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
        info!("[TestVerifier] Listening on {}", addr);
        axum::serve(listener, app).await.unwrap();
    })
}

// ============================================================================
// WebSocket Session Client
// ============================================================================

/// Client that implements the /session WebSocket protocol
struct SessionClient {
    ws: async_tungstenite::WebSocketStream<tokio_util::compat::Compat<TcpStream>>,
    session_id: Option<String>,
}

impl SessionClient {
    async fn connect(verifier_url: &str) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/session", verifier_url);
        info!("[SessionClient] Connecting to {}", url);

        // Parse the URL to get host and port
        let parsed = url.parse::<http::Uri>()?;
        let host = parsed.host().ok_or("Missing host in URL")?;
        let port = parsed.port_u16().unwrap_or(80);

        // Connect via TCP and wrap for futures_io compatibility
        let tcp_stream = TcpStream::connect((host, port)).await?;
        let stream = tcp_stream.compat();

        // Perform WebSocket handshake
        let (ws, _) = async_tungstenite::client_async(&url, stream).await?;
        info!("[SessionClient] Connected");

        Ok(Self {
            ws,
            session_id: None,
        })
    }

    async fn register(
        &mut self,
        max_recv_data: usize,
        max_sent_data: usize,
        session_data: HashMap<String, String>,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let msg = json!({
            "type": "register",
            "maxRecvData": max_recv_data,
            "maxSentData": max_sent_data,
            "sessionData": session_data
        });

        info!("[SessionClient] Sending register: {:?}", msg);
        self.ws.send(Message::Text(msg.to_string().into())).await?;

        // Wait for session_registered response
        while let Some(msg) = self.ws.next().await {
            match msg? {
                Message::Text(text) => {
                    let response: Value = serde_json::from_str(&text)?;
                    info!("[SessionClient] Received: {:?}", response);

                    if response["type"] == "session_registered" {
                        let session_id = response["sessionId"]
                            .as_str()
                            .ok_or("Missing sessionId")?
                            .to_string();
                        self.session_id = Some(session_id.clone());
                        return Ok(session_id);
                    } else if response["type"] == "error" {
                        return Err(format!(
                            "Server error: {}",
                            response["message"].as_str().unwrap_or("unknown")
                        )
                        .into());
                    }
                }
                Message::Close(_) => {
                    return Err("Connection closed unexpectedly".into());
                }
                _ => {}
            }
        }

        Err("Connection closed before registration".into())
    }

    async fn send_reveal_config(
        &mut self,
        sent: Vec<RangeWithHandler>,
        recv: Vec<RangeWithHandler>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let msg = json!({
            "type": "reveal_config",
            "sent": sent,
            "recv": recv
        });

        info!(
            "[SessionClient] Sending reveal_config: {} sent, {} recv",
            sent.len(),
            recv.len()
        );
        self.ws.send(Message::Text(msg.to_string().into())).await?;

        Ok(())
    }

    async fn wait_for_completion(
        &mut self,
    ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
        info!("[SessionClient] Waiting for session completion...");

        while let Some(msg) = self.ws.next().await {
            match msg? {
                Message::Text(text) => {
                    let response: Value = serde_json::from_str(&text)?;
                    info!("[SessionClient] Received: {:?}", response);

                    if response["type"] == "session_completed" {
                        let results = response["results"]
                            .as_array()
                            .ok_or("Missing results")?
                            .clone();
                        return Ok(results);
                    } else if response["type"] == "error" {
                        return Err(format!(
                            "Server error: {}",
                            response["message"].as_str().unwrap_or("unknown")
                        )
                        .into());
                    }
                }
                Message::Close(_) => {
                    return Err("Connection closed unexpectedly".into());
                }
                _ => {}
            }
        }

        Err("Connection closed before completion".into())
    }
}

// ============================================================================
// Prover Implementation
// ============================================================================

/// Helper to connect WebSocket with futures_io compatible stream
async fn connect_ws(
    url: &str,
) -> Result<
    async_tungstenite::WebSocketStream<tokio_util::compat::Compat<TcpStream>>,
    Box<dyn std::error::Error + Send + Sync>,
> {
    let parsed = url.parse::<http::Uri>()?;
    let host = parsed.host().ok_or("Missing host in URL")?;
    let port = parsed.port_u16().unwrap_or(80);

    let tcp_stream = TcpStream::connect((host, port)).await?;
    let stream = tcp_stream.compat();

    let (ws, _) = async_tungstenite::client_async(url, stream).await?;
    Ok(ws)
}

/// Helper to connect secure WebSocket (wss://) with futures_io compatible stream
async fn connect_wss(
    url: &str,
) -> Result<
    async_tungstenite::WebSocketStream<
        tokio_util::compat::Compat<tokio_native_tls::TlsStream<TcpStream>>,
    >,
    Box<dyn std::error::Error + Send + Sync>,
> {
    let parsed = url.parse::<http::Uri>()?;
    let host = parsed.host().ok_or("Missing host in URL")?.to_string();
    let port = parsed.port_u16().unwrap_or(443);

    let tcp_stream = TcpStream::connect((&*host, port)).await?;

    // Create TLS connector
    let connector = native_tls::TlsConnector::new()?;
    let connector = tokio_native_tls::TlsConnector::from(connector);
    let tls_stream = connector.connect(&host, tcp_stream).await?;

    let stream = tls_stream.compat();
    let (ws, _) = async_tungstenite::client_async(url, stream).await?;
    Ok(ws)
}

/// Helper function that performs MPC-TLS and HTTP request with a given proxy stream
async fn run_prover_with_stream<S>(
    prover: Prover,
    tls_commit_config: TlsCommitConfig,
    tls_client_config: TlsClientConfig,
    proxy_stream: S,
) -> Result<(Vec<u8>, Vec<u8>), Box<dyn std::error::Error + Send + Sync>>
where
    S: AsyncRead + AsyncWrite + Send + Unpin + 'static,
{
    // 5. Start the TLS commitment protocol
    let prover = prover
        .commit(tls_commit_config)
        .await
        .map_err(|e| format!("Commitment failed: {}", e))?;

    // 6. Pass proxy connection into the prover for TLS
    let (mpc_tls_connection, prover_fut) = prover
        .connect(tls_client_config, proxy_stream)
        .await
        .map_err(|e| format!("TLS connect failed: {}", e))?;

    info!("[Prover] MPC-TLS connection established");

    // Wrap for hyper compatibility
    let mpc_tls_connection = TokioIo::new(mpc_tls_connection.compat());

    // Spawn the prover task
    let prover_task = tokio::spawn(prover_fut);

    // 7. HTTP handshake
    let (mut request_sender, connection) =
        hyper::client::conn::http1::handshake(mpc_tls_connection)
            .await
            .map_err(|e| format!("HTTP handshake failed: {}", e))?;

    tokio::spawn(connection);

    // 8. Send HTTP GET request
    info!("[Prover] Sending GET /tlsnotary/tlsn/refs/heads/main/crates/server-fixture/server/src/data/1kb.json");
    let request = Request::builder()
        .uri("/tlsnotary/tlsn/refs/heads/main/crates/server-fixture/server/src/data/1kb.json")
        .header("Host", "raw.githubusercontent.com")
        .header("Accept", "application/json")
        .header("Connection", "close")
        .method("GET")
        .body(Empty::<Bytes>::new())
        .unwrap();

    let response = request_sender
        .send_request(request)
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    info!("[Prover] Response status: {}", response.status());
    assert_eq!(response.status(), StatusCode::OK);

    // 9. Wait for prover task to complete
    let mut prover = prover_task
        .await
        .map_err(|e| format!("Prover task panicked: {}", e))?
        .map_err(|e| format!("Prover task failed: {}", e))?;

    let sent = prover.transcript().sent().to_vec();
    let recv = prover.transcript().received().to_vec();

    info!(
        "[Prover] Transcript: sent={} bytes, recv={} bytes",
        sent.len(),
        recv.len()
    );

    // 10. Build proof configuration (reveal everything including server identity)
    let mut prove_config = ProveConfig::builder(prover.transcript());
    prove_config.server_identity();
    prove_config
        .reveal_sent(&(0..sent.len()))
        .map_err(|e| format!("reveal_sent failed: {}", e))?;
    prove_config
        .reveal_recv(&(0..recv.len()))
        .map_err(|e| format!("reveal_recv failed: {}", e))?;
    let prove_config = prove_config
        .build()
        .map_err(|e| format!("build proof failed: {}", e))?;

    // 11. Send proof to verifier
    info!("[Prover] Sending proof to verifier");
    prover
        .prove(&prove_config)
        .await
        .map_err(|e| format!("prove failed: {}", e))?;

    prover
        .close()
        .await
        .map_err(|e| format!("close failed: {}", e))?;

    info!("[Prover] Proof sent successfully");

    Ok((sent, recv))
}

/// Prover that connects to verifier and performs MPC-TLS with swapi.dev
async fn run_prover(
    verifier_ws_url: String,
    proxy_url: String,
    max_sent_data: usize,
    max_recv_data: usize,
) -> Result<(Vec<u8>, Vec<u8>), Box<dyn std::error::Error + Send + Sync>> {
    info!("[Prover] Connecting to verifier at {}", verifier_ws_url);

    // 1. Connect to verifier WebSocket (ws://)
    let verifier_ws = connect_ws(&verifier_ws_url).await?;
    info!("[Prover] Connected to verifier");

    // Convert WebSocket to stream compatible with tlsn
    // WsStream implements tokio::io::AsyncRead/AsyncWrite when inner implements futures_io traits
    let verifier_stream = WsStream::new(verifier_ws);

    // 2. Create session with verifier stream
    let session = Session::new(verifier_stream);
    let (driver, mut handle) = session.split();

    // Spawn the session driver in the background
    let driver_task = tokio::spawn(driver);

    // 3. Create TLS commit config for MPC protocol
    use tlsn::config::tls_commit::{mpc::MpcTlsConfig, TlsCommitProtocolConfig};
    let mpc_config = MpcTlsConfig::builder()
        .max_sent_data(max_sent_data)
        .max_recv_data(max_recv_data)
        .build()
        .map_err(|e| format!("Failed to build MPC TLS config: {}", e))?;

    let tls_commit_config = TlsCommitConfig::builder()
        .protocol(TlsCommitProtocolConfig::Mpc(mpc_config))
        .build()
        .map_err(|e| format!("Failed to build TLS commit config: {}", e))?;

    // 4. Create prover config
    let prover_config = ProverConfig::builder()
        .build()
        .map_err(|e| format!("Failed to build prover config: {}", e))?;

    info!("[Prover] Setting up MPC-TLS with verifier");

    // 5. Create prover via handle
    let prover = handle
        .new_prover(prover_config)
        .map_err(|e| format!("Failed to create prover: {}", e))?;

    // 6. Create TLS client config with server name and root certs
    use tlsn::{connection::ServerName, webpki::RootCertStore};
    let tls_client_config = TlsClientConfig::builder()
        .server_name(ServerName::Dns(
            "raw.githubusercontent.com".try_into().unwrap(),
        ))
        .root_store(RootCertStore::mozilla())
        .build()
        .map_err(|e| format!("Failed to build TLS client config: {}", e))?;

    info!("[Prover] Connecting to proxy at {}", proxy_url);

    // 7. Connect to proxy WebSocket (ws:// or wss://) and run prover
    let result = if proxy_url.starts_with("wss://") {
        let proxy_ws = connect_wss(&proxy_url).await?;
        info!("[Prover] Connected to proxy (wss)");
        let proxy_stream = WsStream::new(proxy_ws);
        run_prover_with_stream(prover, tls_commit_config, tls_client_config, proxy_stream).await
    } else {
        let proxy_ws = connect_ws(&proxy_url).await?;
        info!("[Prover] Connected to proxy (ws)");
        let proxy_stream = WsStream::new(proxy_ws);
        run_prover_with_stream(prover, tls_commit_config, tls_client_config, proxy_stream).await
    };

    // 8. Close the session handle
    handle.close();

    // 9. Wait for the driver to complete
    driver_task
        .await
        .map_err(|e| format!("Driver task failed: {}", e))?
        .map_err(|e| format!("Session driver error: {}", e))?;

    result
}

// ============================================================================
// Integration Tests
// ============================================================================

/// Test the /health endpoint
#[tokio::test]
async fn health() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    let verifier_handle = start_verifier_server(WEBHOOK_PORT + 1, VERIFIER_PORT + 1).await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("http://127.0.0.1:{}/health", VERIFIER_PORT + 1))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(resp.status(), StatusCode::OK);
    assert_eq!(resp.text().await.unwrap(), "ok");

    verifier_handle.abort();
}

/// Test the /info endpoint returns expected JSON structure
#[tokio::test]
async fn info() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    let verifier_handle = start_verifier_server(WEBHOOK_PORT + 2, VERIFIER_PORT + 2).await;
    tokio::time::sleep(Duration::from_millis(100)).await;

    let client = reqwest::Client::new();
    let resp = client
        .get(format!("http://127.0.0.1:{}/info", VERIFIER_PORT + 2))
        .send()
        .await
        .expect("Failed to send request");

    assert_eq!(resp.status(), StatusCode::OK);

    let info: Value = resp.json().await.expect("Failed to parse JSON");

    // Verify required fields exist
    info.get("version").expect("Missing version field");
    info.get("git_hash").expect("Missing git_hash field");
    info.get("tlsn_version")
        .expect("Missing tlsn_version field");

    verifier_handle.abort();
}

#[tokio::test]
async fn test_webhook_integration_with_github() {
    // Initialize tracing for debugging
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    info!("Starting integration test");

    // 1. Start test webhook server
    info!("Starting webhook server on port {}", WEBHOOK_PORT);
    let webhook_server = TestWebhookServer::start(WEBHOOK_PORT).await;

    // 2. Start verifier server
    info!("Starting verifier server on port {}", VERIFIER_PORT);
    let verifier_handle = start_verifier_server(WEBHOOK_PORT, VERIFIER_PORT).await;

    // Wait for servers to be ready
    tokio::time::sleep(Duration::from_secs(1)).await;

    // 3. Create session client and register
    let verifier_url = format!("ws://127.0.0.1:{}", VERIFIER_PORT);
    let mut session = SessionClient::connect(&verifier_url)
        .await
        .expect("Failed to connect to session endpoint");

    let session_data = HashMap::from([("test_key".to_string(), "test_value".to_string())]);

    let session_id = session
        .register(MAX_RECV_DATA, MAX_SENT_DATA, session_data)
        .await
        .expect("Failed to register session");

    info!("Session registered: {}", session_id);

    // 4. Run prover in background
    let verifier_ws_url = format!(
        "ws://127.0.0.1:{}/verifier?sessionId={}",
        VERIFIER_PORT, session_id
    );
    let proxy_url = format!(
        "ws://127.0.0.1:{}/proxy?token=raw.githubusercontent.com",
        VERIFIER_PORT
    );

    let prover_handle = tokio::spawn(async move {
        run_prover(verifier_ws_url, proxy_url, MAX_SENT_DATA, MAX_RECV_DATA).await
    });

    // 5. Wait for prover to complete first so we know the actual transcript sizes
    let prover_result = tokio::time::timeout(Duration::from_secs(120), prover_handle)
        .await
        .expect("Prover timed out")
        .expect("Prover task panicked");

    let (sent_transcript, recv_transcript) = prover_result.expect("Prover execution failed");

    info!(
        "Prover completed: sent={} bytes, recv={} bytes",
        sent_transcript.len(),
        recv_transcript.len()
    );

    // 6. Send reveal config with actual transcript sizes
    // The reveal_config ranges must match the authenticated transcript ranges
    let sent_ranges = vec![RangeWithHandler {
        start: 0,
        end: sent_transcript.len(),
        handler: Handler {
            handler_type: HandlerType::Sent,
            part: HandlerPart::All,
        },
    }];
    let recv_ranges = vec![RangeWithHandler {
        start: 0,
        end: recv_transcript.len(),
        handler: Handler {
            handler_type: HandlerType::Recv,
            part: HandlerPart::All,
        },
    }];

    session
        .send_reveal_config(sent_ranges, recv_ranges)
        .await
        .expect("Failed to send reveal config");

    // 7. Wait for session completion
    let results = tokio::time::timeout(Duration::from_secs(30), session.wait_for_completion())
        .await
        .expect("Session completion timed out")
        .expect("Session did not complete successfully");

    info!("Session completed with {} results", results.len());

    // 8. Verify results contain expected data
    assert!(!results.is_empty(), "Should have handler results");

    // Check that response contains expected JSON data
    let recv_str = String::from_utf8_lossy(&recv_transcript);
    assert!(
        recv_str.contains("software engineer") || recv_str.contains("Anytown"),
        "Response should contain expected JSON data: {}",
        &recv_str[..recv_str.len().min(500)]
    );

    // 9. Wait for webhook delivery
    tokio::time::sleep(Duration::from_secs(2)).await;

    // 10. Verify webhook was received
    let payloads = webhook_server.get_payloads().await;
    assert_eq!(
        payloads.len(),
        1,
        "Should have received exactly one webhook"
    );

    let payload = &payloads[0];

    // Verify webhook payload structure
    assert_eq!(
        payload["server_name"], "raw.githubusercontent.com",
        "server_name should be raw.githubusercontent.com"
    );
    assert!(payload["results"].is_array(), "results should be an array");
    assert!(
        payload["config"]["sent"].is_array(),
        "config.sent should be an array"
    );
    assert!(
        payload["config"]["recv"].is_array(),
        "config.recv should be an array"
    );
    assert!(
        payload["session"]["id"].is_string(),
        "session.id should be a string"
    );
    assert_eq!(
        payload["session"]["test_key"], "test_value",
        "session.test_key should match"
    );
    assert!(
        payload["transcript"]["sent"].is_string(),
        "transcript.sent should be a string"
    );
    assert!(
        payload["transcript"]["recv"].is_string(),
        "transcript.recv should be a string"
    );
    assert!(
        payload["transcript"]["sent_length"].is_number(),
        "transcript.sent_length should be a number"
    );
    assert!(
        payload["transcript"]["recv_length"].is_number(),
        "transcript.recv_length should be a number"
    );

    // Verify transcript contains expected content
    let webhook_recv = payload["transcript"]["recv"].as_str().unwrap();
    assert!(
        webhook_recv.contains("software engineer") || webhook_recv.contains("Anytown"),
        "Webhook transcript should contain expected JSON data"
    );

    info!("All assertions passed!");

    // 11. Cleanup
    webhook_server.shutdown().await;
    verifier_handle.abort();

    info!("Integration test completed successfully!");
}
