//! TLSNotary Prover — thin wrapper around sdk-core.
//!
//! All protocol logic (MPC-TLS, HTTP, selective disclosure) is delegated to
//! `SdkProver`. This module handles:
//! - WebSocket transport via [`WsIoAdapter`] (for verifier connection)
//! - Direct TCP connection to the target server (no proxy needed on native)
//! - Verifier session registration (the `/session` → `/verifier` protocol)
//! - Sending `reveal_config` to the verifier session WebSocket

use futures::{SinkExt, StreamExt};
use tlsn_sdk_core::{compute_reveal, ProverConfig, SdkProver};
use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tokio_util::compat::TokioAsyncReadCompatExt;
use url::Url;

use crate::{
    ws_io::WsIoAdapter, HttpHeader, HttpRequest, HttpResponse, ProofResult, ProverOptions,
    TlsnError, Transcript,
};

/// Connect to a WebSocket URL and return an [`WsIoAdapter`].
async fn connect_ws(url: &str) -> Result<WsIoAdapter, TlsnError> {
    let (ws, _) = connect_async(url).await?;
    Ok(WsIoAdapter::new(ws))
}

/// Main async prove function.
pub(crate) async fn prove_async(
    request: HttpRequest,
    options: ProverOptions,
) -> Result<ProofResult, TlsnError> {
    let handlers_received = options.handlers.len() as u32;

    tracing::info!("starting proof for {} ({} handlers)", request.url, handlers_received);

    // Parse URL to extract hostname for ProverConfig.
    let url = Url::parse(&request.url)?;
    let hostname = url
        .host_str()
        .ok_or_else(|| TlsnError::InvalidConfig("URL has no host".into()))?;

    // -----------------------------------------------------------------------
    // 1. Register session with verifier
    // -----------------------------------------------------------------------
    let verifier_url = Url::parse(&options.verifier_url)?;
    let ws_protocol = if verifier_url.scheme() == "https" { "wss" } else { "ws" };
    let base_ws_url = format!(
        "{}://{}{}",
        ws_protocol,
        verifier_url.host_str().unwrap_or("localhost"),
        verifier_url.port().map(|p| format!(":{p}")).unwrap_or_default()
    );

    let session_ws_url = format!("{base_ws_url}/session");
    tracing::info!("connecting to session endpoint: {session_ws_url}");

    let (mut session_ws, _) = connect_async(&session_ws_url).await.map_err(|e| {
        TlsnError::ConnectionFailed(format!("failed to connect to session: {e}"))
    })?;

    // Send register message.
    let register_msg = serde_json::json!({
        "type": "register",
        "maxRecvData": options.max_recv_data,
        "maxSentData": options.max_sent_data,
        "sessionData": {},
    });
    session_ws
        .send(Message::Text(register_msg.to_string().into()))
        .await
        .map_err(|e| TlsnError::ConnectionFailed(format!("failed to send register: {e}")))?;

    // Wait for session_registered response.
    let session_id = loop {
        match session_ws.next().await {
            Some(Ok(Message::Text(text))) => {
                let resp: serde_json::Value = serde_json::from_str(&text)?;
                if resp["type"] == "session_registered" {
                    break resp["sessionId"]
                        .as_str()
                        .ok_or_else(|| TlsnError::ConnectionFailed("missing sessionId".into()))?
                        .to_string();
                } else if resp["type"] == "error" {
                    return Err(TlsnError::ConnectionFailed(
                        resp["message"].as_str().unwrap_or("unknown error").into(),
                    ));
                }
            }
            Some(Ok(_)) => continue,
            Some(Err(e)) => {
                return Err(TlsnError::ConnectionFailed(format!("WebSocket error: {e}")))
            }
            None => {
                return Err(TlsnError::ConnectionFailed(
                    "session WebSocket closed unexpectedly".into(),
                ))
            }
        }
    };
    tracing::info!("session registered: {session_id}");

    // -----------------------------------------------------------------------
    // 2. Create prover & MPC setup
    // -----------------------------------------------------------------------
    let config = ProverConfig::builder(hostname)
        .max_sent_data(options.max_sent_data as usize)
        .max_recv_data(options.max_recv_data as usize)
        .build();

    let mut prover = SdkProver::new(config)?;

    let verifier_ws_url = format!("{base_ws_url}/verifier?sessionId={session_id}");
    tracing::info!("connecting to verifier: {verifier_ws_url}");

    let verifier_io = connect_ws(&verifier_ws_url).await?;
    prover.setup(verifier_io).await?;
    tracing::info!("MPC setup complete");

    // -----------------------------------------------------------------------
    // 3. Send HTTP request through direct TCP (no proxy needed on native)
    // -----------------------------------------------------------------------
    let port = url.port().unwrap_or(443);
    let server_addr = format!("{}:{}", hostname, port);
    tracing::info!("connecting directly to server: {server_addr}");

    let tcp_stream = TcpStream::connect(&server_addr).await.map_err(|e| {
        TlsnError::ConnectionFailed(format!("failed to connect to {server_addr}: {e}"))
    })?;
    // Convert tokio TcpStream (tokio::io::AsyncRead) to futures::AsyncRead for sdk-core's Io trait.
    let server_io = tcp_stream.compat();

    let sdk_request = request.into_sdk();
    let sdk_response = prover.send_request(server_io, sdk_request).await?;
    tracing::info!("HTTP response: status {}", sdk_response.status);

    // -----------------------------------------------------------------------
    // 4. Compute reveal ranges from handlers
    // -----------------------------------------------------------------------
    let transcript = prover.transcript()?;

    let sdk_handlers: Vec<tlsn_sdk_core::Handler> = options
        .handlers
        .into_iter()
        .map(|h| h.into_sdk())
        .collect();

    let compute_output = if sdk_handlers.is_empty() {
        // No handlers → reveal everything.
        tracing::info!("no handlers specified, revealing all data");
        tlsn_sdk_core::handler::ComputeRevealOutput {
            reveal: tlsn_sdk_core::Reveal {
                sent: vec![0..transcript.sent.len()],
                recv: vec![0..transcript.recv.len()],
                server_identity: true,
            },
            sent_ranges_with_handlers: vec![],
            recv_ranges_with_handlers: vec![],
        }
    } else {
        tracing::info!("computing reveal from {} handlers", sdk_handlers.len());
        compute_reveal(&transcript.sent, &transcript.recv, &sdk_handlers)?
    };

    // -----------------------------------------------------------------------
    // 5. Reveal and finalize
    // -----------------------------------------------------------------------
    prover.reveal(compute_output.reveal).await?;
    tracing::info!("proof generated");

    // -----------------------------------------------------------------------
    // 6. Send reveal_config to verifier session
    // -----------------------------------------------------------------------
    let reveal_config = build_reveal_config(
        &transcript,
        &sdk_handlers,
        &compute_output.sent_ranges_with_handlers,
        &compute_output.recv_ranges_with_handlers,
    );
    session_ws
        .send(Message::Text(reveal_config.to_string().into()))
        .await
        .map_err(|e| TlsnError::ProofFailed(format!("failed to send reveal_config: {e}")))?;

    // Wait for session_completed.
    loop {
        match session_ws.next().await {
            Some(Ok(Message::Text(text))) => {
                let resp: serde_json::Value = serde_json::from_str(&text)?;
                if resp["type"] == "session_completed" {
                    tracing::info!("session completed");
                    break;
                } else if resp["type"] == "error" {
                    return Err(TlsnError::ProofFailed(
                        resp["message"].as_str().unwrap_or("unknown error").into(),
                    ));
                }
            }
            Some(Ok(_)) => continue,
            Some(Err(e)) => return Err(TlsnError::ProofFailed(format!("WebSocket error: {e}"))),
            None => {
                tracing::warn!("session WebSocket closed before completion");
                break;
            }
        }
    }

    // -----------------------------------------------------------------------
    // 7. Build result
    // -----------------------------------------------------------------------
    let response_headers = sdk_response
        .headers
        .into_iter()
        .map(|(name, value)| HttpHeader {
            name,
            value: String::from_utf8_lossy(&value).into_owned(),
        })
        .collect();

    let response_body = sdk_response
        .body
        .map(|b| String::from_utf8_lossy(&b).into_owned())
        .unwrap_or_default();

    Ok(ProofResult {
        response: HttpResponse {
            status: sdk_response.status,
            headers: response_headers,
            body: response_body,
        },
        transcript: Transcript {
            sent: transcript.sent,
            recv: transcript.recv,
        },
        handlers_received,
    })
}

/// Build the `reveal_config` JSON message for the verifier session WebSocket.
fn build_reveal_config(
    transcript: &tlsn_sdk_core::Transcript,
    handlers: &[tlsn_sdk_core::Handler],
    sent_ranges: &[tlsn_sdk_core::handler::RangeWithHandler],
    recv_ranges: &[tlsn_sdk_core::handler::RangeWithHandler],
) -> serde_json::Value {
    // If no handlers were specified, reveal everything.
    if handlers.is_empty() {
        return serde_json::json!({
            "type": "reveal_config",
            "sent": [{ "start": 0, "end": transcript.sent.len(), "handler": { "type": "SENT", "part": "ALL" } }],
            "recv": [{ "start": 0, "end": transcript.recv.len(), "handler": { "type": "RECV", "part": "ALL" } }],
        });
    }

    // Serialize annotated ranges from compute_reveal.
    // RangeWithHandler and Handler implement Serialize with the correct field names.
    serde_json::json!({
        "type": "reveal_config",
        "sent": sent_ranges,
        "recv": recv_ranges,
    })
}
