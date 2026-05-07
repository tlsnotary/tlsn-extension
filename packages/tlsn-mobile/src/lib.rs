//! TLSNotary Mobile Bindings
//!
//! Thin wrapper around `sdk-core` providing native iOS/Android bindings via UniFFI.
//! All protocol logic (MPC-TLS, HTTP parsing, selective disclosure) is handled by
//! sdk-core — this crate only provides the transport adapter (WebSocket) and FFI types.

mod prover;
mod ws_io;

uniffi::setup_scaffolding!();

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
#[derive(Debug, Clone, uniffi::Record)]
pub struct HttpHeader {
    pub name: String,
    pub value: String,
}

/// HTTP request to prove.
#[derive(Debug, Clone, uniffi::Record)]
pub struct HttpRequest {
    pub url: String,
    pub method: String,
    pub headers: Vec<HttpHeader>,
    pub body: Option<String>,
}

/// HTTP response from the proven request.
#[derive(Debug, Clone, uniffi::Record)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: Vec<HttpHeader>,
    pub body: String,
}

/// Transcript of the TLS session.
#[derive(Debug, Clone, uniffi::Record)]
pub struct Transcript {
    pub sent: Vec<u8>,
    pub recv: Vec<u8>,
}

/// Handler type (SENT or RECV).
#[derive(Debug, Clone, uniffi::Enum)]
pub enum HandlerType {
    Sent,
    Recv,
}

/// Handler part (which part of the HTTP message to reveal).
#[derive(Debug, Clone, uniffi::Enum)]
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
#[derive(Debug, Clone, uniffi::Enum)]
pub enum HashAlgorithm {
    Blake3,
    Sha256,
    Keccak256,
}

/// Handler action (what to do with the part).
#[derive(Debug, Clone, uniffi::Enum)]
pub enum HandlerAction {
    Reveal,
    Hash { algorithm: HashAlgorithm },
}

/// Handler parameters for fine-grained control.
#[derive(Debug, Clone, uniffi::Record)]
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
#[derive(Debug, Clone, uniffi::Record)]
pub struct Handler {
    pub handler_type: HandlerType,
    pub part: HandlerPart,
    pub action: HandlerAction,
    pub params: Option<HandlerParams>,
}

/// Protocol mode for the prover.
#[derive(Debug, Clone, Copy, uniffi::Enum)]
pub enum Mode {
    /// MPC-TLS (default): co-runs the TLS handshake with the verifier.
    Mpc,
    /// Proxy: notary observes the TLS session via its proxy endpoint.
    Proxy,
}

/// Prover options for the high-level prove function.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ProverOptions {
    pub verifier_url: String,
    pub max_sent_data: u32,
    pub max_recv_data: u32,
    pub handlers: Vec<Handler>,
    pub mode: Option<Mode>,
}

/// Result of a proof operation.
#[derive(Debug, Clone, uniffi::Record)]
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
#[derive(Debug, Clone, uniffi::Record)]
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
#[derive(Debug, Clone, uniffi::Record)]
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
// Public API
// ---------------------------------------------------------------------------

/// Initialize the TLSN library. Call this once at app startup.
#[uniffi::export]
pub fn initialize() -> Result<(), TlsnError> {
    let _ = tracing_subscriber::fmt()
        .with_env_filter("tlsn_mobile=info,tlsn=info")
        .try_init();

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
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| TlsnError::InitializationFailed(e.to_string()))?;

    rt.block_on(prover::prove_until_reveal_async(
        request,
        options,
        progress.as_deref(),
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
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| TlsnError::InitializationFailed(e.to_string()))?;

    rt.block_on(prover::prove_finalize_async(
        session_id,
        approved,
        progress.as_deref(),
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
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| TlsnError::InitializationFailed(e.to_string()))?;

    rt.block_on(prover::prove_async(request, options, progress.as_deref()))
}
