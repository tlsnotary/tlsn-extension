//! TLSNotary Prover — thin wrapper around sdk-core.
//!
//! All protocol logic (MPC-TLS, HTTP, selective disclosure) is delegated to
//! `SdkProver`. This module handles:
//! - WebSocket transport via [`WsIoAdapter`] (for verifier connection)
//! - Direct TCP connection to the target server (no proxy needed on native)
//! - Verifier session registration (the `/session` → `/verifier` protocol)
//! - Sending `reveal_config` to the verifier session WebSocket
//!
//! # Two-phase API
//!
//! [`prove_until_reveal_async`] runs the full protocol up through
//! `compute_reveal`, then **stashes** the in-flight prover, websocket,
//! transcript, and computed reveal ranges in a process-wide session map keyed
//! by a UUID. The caller (mobile app) inspects the descriptors, asks the user
//! for approval, then calls [`prove_finalize_async`] with the same session id
//! and an `approved` bool.
//!
//! The legacy one-shot [`prove_async`] is preserved as a thin wrapper that
//! always auto-approves — kept to avoid breaking existing callers.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use futures::{SinkExt, StreamExt};
use tlsn_sdk_core::{compute_reveal, config::ProverMode, ProverConfig, SdkProver};
use tokio::net::TcpStream;
use tokio::sync::oneshot;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tokio_util::compat::TokioAsyncReadCompatExt;
use url::Url;
use uuid::Uuid;

use crate::{
    shared_runtime, ws_io::WsIoAdapter, HttpHeader, HttpRequest, HttpResponse, Mode,
    ProgressCallback, ProofResult, ProverOptions, RevealPreparation, RevealRangeDescriptor,
    TlsnError, Transcript,
};

impl Mode {
    fn to_sdk(self) -> ProverMode {
        match self {
            Mode::Mpc => ProverMode::Mpc,
            Mode::Proxy => ProverMode::Proxy,
        }
    }
}

/// Sessions older than this are reaped from the map.
const SESSION_TTL: Duration = Duration::from_secs(5 * 60);

/// Channels we hand the spawned prove task between phase A and phase B.
///
/// Phase A spawns a task that runs the entire prove flow. The task pauses
/// after `compute_reveal` waiting on `approval_rx`. Phase B sends `approved`
/// over `approval_tx`; the task resumes, completes, and emits the result via
/// `result_rx`. Spawning is what keeps the prover's websocket future being
/// polled by tokio worker threads in the gap between FFI calls.
struct PendingSession {
    approval_tx: oneshot::Sender<bool>,
    result_rx: oneshot::Receiver<Result<ProofResult, TlsnError>>,
    created_at: Instant,
}

static SESSIONS: OnceLock<Mutex<HashMap<String, PendingSession>>> = OnceLock::new();

fn sessions() -> &'static Mutex<HashMap<String, PendingSession>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Drop sessions that have been pending longer than `SESSION_TTL`. Called
/// opportunistically each time we touch the map so a JS-side crash can't leak
/// a session forever.
fn reap_expired() {
    if let Ok(mut map) = sessions().lock() {
        let now = Instant::now();
        map.retain(|_, s| now.duration_since(s.created_at) < SESSION_TTL);
    }
}

/// Connect to a WebSocket URL and return an [`WsIoAdapter`].
async fn connect_ws(url: &str) -> Result<WsIoAdapter, TlsnError> {
    let (ws, _) = connect_async(url).await?;
    Ok(WsIoAdapter::new(ws))
}

/// Emit progress if a callback is provided.
fn emit_progress(cb: Option<&dyn ProgressCallback>, step: &str, progress: f64, message: &str) {
    if let Some(cb) = cb {
        cb.on_progress(step.to_string(), progress, message.to_string());
    }
}

/// Phase A: spawn a prove task on the shared runtime; the task runs steps
/// 1–4, sends back the descriptors, then suspends on the approval channel.
/// We block on `descriptor_rx` to return the preview to JS without waiting
/// for the user.
pub(crate) async fn prove_until_reveal_async(
    request: HttpRequest,
    options: ProverOptions,
    progress: Option<std::sync::Arc<dyn ProgressCallback>>,
) -> Result<RevealPreparation, TlsnError> {
    reap_expired();

    let (descriptor_tx, descriptor_rx) =
        oneshot::channel::<Result<RevealPreparation, TlsnError>>();
    let (approval_tx, approval_rx) = oneshot::channel::<bool>();
    let (result_tx, result_rx) = oneshot::channel::<Result<ProofResult, TlsnError>>();

    let session_id = Uuid::new_v4().to_string();

    // Spawn the full prove flow on the shared runtime. The task drives the
    // websocket futures (kept alive by tokio worker threads) across the gap
    // between phase A's block_on returning and phase B's block_on starting.
    shared_runtime().spawn(async move {
        let progress_ref = progress.as_deref();
        match run_prove_with_gate(request, options, progress_ref, descriptor_tx, approval_rx).await
        {
            Ok(result) => {
                let _ = result_tx.send(Ok(result));
            }
            Err(err) => {
                let _ = result_tx.send(Err(err));
            }
        }
    });

    // Wait for the spawned task to reach the descriptor handoff point.
    let prep = match descriptor_rx.await {
        Ok(Ok(p)) => p,
        Ok(Err(e)) => return Err(e),
        Err(_) => {
            return Err(TlsnError::ProofFailed(
                "prove task ended before producing descriptors".into(),
            ))
        }
    };

    // Stash the channels under the session_id so phase B can resume the task.
    let pending = PendingSession {
        approval_tx,
        result_rx,
        created_at: Instant::now(),
    };
    sessions()
        .lock()
        .map_err(|_| TlsnError::ProofFailed("session map poisoned".into()))?
        .insert(session_id.clone(), pending);

    Ok(RevealPreparation {
        session_id,
        response: prep.response,
        descriptors: prep.descriptors,
    })
}

/// Spawned-task body. Runs the entire prove flow, sending the descriptors via
/// `descriptor_tx` once `compute_reveal` produces them, then awaiting the
/// `approval_rx` signal before either revealing or aborting.
async fn run_prove_with_gate(
    request: HttpRequest,
    options: ProverOptions,
    progress: Option<&dyn ProgressCallback>,
    descriptor_tx: oneshot::Sender<Result<RevealPreparation, TlsnError>>,
    approval_rx: oneshot::Receiver<bool>,
) -> Result<ProofResult, TlsnError> {
    let handlers_received = options.handlers.len() as u32;
    let mode = options.mode.unwrap_or(Mode::Mpc);

    tracing::info!(
        "starting proof (until reveal) for {} ({} handlers, mode={:?})",
        request.url,
        handlers_received,
        mode,
    );
    emit_progress(progress, "CONNECTING", 0.0, "Connecting to verifier...");

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

    let session_id_verifier = loop {
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
    tracing::info!("session registered: {session_id_verifier}");
    emit_progress(progress, "SESSION_REGISTERED", 0.1, "Session registered");

    // -----------------------------------------------------------------------
    // 2. Create prover & MPC setup
    // -----------------------------------------------------------------------
    let config = ProverConfig::builder(hostname)
        .mode(mode.to_sdk())
        .max_sent_data(options.max_sent_data as usize)
        .max_recv_data(options.max_recv_data as usize)
        .build()?;

    let mut prover = SdkProver::new(config)?;

    let verifier_ws_url = format!("{base_ws_url}/verifier?sessionId={session_id_verifier}");
    tracing::info!("connecting to verifier: {verifier_ws_url}");

    let verifier_io = connect_ws(&verifier_ws_url).await?;
    prover.setup(verifier_io).await?;
    tracing::info!("MPC setup complete");
    emit_progress(progress, "MPC_SETUP", 0.25, "MPC session established");

    // -----------------------------------------------------------------------
    // 3. Send HTTP request — MPC opens a direct TCP to the server; Proxy
    //    routes server traffic through the verifier session.
    // -----------------------------------------------------------------------
    emit_progress(progress, "SENDING_REQUEST", 0.35, "Sending request...");
    let sdk_request = request.into_sdk();
    let sdk_response = match mode {
        Mode::Mpc => {
            let port = url.port().unwrap_or(443);
            let server_addr = format!("{}:{}", hostname, port);
            tracing::info!("connecting directly to server: {server_addr}");

            let tcp_stream = TcpStream::connect(&server_addr).await.map_err(|e| {
                TlsnError::ConnectionFailed(format!("failed to connect to {server_addr}: {e}"))
            })?;
            // Convert tokio TcpStream (tokio::io::AsyncRead) to futures::AsyncRead for sdk-core's Io trait.
            let server_io = tcp_stream.compat();
            prover.send_request_mpc(server_io, sdk_request).await?
        }
        Mode::Proxy => {
            tracing::info!("proxy mode: server traffic tunneled through verifier session");
            prover.send_request_proxy(sdk_request).await?
        }
    };
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
        tracing::info!("no handlers specified, revealing all data");
        tlsn_sdk_core::handler::ComputeRevealOutput {
            reveal: tlsn_sdk_core::Reveal {
                sent: vec![0..transcript.sent.len()],
                recv: vec![0..transcript.recv.len()],
                server_identity: true,
            },
            commit: None,
            sent_ranges_with_handlers: vec![],
            recv_ranges_with_handlers: vec![],
        }
    } else {
        tracing::info!("computing reveal from {} handlers", sdk_handlers.len());
        compute_reveal(&transcript.sent, &transcript.recv, &sdk_handlers)?
    };

    // -----------------------------------------------------------------------
    // Build descriptors for the JS approval sheet.
    // -----------------------------------------------------------------------
    let descriptors = build_descriptors(&transcript, &compute_output);
    emit_progress(progress, "AWAITING_APPROVAL", 0.55, "Awaiting reveal approval...");

    // Build response payload now while sdk_response is still owned.
    let response_headers: Vec<HttpHeader> = sdk_response
        .headers
        .iter()
        .map(|(name, value)| HttpHeader {
            name: name.clone(),
            value: String::from_utf8_lossy(value).into_owned(),
        })
        .collect();
    let response_body_str = sdk_response
        .body
        .as_ref()
        .map(|b| String::from_utf8_lossy(b).into_owned())
        .unwrap_or_default();
    let response = HttpResponse {
        status: sdk_response.status,
        headers: response_headers,
        body: response_body_str,
    };

    // Hand the descriptors back to phase A's block_on. session_id is
    // assigned by the caller; we don't include it here.
    let _ = descriptor_tx.send(Ok(RevealPreparation {
        session_id: String::new(),
        response,
        descriptors,
    }));

    // Wait for phase B to send the approval signal.
    let mut prover = prover;
    let mut session_ws = session_ws;
    let approved = approval_rx.await.unwrap_or(false);

    if !approved {
        tracing::info!("user rejected reveal; dropping session");
        let _ = session_ws.close(None).await;
        return Err(TlsnError::ProofFailed("User rejected reveal".into()));
    }

    // -----------------------------------------------------------------------
    // 5. Reveal and finalize
    // -----------------------------------------------------------------------
    emit_progress(progress, "GENERATING_PROOF", 0.65, "Generating proof...");
    prover
        .reveal(compute_output.reveal.clone(), compute_output.commit.clone())
        .await?;
    tracing::info!("proof generated");
    emit_progress(progress, "REVEAL_COMPLETE", 0.8, "Sending verification data...");

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

    let wait_result = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        async {
            loop {
                match session_ws.next().await {
                    Some(Ok(Message::Text(text))) => {
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
                    Some(Ok(_)) => continue,
                    Some(Err(e)) => return Err(TlsnError::ProofFailed(format!("WebSocket error: {e}"))),
                    None => {
                        tracing::warn!("session WebSocket closed before completion");
                        return Ok(());
                    }
                }
            }
        },
    )
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

/// Phase B: send the approval signal to the spawned task and await its result.
///
/// `_progress` here is a no-op — the spawned task already holds its own
/// progress reference from phase A. We accept it on the FFI surface for
/// symmetry but don't forward it.
pub(crate) async fn prove_finalize_async(
    session_id: String,
    approved: bool,
    _progress: Option<std::sync::Arc<dyn ProgressCallback>>,
) -> Result<ProofResult, TlsnError> {
    reap_expired();

    let pending = sessions()
        .lock()
        .map_err(|_| TlsnError::ProofFailed("session map poisoned".into()))?
        .remove(&session_id)
        .ok_or_else(|| TlsnError::ProofFailed(format!("unknown session: {session_id}")))?;

    // Wake the spawned task. If `send` fails the task is already gone (likely
    // panicked or aborted); we'll discover that via `result_rx`.
    let _ = pending.approval_tx.send(approved);

    match pending.result_rx.await {
        Ok(r) => r,
        Err(_) => Err(TlsnError::ProofFailed(
            "prove task ended without producing a result".into(),
        )),
    }
}

/// Legacy one-shot `prove`. Calls phase A then auto-approves into phase B,
/// preserving the historic behavior for callers that haven't migrated to the
/// two-phase API yet.
pub(crate) async fn prove_async(
    request: HttpRequest,
    options: ProverOptions,
    progress: Option<std::sync::Arc<dyn ProgressCallback>>,
) -> Result<ProofResult, TlsnError> {
    let prep = prove_until_reveal_async(request, options, progress.clone()).await?;
    prove_finalize_async(prep.session_id, true, progress).await
}

/// Translate compute_reveal's annotated ranges into platform-friendly
/// descriptors with real byte previews.
fn build_descriptors(
    transcript: &tlsn_sdk_core::Transcript,
    output: &tlsn_sdk_core::handler::ComputeRevealOutput,
) -> Vec<RevealRangeDescriptor> {
    let mut out = Vec::with_capacity(
        output.sent_ranges_with_handlers.len() + output.recv_ranges_with_handlers.len(),
    );

    for r in &output.sent_ranges_with_handlers {
        out.push(descriptor_from_range(r, &transcript.sent, "SENT"));
    }
    for r in &output.recv_ranges_with_handlers {
        out.push(descriptor_from_range(r, &transcript.recv, "RECV"));
    }

    out
}

fn descriptor_from_range(
    r: &tlsn_sdk_core::handler::RangeWithHandler,
    bytes: &[u8],
    direction: &str,
) -> RevealRangeDescriptor {
    let slice = bytes.get(r.start..r.end).unwrap_or(&[]);
    let preview = String::from_utf8_lossy(slice).into_owned();

    let (action, algorithm) = match &r.handler.action {
        tlsn_sdk_core::HandlerAction::Reveal => ("REVEAL".to_string(), None),
        tlsn_sdk_core::HandlerAction::Hash { algorithm } => {
            let alg_str = match algorithm {
                tlsn_sdk_core::HashAlgorithm::Blake3 => "Blake3",
                tlsn_sdk_core::HashAlgorithm::Sha256 => "Sha256",
                tlsn_sdk_core::HashAlgorithm::Keccak256 => "Keccak256",
            };
            ("HASH".to_string(), Some(alg_str.to_string()))
        }
    };

    RevealRangeDescriptor {
        direction: direction.to_string(),
        label: handler_label(&r.handler),
        action,
        algorithm,
        preview,
    }
}

fn handler_label(h: &tlsn_sdk_core::Handler) -> String {
    let direction = match h.handler_type {
        tlsn_sdk_core::HandlerType::Sent => "Sent",
        tlsn_sdk_core::HandlerType::Recv => "Recv",
    };
    let part = match h.part {
        tlsn_sdk_core::HandlerPart::StartLine => "start line",
        tlsn_sdk_core::HandlerPart::Protocol => "protocol",
        tlsn_sdk_core::HandlerPart::Method => "method",
        tlsn_sdk_core::HandlerPart::RequestTarget => "request target",
        tlsn_sdk_core::HandlerPart::StatusCode => "status code",
        tlsn_sdk_core::HandlerPart::Headers => "header",
        tlsn_sdk_core::HandlerPart::Body => "body",
        tlsn_sdk_core::HandlerPart::All => "all",
    };
    let detail = h.params.as_ref().and_then(|p| {
        if let Some(key) = &p.key {
            Some(format!(" '{}'", key))
        } else if let Some(path) = &p.path {
            Some(format!(" path '{}'", path))
        } else {
            None
        }
    });
    match detail {
        Some(d) => format!("{direction} {part}{d}"),
        None => format!("{direction} {part}"),
    }
}

/// Build the `reveal_config` JSON message for the verifier session WebSocket.
fn build_reveal_config(
    transcript: &tlsn_sdk_core::Transcript,
    handlers: &[tlsn_sdk_core::Handler],
    sent_ranges: &[tlsn_sdk_core::handler::RangeWithHandler],
    recv_ranges: &[tlsn_sdk_core::handler::RangeWithHandler],
) -> serde_json::Value {
    if handlers.is_empty() {
        return serde_json::json!({
            "type": "reveal_config",
            "sent": [{ "start": 0, "end": transcript.sent.len(), "handler": { "type": "SENT", "part": "ALL" } }],
            "recv": [{ "start": 0, "end": transcript.recv.len(), "handler": { "type": "RECV", "part": "ALL" } }],
        });
    }

    serde_json::json!({
        "type": "reveal_config",
        "sent": sent_ranges,
        "recv": recv_ranges,
    })
}
