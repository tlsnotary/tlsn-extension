use crate::ws::TungsteniteStream;
use eyre::eyre;
use tlsn::{
    config::verifier::VerifierConfig,
    connection::{DnsName, ServerName},
    transcript::{PartialTranscript, TranscriptCommitment},
    verifier::{VerifierCommitStart, VerifierOutput},
    webpki::RootCertStore,
    Session,
};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio::sync::oneshot;
use tokio_util::compat::TokioAsyncReadCompatExt;
use tracing::{debug, info};

/// Core verifier logic that validates the TLS proof.
/// Supports both MPC and Proxy modes — the prover picks via its commit config.
///
/// `_proxy_socket_rx` is a leftover from the previous proxy plumbing
/// (`/proxy?sessionId=…`). The current `tlsn` API tunnels prover↔verifier proxy
/// traffic through the existing session multiplexer, so this channel is
/// unused. Kept on the signature to avoid rippling changes through `main.rs`
/// until that endpoint is removed.
pub async fn verifier<T: AsyncWrite + AsyncRead + Send + Unpin + 'static>(
    socket: T,
    max_sent_data: usize,
    max_recv_data: usize,
    _proxy_socket_rx: Option<oneshot::Receiver<TungsteniteStream>>,
) -> Result<(DnsName, PartialTranscript, Vec<TranscriptCommitment>), eyre::ErrReport> {
    info!(
        "Starting verification with maxSentData={}, maxRecvData={}",
        max_sent_data, max_recv_data
    );

    // Create a session with the prover
    let session = Session::new(socket.compat());
    let (driver, mut handle) = session.split();

    // Spawn the session driver to run in the background
    let driver_task = tokio::spawn(async move {
        let result = driver.await;
        match &result {
            Ok(_) => tracing::info!("verifier session driver completed normally (mux closed)"),
            Err(e) => tracing::error!("verifier session driver error: {e}"),
        }
        result
    });

    let verifier_config = VerifierConfig::builder()
        .root_store(RootCertStore::mozilla())
        .build()
        .map_err(|e| eyre!("Failed to build verifier config: {}", e))?;

    let verifier = handle
        .new_verifier(verifier_config)
        .map_err(|e| eyre!("Failed to create verifier: {}", e))?;

    info!("Starting TLS commitment protocol");

    // Run the commitment protocol — the prover's config tells us which mode.
    let verifier = match verifier
        .commit()
        .await
        .map_err(|e| eyre!("Commitment failed: {}", e))?
    {
        VerifierCommitStart::Mpc(verifier) => {
            let cfg = verifier.config();
            if cfg.max_sent_data() > max_sent_data {
                return Err(eyre!(
                    "Prover requested max_sent_data {} exceeds limit {}",
                    cfg.max_sent_data(),
                    max_sent_data
                ));
            }
            if cfg.max_recv_data() > max_recv_data {
                return Err(eyre!(
                    "Prover requested max_recv_data {} exceeds limit {}",
                    cfg.max_recv_data(),
                    max_recv_data
                ));
            }
            info!(
                "Accepting MPC TLS commitment with max_sent={}, max_recv={}",
                cfg.max_sent_data(),
                cfg.max_recv_data()
            );

            verifier
                .accept()
                .await
                .map_err(|e| eyre!("Accept failed: {}", e))?
                .run()
                .await
                .map_err(|e| eyre!("Run failed: {}", e))?
        }
        VerifierCommitStart::Proxy(verifier) => {
            let host = verifier.config().server_name().as_str().to_string();
            info!("Accepting Proxy TLS commitment for server: {}", host);

            let server_addr = format!("{}:443", host);
            let server_stream = tokio::net::TcpStream::connect(&server_addr)
                .await
                .map_err(|e| eyre!("Failed to connect to target server {}: {}", server_addr, e))?;
            info!("Connected to target server {}", server_addr);

            verifier
                .accept()
                .await
                .map_err(|e| eyre!("Accept failed: {}", e))?
                .run(server_stream.compat())
                .await
                .map_err(|e| eyre!("Run failed: {}", e))?
        }
    };

    info!("TLS connection complete, starting verification");

    // Verify the proof
    let verifier = verifier
        .verify()
        .await
        .map_err(|e| eyre!("Verification failed: {}", e))?;

    let (
        VerifierOutput {
            server_name,
            transcript,
            transcript_commitments,
            ..
        },
        verifier,
    ) = verifier
        .accept()
        .await
        .map_err(|e| eyre!("Accept verification failed: {}", e))?;

    // Close the verifier
    verifier
        .close()
        .await
        .map_err(|e| eyre!("Failed to close verifier: {}", e))?;

    // Close the session handle
    handle.close();

    // Wait for the driver to complete
    driver_task
        .await
        .map_err(|e| eyre!("Driver task failed: {}", e))?
        .map_err(|e| eyre!("Session driver error: {}", e))?;

    info!("verify() returned successfully");

    let server_name =
        server_name.ok_or_else(|| eyre!("prover should have revealed server name"))?;
    let transcript =
        transcript.ok_or_else(|| eyre!("prover should have revealed transcript data"))?;

    info!("server_name: {:?}", server_name);
    debug!("transcript: {:?}", &transcript);

    let sent = transcript.sent_unsafe().to_vec();
    let received = transcript.received_unsafe().to_vec();

    let ServerName::Dns(dns_name) = server_name;
    info!("Server name verified: {:?}", dns_name);

    info!("============================================");
    info!("Verification successful!");
    info!("============================================");

    info!("Sent data: {:?}", bytes_to_redacted_string(&sent, "\u{2588}")?);
    info!(
        "Received data: {:?}",
        bytes_to_redacted_string(&received, "\u{2588}")?
    );

    info!(
        "Hash commitments: {} (sent+recv)",
        transcript_commitments.len()
    );

    Ok((dns_name, transcript, transcript_commitments))
}

/// Compress long sequences of redacted emojis for better readability
#[allow(unused)]
fn compress_redacted_sequences(text: String) -> String {
    let re = regex::Regex::new(r"\u{2588}{5,}").unwrap();
    re.replace_all(&text, "\u{2588}\u{2026}\u{2588}").to_string()
}

/// Render redacted bytes as block characters.
fn bytes_to_redacted_string(bytes: &[u8], to: &str) -> Result<String, eyre::ErrReport> {
    Ok(String::from_utf8(bytes.to_vec())
        .map_err(|err| eyre!("Failed to parse bytes to redacted string: {err}"))?
        .replace('\0', to))
}
