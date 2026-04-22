//! TLSNotary Prover — thin wrapper around sdk-core.
//!
//! All protocol logic (MPC-TLS, HTTP, selective disclosure) is delegated to
//! `SdkProver`. This module handles:
//! - A single WebSocket to the verifier that carries both JSON control
//!   frames (Text) and MPC bytes (Binary), split by [`session_mux`].
//! - Direct TCP connection to the target server (no proxy needed on native).
//! - Session handshake (`register` / `registered`) and final `reveal_config`
//!   / `session_completed` exchange.

use futures::SinkExt;
use tlsn_sdk_core::{compute_reveal, ProverConfig, SdkProver};
use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tokio_util::compat::TokioAsyncReadCompatExt;
use url::Url;

use crate::{
    ws_io::session_mux, HttpHeader, HttpRequest, HttpResponse, ProofResult, ProgressCallback,
    ProverOptions, TlsnError, Transcript,
};

/// Emit progress if a callback is provided.
fn emit_progress(cb: Option<&dyn ProgressCallback>, step: &str, progress: f64, message: &str) {
    if let Some(cb) = cb {
        cb.on_progress(step.to_string(), progress, message.to_string());
    }
}

/// Main async prove function.
pub(crate) async fn prove_async(
    request: HttpRequest,
    options: ProverOptions,
    progress: Option<&dyn ProgressCallback>,
) -> Result<ProofResult, TlsnError> {
    let handlers_received = options.handlers.len() as u32;

    tracing::info!("starting proof for {} ({} handlers)", request.url, handlers_received);
    emit_progress(progress, "CONNECTING", 0.0, "Connecting to verifier...");

    // Parse URL to extract hostname for ProverConfig.
    let url = Url::parse(&request.url)?;
    let hostname = url
        .host_str()
        .ok_or_else(|| TlsnError::InvalidConfig("URL has no host".into()))?;

    // -----------------------------------------------------------------------
    // 1. Open session WebSocket and register
    // -----------------------------------------------------------------------
    let verifier_url = Url::parse(&options.verifier_url)?;
    let ws_protocol = if verifier_url.scheme() == "https" { "wss" } else { "ws" };
    let session_ws_url = format!(
        "{}://{}{}/session",
        ws_protocol,
        verifier_url.host_str().unwrap_or("localhost"),
        verifier_url.port().map(|p| format!(":{p}")).unwrap_or_default()
    );

    tracing::info!("connecting to session endpoint: {session_ws_url}");

    let (mut session_ws, _) = connect_async(&session_ws_url).await.map_err(|e| {
        TlsnError::ConnectionFailed(format!("failed to connect to session: {e}"))
    })?;

    let register_msg = serde_json::json!({
        "type": "register",
        "sessionData": {},
    });
    session_ws
        .send(Message::Text(register_msg.to_string()))
        .await
        .map_err(|e| TlsnError::ConnectionFailed(format!("failed to send register: {e}")))?;

    // Wait for `registered` response before splitting the socket.
    use futures::StreamExt;
    let server_session_id: Option<String> = loop {
        match session_ws.next().await {
            Some(Ok(Message::Text(text))) => {
                let resp: serde_json::Value = serde_json::from_str(&text)?;
                if resp["type"] == "registered" {
                    break resp["id"].as_str().map(String::from);
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
                    "session WebSocket closed before registration".into(),
                ))
            }
        }
    };
    tracing::info!(
        "session registered (server id: {})",
        server_session_id.as_deref().unwrap_or("<missing>")
    );
    emit_progress(progress, "SESSION_REGISTERED", 0.1, "Session registered");

    // Now split the WS into text + binary channels. Binary is the byte stream
    // for MPC; text is for reveal_config / session_completed.
    let mux = session_mux(session_ws);
    let mut text_rx = mux.text_rx;
    let send_text_tx = mux.send_text_tx;
    let verifier_io = mux.binary;

    // -----------------------------------------------------------------------
    // 2. Create prover & MPC setup (over the binary byte stream)
    // -----------------------------------------------------------------------
    let config = ProverConfig::builder(hostname)
        .max_sent_data(options.max_sent_data as usize)
        .max_recv_data(options.max_recv_data as usize)
        .build();

    let mut prover = SdkProver::new(config)?;
    prover.setup(verifier_io).await?;
    tracing::info!("MPC setup complete");
    emit_progress(progress, "MPC_SETUP", 0.25, "MPC session established");

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

    emit_progress(progress, "SENDING_REQUEST", 0.35, "Sending request...");
    let sdk_request = request.into_sdk();
    let sdk_response = prover.send_request(server_io, sdk_request).await?;
    tracing::info!("HTTP response: status {}", sdk_response.status);
    emit_progress(progress, "REQUEST_COMPLETE", 0.5, "Processing transcript...");

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
        #[allow(clippy::single_range_in_vec_init)]
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
    emit_progress(progress, "GENERATING_PROOF", 0.65, "Generating proof...");
    prover.reveal(compute_output.reveal).await?;
    tracing::info!("proof generated");
    emit_progress(progress, "REVEAL_COMPLETE", 0.8, "Sending verification data...");

    // -----------------------------------------------------------------------
    // 6. Send reveal_config on the session's text channel
    // -----------------------------------------------------------------------
    let reveal_config = build_reveal_config(
        &transcript,
        &sdk_handlers,
        &compute_output.sent_ranges_with_handlers,
        &compute_output.recv_ranges_with_handlers,
    );
    send_text_tx
        .send(reveal_config.to_string())
        .map_err(|_| TlsnError::ProofFailed("session mux closed before reveal_config".into()))?;

    // Wait for session_completed (with timeout — proof result is already available).
    let wait_result = tokio::time::timeout(std::time::Duration::from_secs(30), async {
        while let Some(text) = text_rx.recv().await {
            let resp: serde_json::Value = serde_json::from_str(&text)?;
            tracing::info!("session message: {}", resp["type"]);
            if resp["type"] == "session_completed" {
                tracing::info!("session completed");
                return Ok::<(), TlsnError>(());
            } else if resp["type"] == "error" {
                return Err(TlsnError::ProofFailed(
                    resp["message"].as_str().unwrap_or("unknown error").into(),
                ));
            }
        }
        tracing::warn!("session text channel closed before completion");
        Ok(())
    })
    .await;

    match wait_result {
        Ok(Ok(())) => {}
        Ok(Err(e)) => return Err(e),
        Err(_) => tracing::warn!("timed out waiting for session_completed (proof still valid)"),
    }
    emit_progress(progress, "VERIFICATION_COMPLETE", 0.95, "Verification complete");

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
