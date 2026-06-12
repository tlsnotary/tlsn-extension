//! TLSNotary Mobile Bindings
//!
//! Thin wrapper around `sdk-core` providing native iOS/Android bindings via UniFFI.
//! All protocol logic (MPC-TLS, HTTP parsing, selective disclosure) is handled by
//! sdk-core — this crate only provides the transport adapter (WebSocket) and FFI types.

mod prover;
mod ws_io;

use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};

uniffi::setup_scaffolding!();

/// Process-wide tokio runtime.
///
/// FFI calls share this runtime so async resources (websockets, TCP streams)
/// stashed by `prove_until_reveal` survive across multiple FFI calls — a
/// per-call `Runtime::new()` would be dropped on return, killing every future
/// it owns and breaking the two-phase prove flow with
/// "connection is closed".
fn shared_runtime() -> &'static tokio::runtime::Runtime {
    static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("failed to build shared tokio runtime")
    })
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/// Error types for TLSN operations.
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum TlsnError {
    #[error("Initialization failed: {0}")]
    InitializationFailed(String),

    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Setup failed: {0}")]
    SetupFailed(String),

    #[error("Request failed: {0}")]
    RequestFailed(String),

    #[error("Proof failed: {0}")]
    ProofFailed(String),

    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    #[error("Operation timed out")]
    Timeout,
}

impl From<tlsn_sdk_core::SdkError> for TlsnError {
    fn from(e: tlsn_sdk_core::SdkError) -> Self {
        use tlsn_sdk_core::error::ErrorKind;
        match e.kind() {
            ErrorKind::Config => TlsnError::InvalidConfig(e.to_string()),
            ErrorKind::Io => TlsnError::ConnectionFailed(e.to_string()),
            ErrorKind::Protocol => TlsnError::SetupFailed(e.to_string()),
            ErrorKind::Http => TlsnError::RequestFailed(e.to_string()),
            ErrorKind::Handler => TlsnError::ProofFailed(e.to_string()),
            _ => TlsnError::ProofFailed(e.to_string()),
        }
    }
}

impl From<tokio_tungstenite::tungstenite::Error> for TlsnError {
    fn from(e: tokio_tungstenite::tungstenite::Error) -> Self {
        TlsnError::ConnectionFailed(e.to_string())
    }
}

impl From<serde_json::Error> for TlsnError {
    fn from(e: serde_json::Error) -> Self {
        TlsnError::ProofFailed(format!("JSON error: {e}"))
    }
}

impl From<url::ParseError> for TlsnError {
    fn from(e: url::ParseError) -> Self {
        TlsnError::InvalidConfig(format!("Invalid URL: {e}"))
    }
}

// ---------------------------------------------------------------------------
// UniFFI types (kept compatible with existing Swift/Kotlin bridge)
// ---------------------------------------------------------------------------

/// HTTP header key-value pair.
#[derive(Debug, Clone, uniffi::Record, serde::Serialize, serde::Deserialize)]
pub struct HttpHeader {
    pub name: String,
    pub value: String,
}

/// HTTP request to prove.
#[derive(Debug, Clone, uniffi::Record, serde::Serialize, serde::Deserialize)]
pub struct HttpRequest {
    pub url: String,
    pub method: String,
    pub headers: Vec<HttpHeader>,
    pub body: Option<String>,
}

/// HTTP response from the proven request.
#[derive(Debug, Clone, uniffi::Record, serde::Serialize, serde::Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: Vec<HttpHeader>,
    pub body: String,
}

/// Transcript of the TLS session.
#[derive(Debug, Clone, uniffi::Record, serde::Serialize, serde::Deserialize)]
pub struct Transcript {
    pub sent: Vec<u8>,
    pub recv: Vec<u8>,
}

/// Handler type (SENT or RECV).
#[derive(Debug, Clone, uniffi::Enum, serde::Serialize, serde::Deserialize)]
pub enum HandlerType {
    Sent,
    Recv,
}

/// Handler part (which part of the HTTP message to reveal).
#[derive(Debug, Clone, uniffi::Enum, serde::Serialize, serde::Deserialize)]
pub enum HandlerPart {
    StartLine,
    Protocol,
    Method,
    RequestTarget,
    StatusCode,
    Headers,
    Body,
    All,
}

/// Hash algorithm for hash-commitment actions.
#[derive(Debug, Clone, uniffi::Enum, serde::Serialize, serde::Deserialize)]
pub enum HashAlgorithm {
    Blake3,
    Sha256,
    Keccak256,
}

/// Handler action (what to do with the part).
///
/// JSON wire shape (matches the `NativeHandler.action` form used by the mobile
/// translation layer): `{"type": "Reveal"}` or `{"type": "Hash", "algorithm": "Blake3"}`.
#[derive(Debug, Clone, uniffi::Enum, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type")]
pub enum HandlerAction {
    Reveal,
    Hash { algorithm: HashAlgorithm },
}

/// Handler parameters for fine-grained control.
#[derive(Debug, Clone, uniffi::Record, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HandlerParams {
    pub key: Option<String>,
    pub hide_key: Option<bool>,
    pub hide_value: Option<bool>,
    pub content_type: Option<String>,
    pub path: Option<String>,
    pub regex: Option<String>,
    pub flags: Option<String>,
}

/// Reveal handler — specifies what to reveal in the proof.
#[derive(Debug, Clone, uniffi::Record, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Handler {
    pub handler_type: HandlerType,
    pub part: HandlerPart,
    pub action: HandlerAction,
    pub params: Option<HandlerParams>,
}

/// Protocol mode for the prover.
#[derive(Debug, Clone, Copy, uniffi::Enum, serde::Serialize, serde::Deserialize)]
pub enum Mode {
    /// MPC-TLS (default): co-runs the TLS handshake with the verifier.
    Mpc,
    /// Proxy: notary observes the TLS session via its proxy endpoint.
    Proxy,
}

/// Prover options for the high-level prove function.
#[derive(Debug, Clone, uniffi::Record, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProverOptions {
    pub verifier_url: String,
    pub max_sent_data: u32,
    pub max_recv_data: u32,
    pub handlers: Vec<Handler>,
    pub mode: Option<Mode>,
}

/// Result of a proof operation.
#[derive(Debug, Clone, uniffi::Record, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProofResult {
    pub response: HttpResponse,
    pub transcript: Transcript,
    pub handlers_received: u32,
}

/// One row in the reveal-approval preview.
///
/// Returned from [`prove_until_reveal`] for each annotated range that
/// `compute_reveal` produced. The user inspects these (in a native UI on the
/// JS side) and approves or rejects before [`prove_finalize`] runs.
///
/// `preview` contains the actual transcript bytes for the range, decoded as
/// UTF-8 lossy. The platform layer is responsible for truncating/escaping
/// before display.
#[derive(Debug, Clone, uniffi::Record, serde::Serialize, serde::Deserialize)]
pub struct RevealRangeDescriptor {
    /// "SENT" or "RECV"
    pub direction: String,
    /// Human-readable label (e.g. "Recv body / JSON 'screen_name'").
    pub label: String,
    /// "REVEAL" or "HASH"
    pub action: String,
    /// Hash algorithm name when `action == "HASH"` (e.g. "Sha256"). None for REVEAL.
    pub algorithm: Option<String>,
    /// UTF-8 lossy slice of the actual transcript bytes covered by this range.
    pub preview: String,
}

/// Output of [`prove_until_reveal`] — the prover paused after computing
/// reveal ranges. Pass [`session_id`] back to [`prove_finalize`] with an
/// approved bool to either complete the reveal or drop the session.
#[derive(Debug, Clone, uniffi::Record, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RevealPreparation {
    /// Opaque handle the platform passes back to [`prove_finalize`].
    pub session_id: String,
    /// HTTP response received from the target server.
    pub response: HttpResponse,
    /// One descriptor per annotated reveal range.
    pub descriptors: Vec<RevealRangeDescriptor>,
}

// ---------------------------------------------------------------------------
// Conversion: mobile UniFFI types → sdk-core types
// ---------------------------------------------------------------------------

impl Handler {
    pub(crate) fn into_sdk(self) -> tlsn_sdk_core::Handler {
        tlsn_sdk_core::Handler {
            handler_type: match self.handler_type {
                HandlerType::Sent => tlsn_sdk_core::HandlerType::Sent,
                HandlerType::Recv => tlsn_sdk_core::HandlerType::Recv,
            },
            part: match self.part {
                HandlerPart::StartLine => tlsn_sdk_core::HandlerPart::StartLine,
                HandlerPart::Protocol => tlsn_sdk_core::HandlerPart::Protocol,
                HandlerPart::Method => tlsn_sdk_core::HandlerPart::Method,
                HandlerPart::RequestTarget => tlsn_sdk_core::HandlerPart::RequestTarget,
                HandlerPart::StatusCode => tlsn_sdk_core::HandlerPart::StatusCode,
                HandlerPart::Headers => tlsn_sdk_core::HandlerPart::Headers,
                HandlerPart::Body => tlsn_sdk_core::HandlerPart::Body,
                HandlerPart::All => tlsn_sdk_core::HandlerPart::All,
            },
            action: match self.action {
                HandlerAction::Reveal => tlsn_sdk_core::HandlerAction::Reveal,
                HandlerAction::Hash { algorithm } => tlsn_sdk_core::HandlerAction::Hash {
                    algorithm: match algorithm {
                        HashAlgorithm::Blake3 => tlsn_sdk_core::HashAlgorithm::Blake3,
                        HashAlgorithm::Sha256 => tlsn_sdk_core::HashAlgorithm::Sha256,
                        HashAlgorithm::Keccak256 => tlsn_sdk_core::HashAlgorithm::Keccak256,
                    },
                },
            },
            params: self.params.map(|p| tlsn_sdk_core::HandlerParams {
                key: p.key,
                hide_key: p.hide_key,
                hide_value: p.hide_value,
                content_type: p.content_type,
                path: p.path,
                regex: p.regex,
                flags: p.flags,
            }),
        }
    }
}

impl HttpRequest {
    pub(crate) fn into_sdk(self) -> tlsn_sdk_core::HttpRequest {
        let method = match self.method.to_uppercase().as_str() {
            "POST" => tlsn_sdk_core::Method::POST,
            "PUT" => tlsn_sdk_core::Method::PUT,
            "DELETE" => tlsn_sdk_core::Method::DELETE,
            _ => tlsn_sdk_core::Method::GET,
        };

        let headers = self
            .headers
            .into_iter()
            .map(|h| (h.name, h.value.into_bytes()))
            .collect();

        tlsn_sdk_core::HttpRequest {
            uri: self.url,
            method,
            headers,
            body: self.body.map(|b| tlsn_sdk_core::Body::Raw(b.into_bytes())),
        }
    }
}

// ---------------------------------------------------------------------------
// Progress callback
// ---------------------------------------------------------------------------

/// Callback interface for receiving proof progress updates.
///
/// Implement this on the Swift/Kotlin side to receive real-time progress
/// from the Rust prover. Each call includes:
/// - `step`: machine-readable step name (e.g. "MPC_SETUP")
/// - `progress`: 0.0–1.0 fraction
/// - `message`: human-readable description
#[uniffi::export(callback_interface)]
pub trait ProgressCallback: Send + Sync {
    fn on_progress(&self, step: String, progress: f64, message: String);
}

// ---------------------------------------------------------------------------
// Log buffer (native `tracing` → platform, pull/drain model)
// ---------------------------------------------------------------------------

/// One buffered native log line, drained by the platform via [`drain_logs`].
#[derive(Debug, Clone, uniffi::Record)]
pub struct NativeLogLine {
    /// Tracing level: "ERROR" | "WARN" | "INFO" | "DEBUG" | "TRACE".
    pub level: String,
    /// Tracing target, e.g. "tlsn_mobile::prover".
    pub target: String,
    pub message: String,
}

/// Max lines retained between drains; oldest are dropped once full. Bounds memory
/// and bridge work when verbose levels (debug/trace) get chatty.
const LOG_BUFFER_CAPACITY: usize = 1000;

/// Process-wide ring buffer: the tracing layer pushes; the platform drains.
static LOG_BUFFER: Mutex<VecDeque<NativeLogLine>> = Mutex::new(VecDeque::new());

/// Default tracing directives applied at [`initialize`]; can be overridden at
/// runtime via [`set_log_level`].
const DEFAULT_LOG_FILTER: &str = "tlsn_mobile=info,tlsn=info";

/// Type-erased reloader for the env filter, installed by [`initialize`]. Erasing
/// the type avoids naming the (large) layered-subscriber type in a `static`.
#[allow(clippy::type_complexity)]
static RELOAD_FN: OnceLock<Box<dyn Fn(&str) + Send + Sync>> = OnceLock::new();

/// Drain all buffered native log lines (oldest first), clearing the buffer.
///
/// The platform polls this and forwards the lines into its in-app Logs screen.
/// Pulling (rather than a push callback) keeps the prover's worker threads off
/// the FFI/JS bridge and batches delivery under verbose logging.
#[uniffi::export]
pub fn drain_logs() -> Vec<NativeLogLine> {
    match LOG_BUFFER.lock() {
        Ok(mut buf) => buf.drain(..).collect(),
        Err(_) => Vec::new(),
    }
}

/// Change native log verbosity at runtime. `filter` is a tracing EnvFilter
/// directive string, e.g. "tlsn_mobile=debug,tlsn=debug". Invalid directives are
/// ignored; a no-op if called before [`initialize`].
#[uniffi::export]
pub fn set_log_level(filter: String) {
    if let Some(reload) = RELOAD_FN.get() {
        reload(&filter);
    }
}

/// Visitor that flattens a tracing event's `message` and structured fields into
/// a single display string.
#[derive(Default)]
struct MessageVisitor {
    message: String,
    fields: String,
}

impl MessageVisitor {
    fn into_text(self) -> String {
        match (self.message.is_empty(), self.fields.is_empty()) {
            (false, false) => format!("{} {}", self.message, self.fields),
            (true, false) => self.fields,
            _ => self.message,
        }
    }

    fn push(&mut self, name: &str, value: String) {
        if name == "message" {
            self.message = value;
        } else {
            if !self.fields.is_empty() {
                self.fields.push(' ');
            }
            self.fields.push_str(&format!("{name}={value}"));
        }
    }
}

impl tracing::field::Visit for MessageVisitor {
    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        self.push(field.name(), value.to_string());
    }

    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        self.push(field.name(), format!("{value:?}"));
    }
}

/// A `tracing` layer that appends every (already env-filtered) event to the
/// bounded [`LOG_BUFFER`]. Cheap and non-blocking — no FFI on the hot path.
struct BufferLayer;

impl<S: tracing::Subscriber> tracing_subscriber::Layer<S> for BufferLayer {
    fn on_event(
        &self,
        event: &tracing::Event<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) {
        let meta = event.metadata();
        let mut visitor = MessageVisitor::default();
        event.record(&mut visitor);
        let line = NativeLogLine {
            level: meta.level().to_string(),
            target: meta.target().to_string(),
            message: visitor.into_text(),
        };

        if let Ok(mut buf) = LOG_BUFFER.lock() {
            if buf.len() >= LOG_BUFFER_CAPACITY {
                buf.pop_front();
            }
            buf.push_back(line);
        }
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Initialize the TLSN library. Call this once at app startup.
#[uniffi::export]
pub fn initialize() -> Result<(), TlsnError> {
    use tracing_subscriber::layer::SubscriberExt;
    use tracing_subscriber::util::SubscriberInitExt;

    // Wrap the env filter in a reload layer so `set_log_level` can change tlsn
    // verbosity at runtime (e.g. from the app's Settings) without a restart.
    let (filter, reload_handle) = tracing_subscriber::reload::Layer::new(
        tracing_subscriber::EnvFilter::new(DEFAULT_LOG_FILTER),
    );

    // Layered subscriber:
    //   - reloadable EnvFilter limits noise to tlsn targets (global, all layers)
    //   - fmt layer keeps stdout output (Xcode console / logcat) as before
    //   - BufferLayer appends lines to LOG_BUFFER for the platform to drain
    let _ = tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .with(BufferLayer)
        .try_init();

    // Type-erase the reload handle for `set_log_level`. `set` only succeeds once,
    // keeping the handle bound to the live subscriber from the first init.
    let _ = RELOAD_FN.set(Box::new(move |directives: &str| {
        if let Ok(new_filter) = tracing_subscriber::EnvFilter::try_new(directives) {
            let _ = reload_handle.reload(new_filter);
        }
    }));

    tracing::info!("TLSNotary Mobile initialized (sdk-core)");
    Ok(())
}

/// Phase A of the two-phase prove flow.
///
/// Runs:
/// 1. Register session with verifier
/// 2. Create prover and MPC setup
/// 3. Send HTTP request through TLS prover
/// 4. Compute reveal ranges from handlers
///
/// Returns a [`RevealPreparation`] with byte-level previews of every range
/// the prover is about to reveal/hash. The platform shows the previews to
/// the user, then calls [`prove_finalize`] with the same `session_id` and an
/// `approved` bool. State is held in a process-wide map with a 5-minute TTL.
#[uniffi::export]
pub fn prove_until_reveal(
    request: HttpRequest,
    options: ProverOptions,
    progress: Option<Box<dyn ProgressCallback>>,
) -> Result<RevealPreparation, TlsnError> {
    let progress_arc = progress.map(std::sync::Arc::<dyn ProgressCallback>::from);
    shared_runtime().block_on(prover::prove_until_reveal_async(
        request,
        options,
        progress_arc,
    ))
}

/// Phase B of the two-phase prove flow.
///
/// Looks up the session, then either:
/// - `approved == true`: runs `prover.reveal(...)`, sends `reveal_config` to
///   the verifier, awaits `session_completed`, returns the [`ProofResult`].
/// - `approved == false`: drops the session, closes the verifier websocket,
///   returns `TlsnError::ProofFailed("User rejected reveal")`.
#[uniffi::export]
pub fn prove_finalize(
    session_id: String,
    approved: bool,
    progress: Option<Box<dyn ProgressCallback>>,
) -> Result<ProofResult, TlsnError> {
    let progress_arc = progress.map(std::sync::Arc::<dyn ProgressCallback>::from);
    shared_runtime().block_on(prover::prove_finalize_async(
        session_id,
        approved,
        progress_arc,
    ))
}

/// Legacy one-shot `prove`. Equivalent to [`prove_until_reveal`] followed by
/// [`prove_finalize`] with `approved=true`. Kept for backward compatibility
/// while callers migrate to the two-phase API.
#[uniffi::export]
pub fn prove(
    request: HttpRequest,
    options: ProverOptions,
    progress: Option<Box<dyn ProgressCallback>>,
) -> Result<ProofResult, TlsnError> {
    let progress_arc = progress.map(std::sync::Arc::<dyn ProgressCallback>::from);
    shared_runtime().block_on(prover::prove_async(request, options, progress_arc))
}
