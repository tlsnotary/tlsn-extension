//! TLSNotary Mobile Bindings
//!
//! This crate provides native iOS/Android bindings for the TLSNotary prover.

mod prover;

// Use proc-macro based scaffolding (no UDL file needed)
uniffi::setup_scaffolding!();

/// Initialize the TLSN library
/// Call this once at app startup
#[uniffi::export]
pub fn initialize() -> Result<(), TlsnError> {
    // Initialize logging (always, not just debug)
    let _ = tracing_subscriber::fmt()
        .with_env_filter("tlsn_mobile=info,tlsn=info")
        .try_init();

    println!("[TLSN-RUST] TLSN Mobile initialized");
    tracing::info!("TLSN Mobile initialized");
    Ok(())
}

/// Error types for TLSN operations
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

impl From<String> for TlsnError {
    fn from(s: String) -> Self {
        TlsnError::InitializationFailed(s)
    }
}


/// HTTP header key-value pair
#[derive(Debug, Clone, uniffi::Record)]
pub struct HttpHeader {
    pub name: String,
    pub value: String,
}

/// HTTP request to prove
#[derive(Debug, Clone, uniffi::Record)]
pub struct HttpRequest {
    pub url: String,
    pub method: String,
    pub headers: Vec<HttpHeader>,
    pub body: Option<String>,
}

/// HTTP response from the proven request
#[derive(Debug, Clone, uniffi::Record)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: Vec<HttpHeader>,
    pub body: String,
}

/// Transcript of the TLS session
#[derive(Debug, Clone, uniffi::Record)]
pub struct Transcript {
    pub sent: Vec<u8>,
    pub recv: Vec<u8>,
}


/// Handler type (SENT or RECV)
#[derive(Debug, Clone, uniffi::Enum)]
pub enum HandlerType {
    Sent,
    Recv,
}

/// Handler part (which part of the HTTP message to reveal)
#[derive(Debug, Clone, uniffi::Enum)]
pub enum HandlerPart {
    StartLine,
    Headers,
    Body,
    All,
}

/// Handler action (what to do with the part)
#[derive(Debug, Clone, uniffi::Enum)]
pub enum HandlerAction {
    Reveal,
}

/// Handler parameters for fine-grained control
#[derive(Debug, Clone, uniffi::Record)]
pub struct HandlerParams {
    /// For HEADERS: specific header key to reveal
    pub key: Option<String>,
    /// For BODY: "json" for JSON parsing
    pub content_type: Option<String>,
    /// For BODY with JSON: JSON path like "items[0].name"
    pub path: Option<String>,
}

/// Reveal handler - specifies what to reveal in the proof
#[derive(Debug, Clone, uniffi::Record)]
pub struct Handler {
    pub handler_type: HandlerType,
    pub part: HandlerPart,
    pub action: HandlerAction,
    pub params: Option<HandlerParams>,
}

/// Prover options for the high-level prove function
#[derive(Debug, Clone, uniffi::Record)]
pub struct ProverOptions {
    pub verifier_url: String,
    pub proxy_url: String,
    pub max_sent_data: u32,
    pub max_recv_data: u32,
    /// Handlers for selective disclosure (if empty, reveals everything)
    pub handlers: Vec<Handler>,
}

/// Result of a proof operation
#[derive(Debug, Clone, uniffi::Record)]
pub struct ProofResult {
    pub response: HttpResponse,
    pub transcript: Transcript,
}

/// High-level prove function
///
/// This is a convenience wrapper that handles the entire proof flow:
/// 1. Create prover
/// 2. Register session with verifier
/// 3. Setup MPC
/// 4. Send HTTP request
/// 5. Generate proof
#[uniffi::export]
pub fn prove(request: HttpRequest, options: ProverOptions) -> Result<ProofResult, TlsnError> {
    // Create tokio runtime for async operations
    let rt = tokio::runtime::Runtime::new()
        .map_err(|e| TlsnError::InitializationFailed(e.to_string()))?;

    rt.block_on(async {
        prover::prove_async(request, options).await
    })
}
