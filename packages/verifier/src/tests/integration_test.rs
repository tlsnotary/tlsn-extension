//! Integration test for the verifier server with webhook functionality.
//!
//! This test validates the complete end-to-end flow:
//! 1. Verifier server with webhook configuration
//! 2. Prover connecting via a single WebSocket for both control and MPC
//! 3. MPC-TLS verification against raw.githubusercontent.com
//! 4. Webhook delivery to test server

use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use async_tungstenite::tungstenite::Message;
use axum::{extract::State, routing::post, Json, Router};
use futures_util::{
    io::{AsyncRead, AsyncWrite},
    sink::SinkExt,
    StreamExt,
};
use http_body_util::Empty;
use hyper::{body::Bytes, Request, StatusCode};
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::net::TcpStream;
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;
use tokio_util::compat::{Compat, FuturesAsyncReadCompatExt, TokioAsyncReadCompatExt};
use tower_http::cors::CorsLayer;
use tracing::info;

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
    let config_yaml = format!(
        r#"
max_sent_data: {}
max_recv_data: {}
webhooks:
  "raw.githubusercontent.com":
    url: "http://127.0.0.1:{}"
    headers: {{}}
"#,
        MAX_SENT_DATA, MAX_RECV_DATA, webhook_port
    );

    let config: crate::Config = serde_yaml::from_str(&config_yaml).unwrap();

    let app_state = Arc::new(crate::AppState {
        config: Arc::new(config),
    });

    let app = Router::new()
        .route("/health", axum::routing::get(|| async { "ok" }))
        .route("/info", axum::routing::get(crate::info_handler))
        .route("/session", axum::routing::get(crate::session_ws_handler))
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
// Client-side session mux
//
// Mirrors the server's ws_mux: splits a single WebSocket into a text control
// channel (Text frames) and a binary byte stream (Binary frames) so that MPC
// bytes and JSON control messages share one socket.
// ============================================================================

type ClientWs = async_tungstenite::WebSocketStream<Compat<TcpStream>>;

struct ClientSessionStream {
    text_rx: tokio::sync::mpsc::UnboundedReceiver<String>,
    send_text_tx: tokio::sync::mpsc::UnboundedSender<String>,
    binary: tokio::io::DuplexStream,
}

fn client_session_stream(ws: ClientWs) -> ClientSessionStream {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let (text_in_tx, text_in_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let (send_text_tx, mut send_text_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let (tlsn_side, mux_side) = tokio::io::duplex(64 * 1024);
    let (mut mux_read, mut mux_write) = tokio::io::split(mux_side);

    let (mut ws_sink, mut ws_stream) = ws.split();

    // WS -> {text channel, binary duplex}
    tokio::spawn(async move {
        while let Some(msg) = ws_stream.next().await {
            match msg {
                Ok(Message::Text(t)) => {
                    if text_in_tx.send(t.to_string()).is_err() {
                        break;
                    }
                }
                Ok(Message::Binary(b)) => {
                    if mux_write.write_all(&b).await.is_err() {
                        break;
                    }
                }
                Ok(Message::Close(_)) => break,
                Ok(_) => {}
                Err(_) => break,
            }
        }
    });

    // {binary duplex, text channel} -> WS. Binary and text are tracked
    // independently so dropping the MPC binary stream doesn't close the text
    // channel.
    tokio::spawn(async move {
        let mut buf = vec![0u8; 8192];
        let mut binary_open = true;
        let mut text_open = true;
        while binary_open || text_open {
            tokio::select! {
                biased;
                msg = send_text_rx.recv(), if text_open => match msg {
                    Some(t) => {
                        if ws_sink.send(Message::Text(t)).await.is_err() { break; }
                    }
                    None => text_open = false,
                },
                res = mux_read.read(&mut buf), if binary_open => match res {
                    Ok(0) => binary_open = false,
                    Ok(n) => {
                        if ws_sink.send(Message::Binary(buf[..n].to_vec())).await.is_err() { break; }
                    }
                    Err(_) => binary_open = false,
                },
            }
        }
        let _ = ws_sink.close().await;
    });

    ClientSessionStream {
        text_rx: text_in_rx,
        send_text_tx,
        binary: tlsn_side,
    }
}

// ============================================================================
// WebSocket Session Client (single-socket protocol)
// ============================================================================

struct SessionClient {
    ws: Option<ClientWs>,
    stream: Option<ClientSessionStream>,
}

impl SessionClient {
    async fn connect(verifier_url: &str) -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let url = format!("{}/session", verifier_url);
        info!("[SessionClient] Connecting to {}", url);

        let parsed = url.parse::<http::Uri>()?;
        let host = parsed.host().ok_or("Missing host in URL")?;
        let port = parsed.port_u16().unwrap_or(80);

        let tcp_stream = TcpStream::connect((host, port)).await?;
        let stream = tcp_stream.compat();

        let (ws, _) = async_tungstenite::client_async(&url, stream).await?;
        info!("[SessionClient] Connected");

        Ok(Self {
            ws: Some(ws),
            stream: None,
        })
    }

    /// Send `register` and wait for `registered`. After this returns, the
    /// client can begin MPC on the binary byte stream.
    async fn register(
        &mut self,
        session_data: HashMap<String, String>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mut ws = self.ws.take().ok_or("Already registered")?;

        let msg = json!({
            "type": "register",
            "sessionData": session_data
        });

        info!("[SessionClient] Sending register: {:?}", msg);
        ws.send(Message::Text(msg.to_string())).await?;

        // Wait for `registered` response (must be the first text frame).
        loop {
            match ws.next().await {
                Some(Ok(Message::Text(text))) => {
                    let response: Value = serde_json::from_str(&text)?;
                    info!("[SessionClient] Received: {:?}", response);

                    if response["type"] == "registered" {
                        break;
                    } else if response["type"] == "error" {
                        return Err(format!(
                            "Server error: {}",
                            response["message"].as_str().unwrap_or("unknown")
                        )
                        .into());
                    } else {
                        return Err(format!("Unexpected message: {:?}", response).into());
                    }
                }
                Some(Ok(Message::Close(_))) => {
                    return Err("Connection closed unexpectedly".into());
                }
                Some(Ok(_)) => {}
                Some(Err(e)) => return Err(e.into()),
                None => return Err("Connection closed before registration".into()),
            }
        }

        // Now split the WS into text + binary channels for the rest of the
        // session.
        self.stream = Some(client_session_stream(ws));
        Ok(())
    }

    /// Take the binary stream for MPC. Can only be called once.
    fn take_binary_stream(&mut self) -> Compat<tokio::io::DuplexStream> {
        let stream = self
            .stream
            .as_mut()
            .expect("register() must be called first");
        // Swap out the binary half; callers use this only once per session.
        let binary = std::mem::replace(&mut stream.binary, tokio::io::duplex(1).0);
        binary.compat()
    }

    async fn send_reveal_config(
        &self,
        sent: Vec<RangeWithHandler>,
        recv: Vec<RangeWithHandler>,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let stream = self.stream.as_ref().ok_or("Not registered")?;
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
        stream
            .send_text_tx
            .send(msg.to_string())
            .map_err(|_| "Failed to send reveal_config: mux closed")?;
        Ok(())
    }

    async fn wait_for_completion(
        &mut self,
    ) -> Result<Vec<Value>, Box<dyn std::error::Error + Send + Sync>> {
        info!("[SessionClient] Waiting for session completion...");
        let stream = self.stream.as_mut().ok_or("Not registered")?;
        loop {
            match stream.text_rx.recv().await {
                Some(text) => {
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
                None => return Err("Connection closed before completion".into()),
            }
        }
    }
}

// ============================================================================
// Prover Implementation
// ============================================================================

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

    let connector = native_tls::TlsConnector::new()?;
    let connector = tokio_native_tls::TlsConnector::from(connector);
    let tls_stream = connector.connect(&host, tcp_stream).await?;

    let stream = tls_stream.compat();
    let (ws, _) = async_tungstenite::client_async(url, stream).await?;
    Ok(ws)
}

async fn run_prover_with_stream<S>(
    prover: Prover,
    tls_commit_config: TlsCommitConfig,
    tls_client_config: TlsClientConfig,
    proxy_stream: S,
) -> Result<(Vec<u8>, Vec<u8>), Box<dyn std::error::Error + Send + Sync>>
where
    S: AsyncRead + AsyncWrite + Send + Unpin + 'static,
{
    let prover = prover
        .commit(tls_commit_config)
        .await
        .map_err(|e| format!("Commitment failed: {}", e))?;

    let (mpc_tls_connection, prover_fut) = prover
        .connect(tls_client_config, proxy_stream)
        .map_err(|e| format!("TLS connect failed: {}", e))?;

    info!("[Prover] MPC-TLS connection established");

    let mpc_tls_connection = TokioIo::new(mpc_tls_connection.compat());

    let prover_task = tokio::spawn(prover_fut);

    let (mut request_sender, connection) =
        hyper::client::conn::http1::handshake(mpc_tls_connection)
            .await
            .map_err(|e| format!("HTTP handshake failed: {}", e))?;

    tokio::spawn(connection);

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

/// Run the prover over an already-established session (binary byte stream).
async fn run_prover<V>(
    verifier_stream: V,
    proxy_url: String,
    max_sent_data: usize,
    max_recv_data: usize,
) -> Result<(Vec<u8>, Vec<u8>), Box<dyn std::error::Error + Send + Sync>>
where
    V: AsyncRead + AsyncWrite + Send + Unpin + 'static,
{
    let session = Session::new(verifier_stream);
    let (driver, mut handle) = session.split();

    let driver_task = tokio::spawn(driver);

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

    let prover_config = ProverConfig::builder()
        .build()
        .map_err(|e| format!("Failed to build prover config: {}", e))?;

    info!("[Prover] Setting up MPC-TLS with verifier");

    let prover = handle
        .new_prover(prover_config)
        .map_err(|e| format!("Failed to create prover: {}", e))?;

    use tlsn::{connection::ServerName, webpki::RootCertStore};
    let tls_client_config = TlsClientConfig::builder()
        .server_name(ServerName::Dns(
            "raw.githubusercontent.com".try_into().unwrap(),
        ))
        .root_store(RootCertStore::mozilla())
        .build()
        .map_err(|e| format!("Failed to build TLS client config: {}", e))?;

    info!("[Prover] Connecting to proxy at {}", proxy_url);

    let result = if proxy_url.starts_with("wss://") {
        let proxy_ws = connect_wss(&proxy_url).await?;
        info!("[Prover] Connected to proxy (wss)");
        let proxy_stream = ws_stream_tungstenite::WsStream::new(proxy_ws);
        run_prover_with_stream(prover, tls_commit_config, tls_client_config, proxy_stream).await
    } else {
        let proxy_ws = connect_ws(&proxy_url).await?;
        info!("[Prover] Connected to proxy (ws)");
        let proxy_stream = ws_stream_tungstenite::WsStream::new(proxy_ws);
        run_prover_with_stream(prover, tls_commit_config, tls_client_config, proxy_stream).await
    };

    handle.close();

    driver_task
        .await
        .map_err(|e| format!("Driver task failed: {}", e))?
        .map_err(|e| format!("Session driver error: {}", e))?;

    result
}

// ============================================================================
// Integration Tests
// ============================================================================

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

    info.get("version").expect("Missing version field");
    info.get("git_hash").expect("Missing git_hash field");
    info.get("tlsn_version")
        .expect("Missing tlsn_version field");

    verifier_handle.abort();
}

#[tokio::test]
async fn test_webhook_integration_with_github() {
    let _ = tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .try_init();

    info!("Starting integration test");

    info!("Starting webhook server on port {}", WEBHOOK_PORT);
    let webhook_server = TestWebhookServer::start(WEBHOOK_PORT).await;

    info!("Starting verifier server on port {}", VERIFIER_PORT);
    let verifier_handle = start_verifier_server(WEBHOOK_PORT, VERIFIER_PORT).await;

    tokio::time::sleep(Duration::from_secs(1)).await;

    // 1. Open session and register
    let verifier_url = format!("ws://127.0.0.1:{}", VERIFIER_PORT);
    let mut session = SessionClient::connect(&verifier_url)
        .await
        .expect("Failed to connect to session endpoint");

    let session_data = HashMap::from([("test_key".to_string(), "test_value".to_string())]);

    session
        .register(session_data)
        .await
        .expect("Failed to register session");

    info!("Session registered");

    // 2. Take the binary stream and run the prover over it
    let verifier_stream = session.take_binary_stream();
    let proxy_url = format!(
        "ws://127.0.0.1:{}/proxy?token=raw.githubusercontent.com",
        VERIFIER_PORT
    );

    let prover_handle = tokio::spawn(async move {
        run_prover(verifier_stream, proxy_url, MAX_SENT_DATA, MAX_RECV_DATA).await
    });

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

    // 3. Send reveal config with actual transcript sizes
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

    // 4. Wait for session completion
    let results = tokio::time::timeout(Duration::from_secs(30), session.wait_for_completion())
        .await
        .expect("Session completion timed out")
        .expect("Session did not complete successfully");

    info!("Session completed with {} results", results.len());

    assert!(!results.is_empty(), "Should have handler results");

    let recv_str = String::from_utf8_lossy(&recv_transcript);
    assert!(
        recv_str.contains("software engineer") || recv_str.contains("Anytown"),
        "Response should contain expected JSON data: {}",
        &recv_str[..recv_str.len().min(500)]
    );

    // 5. Wait for webhook delivery and verify
    tokio::time::sleep(Duration::from_secs(2)).await;

    let payloads = webhook_server.get_payloads().await;
    assert_eq!(
        payloads.len(),
        1,
        "Should have received exactly one webhook"
    );

    let payload = &payloads[0];

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

    let webhook_recv = payload["transcript"]["recv"].as_str().unwrap();
    assert!(
        webhook_recv.contains("software engineer") || webhook_recv.contains("Anytown"),
        "Webhook transcript should contain expected JSON data"
    );

    info!("All assertions passed!");

    webhook_server.shutdown().await;
    verifier_handle.abort();

    info!("Integration test completed successfully!");
}
