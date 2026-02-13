use eyre::eyre;
use tlsn::{
    config::{tls_commit::TlsCommitProtocolConfig, verifier::VerifierConfig},
    connection::{DnsName, ServerName},
    transcript::PartialTranscript,
    verifier::VerifierOutput,
    webpki::RootCertStore,
    Session,
};
use tokio::io::{AsyncRead, AsyncWrite};
use tokio_util::compat::TokioAsyncReadCompatExt;
use tracing::{debug, info};

/// Core verifier logic that validates the TLS proof
/// Returns: (sent_bytes, recv_bytes, sent_string, recv_string)
/// - sent_bytes/recv_bytes: Raw transcript bytes (with \0 for unrevealed)
/// - sent_string/recv_string: Display strings (with 🙈 for unrevealed)
pub async fn verifier<T: AsyncWrite + AsyncRead + Send + Unpin + 'static>(
    socket: T,
    max_sent_data: usize,
    max_recv_data: usize,
) -> Result<(DnsName, PartialTranscript), eyre::ErrReport> {
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
            Ok(_) => tracing::warn!("verifier session driver completed normally (mux closed)"),
            Err(e) => tracing::error!("verifier session driver error: {e}"),
        }
        result
    });

    // Create verifier config with Mozilla root certificates for TLS verification
    let verifier_config = VerifierConfig::builder()
        .root_store(RootCertStore::mozilla())
        .build()
        .map_err(|e| eyre!("Failed to build verifier config: {}", e))?;

    let verifier = handle
        .new_verifier(verifier_config)
        .map_err(|e| eyre!("Failed to create verifier: {}", e))?;

    info!("Starting TLS commitment protocol");

    // Run the commitment protocol
    let verifier = verifier
        .commit()
        .await
        .map_err(|e| eyre!("Commitment failed: {}", e))?;

    // Check the proposed configuration
    let request = verifier.request();
    let TlsCommitProtocolConfig::Mpc(mpc_config) = request.protocol() else {
        return Err(eyre!("Only MPC protocol is supported"));
    };

    // Validate the proposed configuration
    if mpc_config.max_sent_data() > max_sent_data {
        return Err(eyre!(
            "Prover requested max_sent_data {} exceeds limit {}",
            mpc_config.max_sent_data(),
            max_sent_data
        ));
    }
    if mpc_config.max_recv_data() > max_recv_data {
        return Err(eyre!(
            "Prover requested max_recv_data {} exceeds limit {}",
            mpc_config.max_recv_data(),
            max_recv_data
        ));
    }

    info!(
        "Accepting TLS commitment with max_sent={}, max_recv={}",
        mpc_config.max_sent_data(),
        mpc_config.max_recv_data()
    );

    // Accept and run the commitment protocol
    let verifier = verifier
        .accept()
        .await
        .map_err(|e| eyre!("Accept failed: {}", e))?
        .run()
        .await
        .map_err(|e| eyre!("Run failed: {}", e))?;

    info!("TLS connection complete, starting verification (waiting for prove request from prover)");

    // Verify the proof
    let verifier = verifier
        .verify()
        .await
        .map_err(|e| eyre!("Verification failed: {} - this likely means the prover's mux connection closed before sending the prove request", e))?;

    let (
        VerifierOutput {
            server_name,
            transcript,
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

    info!("verify() returned successfully - prover sent all data");

    let server_name =
        server_name.ok_or_else(|| eyre!("prover should have revealed server name"))?;
    let transcript =
        transcript.ok_or_else(|| eyre!("prover should have revealed transcript data"))?;

    info!("server_name: {:?}", server_name);
    debug!("transcript: {:?}", &transcript);

    // Extract sent and received data
    info!("Extracting transcript data...");
    let sent = transcript.sent_unsafe().to_vec();
    let received = transcript.received_unsafe().to_vec();

    // Check Session info: server name.
    let ServerName::Dns(dns_name) = server_name;
    info!("Server name verified: {:?}", dns_name);

    info!("============================================");
    info!("✅ MPC-TLS Verification successful!");
    info!("============================================");

    info!("Sent data: {:?}", bytes_to_redacted_string(&sent, "█")?);
    info!(
        "Received data: {:?}",
        bytes_to_redacted_string(&received, "█")?
    );

    // Return both raw bytes (for range extraction) and display strings (for logging)
    Ok((dns_name, transcript))
}

/// Compress long sequences of redacted emojis for better readability
#[allow(unused)]
fn compress_redacted_sequences(text: String) -> String {
    let re = regex::Regex::new(r"█{5,}").unwrap();
    re.replace_all(&text, "█…█").to_string()
}

/// Render redacted bytes as `🙈`.
fn bytes_to_redacted_string(bytes: &[u8], to: &str) -> Result<String, eyre::ErrReport> {
    Ok(String::from_utf8(bytes.to_vec())
        .map_err(|err| eyre!("Failed to parse bytes to redacted string: {err}"))?
        .replace('\0', to))
}
