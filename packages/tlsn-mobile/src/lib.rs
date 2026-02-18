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

/// Handler action (what to do with the part).
#[derive(Debug, Clone, uniffi::Enum)]
pub enum HandlerAction {
    Reveal,
    Pedersen,
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

/// Prover options for the high-level prove function.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ProverOptions {
    pub verifier_url: String,
    pub max_sent_data: u32,
    pub max_recv_data: u32,
    pub handlers: Vec<Handler>,
}

/// Result of a proof operation.
#[derive(Debug, Clone, uniffi::Record)]
pub struct ProofResult {
    pub response: HttpResponse,
    pub transcript: Transcript,
    pub handlers_received: u32,
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
                HandlerAction::Pedersen => tlsn_sdk_core::HandlerAction::Pedersen,
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
// Public API
// ---------------------------------------------------------------------------

/// Initialize the TLSN library. Call this once at app startup.
#[uniffi::export]
pub fn initialize() -> Result<(), TlsnError> {
    let _ = tracing_subscriber::fmt()
        .with_env_filter("tlsn_mobile=info,tlsn=info")
        .try_init();

    tracing::info!("TLSN Mobile initialized (sdk-core)");
    Ok(())
}

/// High-level prove function.
///
/// Handles the entire proof flow:
/// 1. Register session with verifier
/// 2. Create prover and MPC setup
/// 3. Send HTTP request through TLS prover
/// 4. Compute reveal ranges from handlers
/// 5. Generate and finalize proof
/// 6. Send reveal config to verifier session
#[uniffi::export]
pub fn prove(request: HttpRequest, options: ProverOptions) -> Result<ProofResult, TlsnError> {
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| TlsnError::InitializationFailed(e.to_string()))?;

    rt.block_on(prover::prove_async(request, options))
}
